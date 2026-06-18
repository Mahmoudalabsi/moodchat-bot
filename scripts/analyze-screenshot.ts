import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();

  const imagePath = '/home/z/my-project/upload/pasted_image_1781629719711.png';
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';

  const prompt = `هذه لقطة شاشة من صفحة Meta Business أو System Users.
صف لي بدقة شديدة:
1. ما الصفحة التي يظهر فيها المستخدم؟
2. كل الأزرار والعناصر الظاهرة مع نصوصها بالضبط (مثل: Add, Generate Token, Assign Assets, Permissions, إلخ).
3. هل يوجد System User؟ ما اسمه؟ ما دوره؟
4. هل توجد نافذة لاختيار الصلاحيات (Permissions)? ما الصلاحيات الظاهرة؟
5. هل يوجد زر "Generate Token" أو "Assign Assets" أو "Add"? أين بالضبط؟
6. هل تظهر قائمة Apps أو WhatsApp Business Accounts؟
7. ما هي الخطوة التالية المطلوبة من المستخدم بالضبط؟ وأين يضغط؟
أجب بالعربية بتفصيل واضح.`;

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  console.log(response.choices[0]?.message?.content);
}

main().catch(console.error);
