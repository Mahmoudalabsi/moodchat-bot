import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { WA_CONFIG } from '@/whatsapp-cloud';

/**
 * WhatsApp Status - GET /api/whatsapp-status
 * Returns WhatsApp Cloud API bot status
 */
export async function GET() {
  try {
    const [readyConfig, heartbeatConfig] = await Promise.all([
      db.botConfig.findUnique({ where: { key: 'wa_cloud_ready' } }),
      db.botConfig.findUnique({ where: { key: 'wa_cloud_heartbeat' } }),
    ]);

    const isReady = readyConfig?.value === 'true';
    const lastHeartbeat = heartbeatConfig?.value ? new Date(heartbeatConfig.value) : null;
    const secondsSinceHeartbeat = lastHeartbeat
      ? Math.round((Date.now() - lastHeartbeat.getTime()) / 1000)
      : null;

    // WhatsApp users (userId >= 2000000)
    const waUsers = await db.telegramUser.count({
      where: { userId: { gte: 2000000 } },
    });

    // WhatsApp messages
    const waMessages = await db.message.count({
      where: { userId: { gte: 2000000 } },
    });

    const isConfigured = !!(WA_CONFIG.accessToken && WA_CONFIG.phoneNumberId);

    return NextResponse.json({
      configured: isConfigured,
      connected: isReady,
      lastHeartbeat: heartbeatConfig?.value || null,
      secondsSinceHeartbeat,
      verifyToken: WA_CONFIG.verifyToken,
      phoneNumberId: WA_CONFIG.phoneNumberId ? '***' + WA_CONFIG.phoneNumberId.slice(-4) : null,
      webhookUrl: '/api/whatsapp/webhook',
      stats: {
        users: waUsers,
        messages: waMessages,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
