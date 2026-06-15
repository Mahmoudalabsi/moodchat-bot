/**
 * Config API - GET /api/config & PUT /api/config
 * إعدادات البوت: مزود AI، API keys، كلمة المرور
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const configs = await db.botConfig.findMany();
    const configMap: Record<string, string> = {};
    for (const c of configs) {
      configMap[c.key] = c.value;
    }

    return NextResponse.json({
      ai_provider: configMap.ai_provider || 'zsdk',
      api_base_url: configMap.api_base_url || '',
      api_key: configMap.api_key ? '••••••••' : '',
      api_key_raw: configMap.api_key || '',
      api_model: configMap.api_model || 'gpt-4',
      zai_chat_id: configMap.zai_chat_id || configMap.ZAI_CHAT_ID || '',
      zai_user_id: configMap.zai_user_id || configMap.ZAI_USER_ID || '',
      zai_token: configMap.zai_token || configMap.ZAI_TOKEN ? '••••••••' : '',
      zai_token_raw: configMap.zai_token || configMap.ZAI_TOKEN || '',
      join_password: configMap.join_password || '',
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const fields: Record<string, string> = {};
    if (body.ai_provider !== undefined) fields.ai_provider = body.ai_provider;
    if (body.api_base_url !== undefined) fields.api_base_url = body.api_base_url;
    if (body.api_key !== undefined && body.api_key !== '••••••••') fields.api_key = body.api_key;
    if (body.api_model !== undefined) fields.api_model = body.api_model;
    if (body.zai_chat_id !== undefined) fields.zai_chat_id = body.zai_chat_id;
    if (body.zai_user_id !== undefined) fields.zai_user_id = body.zai_user_id;
    if (body.zai_token !== undefined && body.zai_token !== '••••••••') fields.zai_token = body.zai_token;
    if (body.join_password !== undefined) fields.join_password = body.join_password;

    for (const [key, value] of Object.entries(fields)) {
      await db.botConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
