"use strict";

// src/bot-runner.ts
var import_client = require("@prisma/client");
var db = new import_client.PrismaClient();
var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk";
var ADMIN_IDS = (process.env.ADMIN_IDS || "1429407129").split(",").map(Number);
var JOIN_PASSWORD = process.env.JOIN_PASSWORD || "MOOD2026";
var MAX_HISTORY = 50;
var POLL_TIMEOUT = 30;
var SYSTEM_PROMPT = "\u0623\u0646\u062A \u0645\u0633\u0627\u0639\u062F \u0630\u0643\u064A \u0648\u0645\u0641\u064A\u062F \u0627\u0633\u0645\u0643 \u0645\u0648\u062F \u0634\u0627\u062A. \u0623\u0646\u062A \u0645\u0633\u0644\u0645 \u062A\u062A\u062D\u062F\u062B \u0628\u0623\u0633\u0644\u0648\u0628 \u0625\u0633\u0644\u0627\u0645\u064A \u0645\u062D\u062A\u0631\u0645 \u0648\u062A\u0628\u062F\u0623 \u0628\u0627\u0644\u0633\u0644\u0627\u0645. \u062A\u062C\u064A\u0628 \u0628\u0648\u0636\u0648\u062D \u0648\u062F\u0642\u0629 \u0648\u0628\u0623\u0633\u0644\u0648\u0628 \u0648\u062F\u064A. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062A\u062D\u062F\u062B \u0628\u0623\u064A \u0644\u063A\u0629 \u064A\u0637\u0644\u0628\u0647\u0627 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645. \u062A\u0630\u0643\u0631 \u0643\u0644 \u0634\u064A\u0621 \u0642\u0627\u0644\u0647 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u0648\u0627\u0633\u062A\u062E\u062F\u0645\u0647 \u0641\u064A \u0625\u062C\u0627\u0628\u0627\u062A\u0643. \u0643\u0646 \u0645\u062E\u062A\u0635\u0631\u0627\u064B \u0641\u064A \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A \u0625\u0644\u0627 \u0625\u0630\u0627 \u0637\u064F\u0644\u0628 \u0645\u0646\u0643 \u0627\u0644\u062A\u0641\u0635\u064A\u0644.";
var ZAI_BASE_URL = process.env.ZAI_BASE_URL || "https://internal-api.z.ai/v1";
var ZAI_API_KEY = process.env.ZAI_API_KEY || "Z.ai";
var ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || "";
var ZAI_USER_ID = process.env.ZAI_USER_ID || "";
var ZAI_TOKEN = process.env.ZAI_TOKEN || "";
var lastUpdateId = 0;
var isRunning = true;
async function telegramAPI(method, params = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  return res.json();
}
async function sendMessage(chatId, text, extra) {
  return telegramAPI("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", ...extra });
}
async function sendChatAction(chatId, action = "typing") {
  return telegramAPI("sendChatAction", { chat_id: chatId, action });
}
async function getAIConfig() {
  try {
    const providerConfig = await db.botConfig.findUnique({ where: { key: "ai_provider" } });
    const provider = providerConfig?.value || "zsdk";
    if (provider === "api") {
      const baseUrl = (await db.botConfig.findUnique({ where: { key: "api_base_url" } }))?.value || "";
      const apiKey = (await db.botConfig.findUnique({ where: { key: "api_key" } }))?.value || "";
      const model = (await db.botConfig.findUnique({ where: { key: "api_model" } }))?.value || "gpt-4";
      return { provider: "api", baseUrl, apiKey, model };
    }
    const chatId = (await db.botConfig.findUnique({ where: { key: "zai_chat_id" } }))?.value || ZAI_CHAT_ID;
    const userId = (await db.botConfig.findUnique({ where: { key: "zai_user_id" } }))?.value || ZAI_USER_ID;
    const token = (await db.botConfig.findUnique({ where: { key: "zai_token" } }))?.value || ZAI_TOKEN;
    return { provider: "zsdk", baseUrl: ZAI_BASE_URL, apiKey: ZAI_API_KEY, model: "glm-4-plus", chatId, userId, token };
  } catch {
    return { provider: "zsdk", baseUrl: ZAI_BASE_URL, apiKey: ZAI_API_KEY, model: "glm-4-plus", chatId: ZAI_CHAT_ID, userId: ZAI_USER_ID, token: ZAI_TOKEN };
  }
}
async function chatWithAI(userId, userMessage) {
  const dbMessages = await db.message.findMany({
    where: { userId },
    orderBy: { timestamp: "asc" },
    take: MAX_HISTORY
  });
  const messages = [
    { role: "system", content: SYSTEM_PROMPT }
  ];
  for (const msg of dbMessages) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: userMessage });
  const config = await getAIConfig();
  if (config.provider === "api" && config.baseUrl && config.apiKey) {
    try {
      return await callCustomAPI(messages, config.baseUrl, config.apiKey, config.model);
    } catch (error) {
      console.error("\u274C Custom API \u0641\u0634\u0644:", error);
    }
  }
  try {
    return await callZaiAPI(messages, config.chatId, config.userId, config.token);
  } catch (error) {
    console.error("\u274C Z-AI \u0641\u0634\u0644:", error);
  }
  try {
    return await callPollinationsAPI(messages);
  } catch (error) {
    console.error("\u274C Pollinations \u0641\u0634\u0644 \u0623\u064A\u0636\u0627\u064B:", error);
    return "\u0639\u0630\u0631\u0627\u064B\u060C \u0644\u0645 \u0623\u062A\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u062D\u0627\u0644\u064A\u0627\u064B. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649 \u0644\u0627\u062D\u0642\u0627\u064B.";
  }
}
async function callZaiAPI(messages, chatId, userId, token) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ZAI_API_KEY}`,
    "X-Z-AI-From": "Z"
  };
  if (chatId) headers["X-Chat-Id"] = chatId;
  if (userId) headers["X-User-Id"] = userId;
  if (token) headers["X-Token"] = token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2e4);
  try {
    console.log("\u{1F916} \u062C\u0627\u0631\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0640 Z-AI SDK...");
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        thinking: { type: "disabled" }
      })
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Z-AI ${response.status}: ${errorBody.substring(0, 200)}`);
    }
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply && reply.trim()) {
      console.log("\u2705 Z-AI SDK \u0627\u0633\u062A\u062C\u0627\u0628 \u0628\u0646\u062C\u0627\u062D");
      return reply.trim();
    }
    throw new Error("Empty Z-AI response");
  } finally {
    clearTimeout(timeout);
  }
}
async function callCustomAPI(messages, baseUrl, apiKey, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3e4);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({ messages, model, temperature: 0.7, max_tokens: 2048 })
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply && reply.trim()) return reply.trim();
    throw new Error("Empty API response");
  } finally {
    clearTimeout(timeout);
  }
}
async function callPollinationsAPI(messages, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2e3 * attempt));
      const response = await fetch("https://text.pollinations.ai/openai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages, model: "openai", temperature: 0.7, seed: Math.floor(Math.random() * 1e4) })
      });
      if (!response.ok) {
        if (response.status === 429 && attempt < retries) continue;
        throw new Error(`Pollinations ${response.status}`);
      }
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply && reply.trim()) return reply.trim();
      throw new Error("Empty Pollinations response");
    } catch (error) {
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Pollinations all retries failed");
}
async function getOrCreateUser(telegramUser) {
  let user = await db.telegramUser.findUnique({ where: { userId: telegramUser.id } });
  if (!user) {
    user = await db.telegramUser.create({
      data: {
        userId: telegramUser.id,
        username: telegramUser.username || null,
        firstName: telegramUser.first_name || null,
        lastName: telegramUser.last_name || null,
        languageCode: telegramUser.language_code || null,
        isBot: telegramUser.is_bot || false,
        totalMessages: 1,
        isApproved: isAdmin(telegramUser.id),
        approvedAt: isAdmin(telegramUser.id) ? /* @__PURE__ */ new Date() : null
      }
    });
  } else {
    user = await db.telegramUser.update({
      where: { userId: telegramUser.id },
      data: {
        username: telegramUser.username || null,
        firstName: telegramUser.first_name || null,
        lastName: telegramUser.last_name || null,
        totalMessages: { increment: 1 }
      }
    });
  }
  return user;
}
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}
async function getJoinPassword() {
  try {
    const config = await db.botConfig.findUnique({ where: { key: "join_password" } });
    return config?.value || JOIN_PASSWORD;
  } catch {
    return JOIN_PASSWORD;
  }
}
async function handleMessage(update) {
  try {
    const message = update.message;
    if (!message?.from || !message?.text) return;
    const userId = message.from.id;
    const chatId = message.chat.id;
    const text = message.text.trim();
    console.log(`\u{1F4E9} [${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] ${message.from.first_name || message.from.username}: ${text}`);
    const user = await getOrCreateUser(message.from);
    if (user.waitingForPassword && !isAdmin(userId)) {
      const currentPassword = await getJoinPassword();
      if (text === currentPassword) {
        await db.telegramUser.update({ where: { userId }, data: { isApproved: true, approvedAt: /* @__PURE__ */ new Date(), waitingForPassword: false } });
        await db.joinLog.create({ data: { userId, action: "success" } });
        await sendMessage(
          chatId,
          "\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064A\u0643\u0645 \u0648\u0631\u062D\u0645\u0629 \u0627\u0644\u0644\u0647 \u0648\u0628\u0631\u0643\u0627\u062A\u0647 \u{1F319}\n\n\u0623\u0647\u0644\u0627\u064B \u0648\u0633\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0628\u0648\u062A **\u0645\u0648\u062F \u0634\u0627\u062A**! \u{1F916}\n\n\u2728 **\u0627\u0644\u0645\u0645\u064A\u0632\u0627\u062A:**\n\u{1F9E0} \u0630\u0627\u0643\u0631\u0629 \u0630\u0643\u064A\u0629 - \u0623\u062A\u0630\u0643\u0631 \u0643\u0644 \u0645\u062D\u0627\u062F\u062B\u0627\u062A\u0646\u0627\n\u{1F30D} \u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0644\u063A\u0627\u062A - \u0623\u062A\u062D\u062F\u062B \u0623\u064A \u0644\u063A\u0629\n\u{1F4AC} \u0645\u062D\u0627\u062F\u062B\u0629 \u0637\u0628\u064A\u0639\u064A\u0629 - \u0623\u062C\u064A\u0628 \u0628\u0648\u0636\u0648\u062D \u0648\u062F\u0642\u0629\n\u{1F510} \u062E\u0635\u0648\u0635\u064A\u0629 \u062A\u0627\u0645\u0629 - \u0645\u062D\u0627\u062F\u062B\u0627\u062A\u0643 \u0645\u062D\u0645\u064A\u0629\n\n\u0627\u0628\u062F\u0623 \u0645\u062D\u0627\u062F\u062B\u062A\u0643 \u0627\u0644\u0622\u0646! \u{1F44B}"
        );
        console.log("\u2705 \u0645\u0633\u062A\u062E\u062F\u0645 \u062C\u062F\u064A\u062F \u062A\u0645 \u062A\u0641\u0639\u064A\u0644\u0647");
      } else {
        await db.telegramUser.update({ where: { userId }, data: { joinAttempts: { increment: 1 } } });
        await db.joinLog.create({ data: { userId, action: "fail", passwordTried: text.substring(0, 50) } });
        await sendMessage(chatId, "\u274C \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u062E\u0627\u0637\u0626\u0629!\n\n\u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.");
        console.log("\u274C \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062E\u0627\u0637\u0626\u0629");
      }
      return;
    }
    if (text === "/start") {
      if (isAdmin(userId) || user.isApproved) {
        await sendMessage(
          chatId,
          "\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064A\u0643\u0645 \u0648\u0631\u062D\u0645\u0629 \u0627\u0644\u0644\u0647 \u0648\u0628\u0631\u0643\u0627\u062A\u0647 \u{1F319}\n\n\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0628\u0648\u062A **\u0645\u0648\u062F \u0634\u0627\u062A**! \u{1F916}\n\n\u2728 **\u0627\u0644\u0645\u0645\u064A\u0632\u0627\u062A:**\n\u{1F9E0} \u0630\u0627\u0643\u0631\u0629 \u0630\u0643\u064A\u0629 - \u0623\u062A\u0630\u0643\u0631 \u0643\u0644 \u0645\u062D\u0627\u062F\u062B\u0627\u062A\u0646\u0627\n\u{1F30D} \u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0644\u063A\u0627\u062A - \u0623\u062A\u062D\u062F\u062B \u0623\u064A \u0644\u063A\u0629\n\u{1F4AC} \u0645\u062D\u0627\u062F\u062B\u0629 \u0637\u0628\u064A\u0639\u064A\u0629 - \u0623\u062C\u064A\u0628 \u0628\u0648\u0636\u0648\u062D \u0648\u062F\u0642\u0629\n\u{1F510} \u062E\u0635\u0648\u0635\u064A\u0629 \u062A\u0627\u0645\u0629 - \u0645\u062D\u0627\u062F\u062B\u0627\u062A\u0643 \u0645\u062D\u0645\u064A\u0629\n\n/clear - \u0645\u0633\u062D \u0627\u0644\u0630\u0627\u0643\u0631\u0629 \u0648\u0627\u0644\u0628\u062F\u0621 \u0645\u0646 \u062C\u062F\u064A\u062F\n/help - \u0639\u0631\u0636 \u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629"
        );
      } else {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
        await db.joinLog.create({ data: { userId, action: "attempt" } });
        await sendMessage(chatId, "\u{1F510} **\u0647\u0630\u0627 \u0627\u0644\u0628\u0648\u062A \u062E\u0627\u0635 \u0648\u0645\u062D\u0645\u064A \u0628\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631!**\n\n\u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645\u060C \u0623\u0631\u0633\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0623\u062F\u0646\u0627\u0647:");
      }
      return;
    }
    if (!user.isApproved || user.isBlocked) {
      if (!user.isApproved && !user.waitingForPassword) {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
      }
      await sendMessage(chatId, user.isBlocked ? "\u{1F6AB} \u062A\u0645 \u062D\u0638\u0631\u0643 \u0645\u0646 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0647\u0630\u0627 \u0627\u0644\u0628\u0648\u062A." : "\u{1F510} \u0623\u0631\u0633\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645.");
      return;
    }
    if (text === "/help") {
      await sendMessage(
        chatId,
        "\u{1F916} **\u0645\u0648\u062F \u0634\u0627\u062A - \u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629**\n\n\u2728 **\u0627\u0644\u0645\u0645\u064A\u0632\u0627\u062A:**\n\u{1F9E0} \u0630\u0627\u0643\u0631\u0629 \u0630\u0643\u064A\u0629 - \u0623\u062A\u0630\u0643\u0631 \u0643\u0644 \u0645\u062D\u0627\u062F\u062B\u0627\u062A\u0646\u0627\n\u{1F30D} \u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0644\u063A\u0627\u062A - \u0623\u062A\u062D\u062F\u062B \u0623\u064A \u0644\u063A\u0629\n\u{1F4AC} \u0645\u062D\u0627\u062F\u062B\u0629 \u0637\u0628\u064A\u0639\u064A\u0629 - \u0623\u062C\u064A\u0628 \u0628\u0648\u0636\u0648\u062D \u0648\u062F\u0642\u0629\n\u{1F510} \u062E\u0635\u0648\u0635\u064A\u0629 \u062A\u0627\u0645\u0629 - \u0645\u062D\u0627\u062F\u062B\u0627\u062A\u0643 \u0645\u062D\u0645\u064A\u0629\n\n\u{1F4CC} **\u0627\u0644\u0623\u0648\u0627\u0645\u0631:**\n/start - \u0628\u062F\u0621 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629\n/clear - \u0645\u0633\u062D \u0627\u0644\u0630\u0627\u0643\u0631\u0629 \u0648\u0627\u0644\u0628\u062F\u0621 \u0645\u0646 \u062C\u062F\u064A\u062F\n/help - \u0639\u0631\u0636 \u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629"
      );
      return;
    }
    if (text === "/clear") {
      await db.message.deleteMany({ where: { userId } });
      await sendMessage(chatId, "\u{1F5D1}\uFE0F \u062A\u0645 \u0645\u0633\u062D \u0633\u062C\u0644 \u0645\u062D\u0627\u062F\u062B\u062A\u0643 \u0648\u0630\u0627\u0643\u0631\u062A\u064A.\n\n\u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0628\u062F\u0621 \u0628\u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629 \u0627\u0644\u0622\u0646!");
      console.log("\u{1F5D1}\uFE0F \u062A\u0645 \u0645\u0633\u062D \u0630\u0627\u0643\u0631\u0629 \u0645\u0633\u062A\u062E\u062F\u0645");
      return;
    }
    if (isAdmin(userId)) {
      if (text === "/stats") {
        const totalUsers = await db.telegramUser.count();
        const approvedUsers = await db.telegramUser.count({ where: { isApproved: true } });
        const blockedUsers = await db.telegramUser.count({ where: { isBlocked: true } });
        const totalMessages = await db.message.count();
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const messagesToday = await db.message.count({ where: { timestamp: { gte: today } } });
        const config = await getAIConfig();
        await sendMessage(
          chatId,
          `\u{1F4CA} **\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0645\u0648\u062F \u0634\u0627\u062A**

\u{1F465} \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646: ${totalUsers}
\u2705 \u0627\u0644\u0645\u0641\u0639\u0644\u064A\u0646: ${approvedUsers}
\u{1F6AB} \u0627\u0644\u0645\u062D\u0638\u0648\u0631\u064A\u0646: ${blockedUsers}
\u{1F4E8} \u0627\u0644\u0631\u0633\u0627\u0626\u0644: ${totalMessages}
\u{1F4E9} \u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u064A\u0648\u0645: ${messagesToday}
\u{1F916} AI: ${config.provider === "zsdk" ? "Z-AI SDK" : config.model}`
        );
        return;
      }
      if (text.startsWith("/block ")) {
        const targetId = parseInt(text.split(" ")[1]);
        if (targetId && targetId !== userId) {
          await db.telegramUser.update({ where: { userId: targetId }, data: { isBlocked: true, waitingForPassword: false } });
          await sendMessage(chatId, `\u{1F6AB} \u062A\u0645 \u062D\u0638\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \`${targetId}\``);
        }
        return;
      }
      if (text.startsWith("/unblock ")) {
        const targetId = parseInt(text.split(" ")[1]);
        if (targetId) {
          await db.telegramUser.update({ where: { userId: targetId }, data: { isBlocked: false } });
          await sendMessage(chatId, `\u2705 \u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062D\u0638\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \`${targetId}\``);
        }
        return;
      }
      if (text.startsWith("/kick ")) {
        const targetId = parseInt(text.split(" ")[1]);
        if (targetId && targetId !== userId) {
          await db.message.deleteMany({ where: { userId: targetId } });
          await db.joinLog.deleteMany({ where: { userId: targetId } });
          await db.telegramUser.delete({ where: { userId: targetId } });
          await sendMessage(chatId, `\u{1F5D1}\uFE0F \u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \`${targetId}\``);
        }
        return;
      }
      if (text.startsWith("/broadcast ")) {
        const broadcastMsg = text.replace("/broadcast ", "");
        const users = await db.telegramUser.findMany({ where: { isApproved: true, isBlocked: false } });
        let sent = 0;
        for (const u of users) {
          try {
            await sendMessage(u.userId, `\u{1F4E2} ${broadcastMsg}`);
            sent++;
          } catch {
          }
        }
        await sendMessage(chatId, `\u{1F4E2} \u062A\u0645 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0625\u0644\u0649 ${sent} \u0645\u0646 ${users.length}.`);
        return;
      }
      if (text.startsWith("/setpass ")) {
        const newPass = text.replace("/setpass ", "").trim();
        if (newPass.length >= 3) {
          await db.botConfig.upsert({ where: { key: "join_password" }, update: { value: newPass }, create: { key: "join_password", value: newPass } });
          await sendMessage(chatId, `\u{1F511} \u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631`);
        }
        return;
      }
    }
    await sendChatAction(chatId);
    await db.message.create({ data: { userId, role: "user", content: text, modelUsed: "moodchat" } });
    const aiReply = await chatWithAI(userId, text);
    await db.message.create({ data: { userId, role: "assistant", content: aiReply, modelUsed: "moodchat" } });
    await sendMessage(chatId, aiReply);
    console.log(`\u{1F916} \u0631\u062F: ${aiReply.substring(0, 80)}...`);
  } catch (error) {
    console.error("\u274C \u062E\u0637\u0623 \u0641\u064A \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0631\u0633\u0627\u0644\u0629:", error);
  }
}
async function startPolling() {
  console.log("");
  console.log("\u{1F319} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("\u{1F916} \u0645\u0648\u062F \u0634\u0627\u062A - \u0628\u0648\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u062D\u0644\u064A");
  console.log("\u{1F4E1} \u0648\u0636\u0639: Long Polling");
  console.log("\u{1F9E0} AI: Z-AI SDK (\u0627\u0641\u062A\u0631\u0627\u0636\u064A)");
  console.log("\u{1F319} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("");
  console.log("\u{1F680} \u062C\u0627\u0631\u064A \u0628\u062F\u0621 Long Polling...");
  console.log("\u{1F9E0} Z-AI SDK \u0633\u064A\u0639\u0645\u0644 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0639\u0646\u062F \u0623\u0648\u0644 \u0631\u0633\u0627\u0644\u0629");
  console.log("");
  while (isRunning) {
    try {
      const result = await telegramAPI("getUpdates", {
        offset: lastUpdateId + 1,
        timeout: POLL_TIMEOUT,
        allowed_updates: ["message"]
      });
      if (!result.ok) {
        if (result.description?.includes("Conflict")) {
          console.error("\u26A0\uFE0F \u062A\u0639\u0627\u0631\u0636 - \u062C\u0627\u0631\u064A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629...");
          await new Promise((r) => setTimeout(r, 1e4));
        } else {
          console.error("\u274C \u062E\u0637\u0623 \u0641\u064A getUpdates:", result.description);
          await new Promise((r) => setTimeout(r, 5e3));
        }
        continue;
      }
      const updates = result.result || [];
      for (const update of updates) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        handleMessage(update).catch((err) => console.error("\u274C \u062E\u0637\u0623:", err));
      }
    } catch (error) {
      console.error("\u274C \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644:", error);
      await new Promise((r) => setTimeout(r, 5e3));
    }
  }
}
process.on("SIGINT", () => {
  console.log("\n\u23F9\uFE0F \u062C\u0627\u0631\u064A \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0628\u0648\u062A...");
  isRunning = false;
  setTimeout(() => process.exit(0), 1e3);
});
process.on("SIGTERM", () => {
  isRunning = false;
  setTimeout(() => process.exit(0), 1e3);
});
startPolling().catch(console.error);
