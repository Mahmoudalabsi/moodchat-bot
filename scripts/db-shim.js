/**
 * Prisma-compatible shim using @neondatabase/serverless
 *
 * This shim exposes a PrismaClient-like object that supports only the calls
 * actually used by worker-continuous.js:
 *
 *   db.message.create({ data: { ... } })
 *   db.message.update({ where: { id }, data: { ... } })
 *   db.message.findMany({ where: { ... }, orderBy: { timestamp }, take })
 *   db.botConfig.findUnique({ where: { key } })
 *   db.$queryRaw`SELECT 1`
 *   db.$disconnect()
 *
 * This avoids the prisma generate step which times out in this environment.
 */

const { neon } = require('@neondatabase/serverless');

// Lightweight cuid() generator (compatible with Prisma's cuid format)
function cuid() {
  const ts = Date.now().toString(36);
  const rand = () => Math.random().toString(36).slice(2, 10);
  const counter = (cuid.counter = (cuid.counter || 0) + 1).toString(36);
  return `c` + ts + counter + rand().slice(0, 4) + rand().slice(0, 4);
}

// Wrap a sql function with retry on transient errors (Neon serverless HTTP can fail occasionally)
function withRetry(fn, maxRetries = 3) {
  return async function (...args) {
    let lastErr;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn.apply(this, args);
      } catch (e) {
        lastErr = e;
        const msg = e.message || '';
        // Retry on network errors, fetch failures, and connection issues
        if (msg.includes('fetch failed') ||
            msg.includes('ECONNRESET') ||
            msg.includes('ETIMEDOUT') ||
            msg.includes('ENOTFOUND') ||
            msg.includes('network') ||
            msg.includes('connection') ||
            msg.includes('aborted')) {
          // Exponential backoff: 200ms, 500ms, 1500ms
          const wait = 200 * Math.pow(2.5, i);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        // Non-retriable error, throw immediately
        throw e;
      }
    }
    throw lastErr;
  };
}

class PrismaShim {
  constructor(connectionString) {
    // Wrap neon sql with retry logic
    const rawSql = neon(connectionString);
    this._sql = withRetry(rawSql, 3);
    this.message = {
      _sql: this._sql,
      async create({ data }) {
        // Auto-generate id if not provided (Prisma's @default(cuid()))
        if (!data.id) data.id = cuid();
        // Set timestamp if not provided (Prisma's @default(now()))
        if (!data.timestamp) data.timestamp = new Date();
        if (data.timestamp instanceof Date) data.timestamp = data.timestamp.toISOString();
        const cols = [];
        const vals = [];
        const ph = [];
        let i = 1;
        for (const [k, v] of Object.entries(data)) {
          cols.push(`"${k}"`);
          vals.push(v);
          ph.push(`$${i++}`);
        }
        const q = `INSERT INTO "Message" (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING id`;
        const rows = await this._sql(q, vals);
        return { id: rows[0]?.id || data.id };
      },
      async update({ where, data }) {
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(data)) {
          if (v instanceof Date) v = v.toISOString();
          sets.push(`"${k}" = $${i++}`);
          vals.push(v);
        }
        vals.push(where.id);
        const q = `UPDATE "Message" SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`;
        await this._sql(q, vals);
        return { id: where.id };
      },
      async findMany({ where, orderBy, take }) {
        const conds = [];
        const vals = [];
        let i = 1;
        if (where) {
          for (const [k, v] of Object.entries(where)) {
            if (v === undefined || v === null) continue;
            if (k === 'role' && v && typeof v === 'object' && 'in' in v) {
              const placeholders = v.in.map((_, idx) => `$${i++}`);
              vals.push(...v.in);
              conds.push(`"role" IN (${placeholders.join(', ')})`);
            } else {
              vals.push(v);
              conds.push(`"${k}" = $${i++}`);
            }
          }
        }
        const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const orderClause = orderBy && orderBy.timestamp
          ? `ORDER BY "timestamp" ${orderBy.timestamp.toUpperCase()}`
          : '';
        const limitClause = take ? `LIMIT ${parseInt(take, 10)}` : '';
        const q = `SELECT * FROM "Message" ${whereClause} ${orderClause} ${limitClause}`;
        return await this._sql(q, vals);
      },
    };
    this.botConfig = {
      _sql: this._sql,
      async findUnique({ where }) {
        const rows = await this._sql`SELECT * FROM "BotConfig" WHERE key = ${where.key} LIMIT 1`;
        return rows[0] || null;
      },
    };
  }

  async $queryRaw(strings, ...vals) {
    // Simple template literal support
    let q = strings[0];
    let i = 1;
    for (let v of vals) {
      q += `$${i++}` + (strings[i] ? strings[i] : '');
    }
    return await this._sql(q, vals);
  }

  async $disconnect() {
    // Neon serverless uses HTTP, no persistent connection to close
    return;
  }
}

module.exports = { PrismaShim };
