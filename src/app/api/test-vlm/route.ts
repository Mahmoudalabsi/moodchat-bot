import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';

export async function GET(request: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => { console.log(msg); logs.push(msg); };

  try {
    // Step 1: Get a test file from Telegram (admin's profile photo)
    log('Step 1: Getting test file from Telegram...');
    const testFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=1429407129&limit=1`, {
      signal: AbortSignal.timeout(10000),
    });
    const testFileData = await testFileRes.json();
    
    if (!testFileData?.ok || !testFileData?.result?.photos?.[0]) {
      log('No test photo available');
      return NextResponse.json({ logs, error: 'No test photo' });
    }

    const photos = testFileData.result.photos[0];
    const smallest = photos[0]; // Use smallest for speed
    const fileId = smallest.file_id;
    log(`Got photo: fileId=${fileId}, sizes=${photos.length}`);

    // Step 2: Get file path
    log('Step 2: Getting file path...');
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`, {
      signal: AbortSignal.timeout(10000),
    });
    const fileData = await fileRes.json();
    
    if (!fileData?.ok || !fileData?.result?.file_path) {
      log(`getFile failed: ${JSON.stringify(fileData).substring(0, 200)}`);
      return NextResponse.json({ logs, error: 'getFile failed' });
    }

    const filePath = fileData.result.file_path;
    const fileSize = fileData.result.file_size;
    log(`File path: ${filePath}, size: ${fileSize}`);

    // Step 3: Download image as base64
    log('Step 3: Downloading image as base64...');
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    const downloadRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(20000) });
    
    if (!downloadRes.ok) {
      log(`Download failed: ${downloadRes.status}`);
      return NextResponse.json({ logs, error: 'Download failed' });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    log(`Downloaded: ${buffer.length} bytes, base64: ${base64.length} chars`);

    // Determine mime type
    const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeTypeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp',
    };
    const mimeType = mimeTypeMap[ext] || 'image/jpeg';
    log(`Mime type: ${mimeType}`);

    // Step 4: Test Z-AI SDK VLM
    log('Step 4: Testing Z-AI SDK VLM...');
    try {
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAIClass = ZAIModule.default;
      log(`ZAI module loaded, type: ${typeof ZAIClass}`);

      const zai = await ZAIClass.create();
      log('ZAI instance created');

      const completion = await zai.chat.completions.createVision({
        model: 'glm-4v-plus',
        messages: [
          { role: 'system', content: 'أنت مساعد ذكي.' },
          { role: 'user', content: [
            { type: 'text', text: 'صف هذه الصورة باختصار' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ] },
        ],
        thinking: { type: 'disabled' },
      });

      const reply = completion?.choices?.[0]?.message?.content;
      if (reply?.trim()) {
        log(`VLM SUCCESS: ${reply.substring(0, 200)}`);
      } else {
        log(`VLM empty response: ${JSON.stringify(completion).substring(0, 300)}`);
      }
    } catch (vlmErr: any) {
      log(`VLM FAILED: ${vlmErr?.message?.substring(0, 300)}`);
      log(`VLM error stack: ${vlmErr?.stack?.substring(0, 300)}`);
    }

    // Step 5: Test Gemini fallback
    log('Step 5: Testing Gemini fallback...');
    try {
      const { db } = await import('@/lib/db');
      const cfg = await db.botConfig.findUnique({ where: { key: 'gemini_api_key' } });
      const apiKey = cfg?.value;
      
      if (!apiKey) {
        log('No Gemini API key configured');
      } else {
        log(`Gemini API key found: ${apiKey.substring(0, 10)}...`);
        const body = {
          contents: [{
            role: 'user',
            parts: [
              { text: 'صف هذه الصورة باختصار' },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
        };

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify(body),
          }
        );

        const geminiData = await geminiRes.json();
        if (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
          log(`Gemini SUCCESS: ${geminiData.candidates[0].content.parts[0].text.substring(0, 200)}`);
        } else {
          log(`Gemini response: ${JSON.stringify(geminiData).substring(0, 300)}`);
        }
      }
    } catch (geminiErr: any) {
      log(`Gemini FAILED: ${geminiErr?.message?.substring(0, 200)}`);
    }

    return NextResponse.json({ logs, base64Length: base64.length, mimeType });

  } catch (err: any) {
    log(`Fatal error: ${err?.message?.substring(0, 200)}`);
    return NextResponse.json({ logs, error: err?.message?.substring(0, 200) });
  }
}
