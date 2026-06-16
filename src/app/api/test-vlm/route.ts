import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';

export async function GET(request: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => { console.log(msg); logs.push(msg); };

  try {
    // Step 1: Download a test image from Telegram
    log('Step 1: Getting test image from Telegram...');
    const testFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=1429407129&limit=1`, {
      signal: AbortSignal.timeout(10000),
    });
    const testFileData = await testFileRes.json();
    
    if (!testFileData?.ok || !testFileData?.result?.photos?.[0]) {
      log('No test photo available');
      return NextResponse.json({ logs, error: 'No test photo' });
    }

    const photos = testFileData.result.photos[0];
    const smallest = photos[0];
    const fileId = smallest.file_id;

    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`, {
      signal: AbortSignal.timeout(10000),
    });
    const fileData = await fileRes.json();
    const filePath = fileData?.result?.file_path;
    if (!filePath) { log('No file path'); return NextResponse.json({ logs, error: 'No file path' }); }

    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    const downloadRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(20000) });
    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    log(`Image downloaded: ${buffer.length} bytes, base64: ${base64.length} chars, mimeType: ${mimeType}`);

    // Step 2: Test HuggingFace BLIP (free, no API key)
    log('Step 2: Testing HuggingFace BLIP...');
    try {
      const imageBuffer = Buffer.from(base64, 'base64');
      const hfRes = await fetch(
        'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large',
        {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          signal: AbortSignal.timeout(30000),
          body: new Uint8Array(imageBuffer),
        }
      );
      
      log(`HuggingFace status: ${hfRes.status}`);
      
      if (hfRes.ok) {
        const hfData = await hfRes.json();
        const caption = hfData?.[0]?.generated_text;
        if (caption) {
          log(`HuggingFace BLIP SUCCESS: "${caption}"`);
        } else {
          log(`HuggingFace response: ${JSON.stringify(hfData).substring(0, 300)}`);
        }
      } else if (hfRes.status === 503) {
        const hfData = await hfRes.json().catch(() => ({}));
        log(`HuggingFace model loading (cold start): estimated_time=${hfData?.estimated_time}`);
      } else {
        const errText = await hfRes.text().catch(() => '');
        log(`HuggingFace failed: ${errText.substring(0, 200)}`);
      }
    } catch (hfErr: any) {
      log(`HuggingFace error: ${hfErr?.message?.substring(0, 200)}`);
    }

    // Step 3: Test Pollinations Vision (free, no API key) - with openai model
    log('Step 3: Testing Pollinations Vision API...');
    try {
      const pollRes = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: 'openai',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image briefly in Arabic' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          }],
          temperature: 0.7,
          seed: Math.floor(Math.random() * 100000),
        }),
      });
      
      const pollStatus = pollRes.status;
      log(`Pollinations status: ${pollStatus}`);
      
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        const pollReply = pollData?.choices?.[0]?.message?.content;
        if (pollReply) {
          log(`Pollinations Vision SUCCESS: ${pollReply.substring(0, 200)}`);
        } else {
          log(`Pollinations empty response: ${JSON.stringify(pollData).substring(0, 200)}`);
        }
      } else {
        const errText = await pollRes.text().catch(() => '');
        log(`Pollinations failed: ${errText.substring(0, 200)}`);
      }
    } catch (pollErr: any) {
      log(`Pollinations error: ${pollErr?.message?.substring(0, 200)}`);
    }

    // Step 4: Test Pollinations text-only (should always work)
    log('Step 4: Testing Pollinations text-only...');
    try {
      const textRes = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: 'openai',
          messages: [{ role: 'user', content: 'Say hello in Arabic' }],
          temperature: 0.7,
        }),
      });
      
      if (textRes.ok) {
        const textData = await textRes.json();
        const textReply = textData?.choices?.[0]?.message?.content;
        log(`Pollinations text SUCCESS: ${textReply?.substring(0, 100)}`);
      } else {
        log(`Pollinations text failed: ${textRes.status}`);
      }
    } catch (textErr: any) {
      log(`Pollinations text error: ${textErr?.message?.substring(0, 100)}`);
    }

    // Step 5: Test Gemini with key from database
    log('Step 5: Testing Gemini Vision with DB key...');
    try {
      const { db } = await import('@/lib/db');
      const cfg = await db.botConfig.findUnique({ where: { key: 'gemini_api_key' } });
      const apiKey = cfg?.value;
      
      if (!apiKey) {
        log('No Gemini API key in database');
      } else {
        log(`Found key: ${apiKey.substring(0, 10)}...`);
        const body = {
          contents: [{
            role: 'user',
            parts: [
              { text: 'صف هذه الصورة باختصار بالعربي' },
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
      log(`Gemini error: ${geminiErr?.message?.substring(0, 200)}`);
    }

    return NextResponse.json({ logs, base64Length: base64.length });
  } catch (err: any) {
    log(`Fatal error: ${err?.message?.substring(0, 200)}`);
    return NextResponse.json({ logs, error: err?.message?.substring(0, 200) });
  }
}
