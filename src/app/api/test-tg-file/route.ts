import { NextResponse } from 'next/server';

export async function GET() {
  const BOT_TOKEN = '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';
  const fileId = 'AgACAgQAAxkDAANiajBXO6JyNkzzp-68CrRnaqKIRZ0AAhi2MRsCU-1R3omf4u1ncYIBAAMCAAN4AAM8BA';
  
  try {
    // Test 1: getFile API
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`, {
      signal: AbortSignal.timeout(10000),
    });
    const fileData = await fileRes.json();
    
    // Test 2: Download file
    let downloadOk = false;
    let downloadSize = 0;
    if (fileData?.result?.file_path) {
      const downloadRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`, {
        signal: AbortSignal.timeout(15000),
      });
      downloadOk = downloadRes.ok;
      if (downloadOk) {
        const buf = await downloadRes.arrayBuffer();
        downloadSize = buf.byteLength;
      }
    }
    
    return NextResponse.json({
      getFile: { ok: fileData?.ok, file_path: fileData?.result?.file_path, file_size: fileData?.result?.file_size },
      download: { ok: downloadOk, size: downloadSize },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message });
  }
}
