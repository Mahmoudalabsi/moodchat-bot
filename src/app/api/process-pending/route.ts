/**
 * Process Pending Messages API Route - معطّل
 * 
 * ⚠️ هذا المسار معطّل لمنع المعالجة المزدوجة مع الـ Worker.
 * الـ Worker (ai-worker.ts) هو المعالج الوحيد للرسائل المعلقة.
 * تشغيل هذا المسار كان يسبب تكرار الردود لأنه لا يستخدم حالة 'processing'
 * ولا يوجد قفل موزع بينه وبين الـ Worker.
 * 
 * إذا احتجت لإعادة تفعيله، يجب:
 * 1. إضافة حالة 'processing' قبل المعالجة
 * 2. استخدام atomic claim pattern (updateMany مع status: pending → processing)
 * 3. التحقق من عدم وجود رد مساعد قبل الإرسال
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    ok: true, 
    processed: 0, 
    message: 'This endpoint is disabled. The AI Worker handles all message processing. Enable it only with proper locking.' 
  });
}

export async function POST() {
  return NextResponse.json({ 
    ok: true, 
    processed: 0, 
    message: 'This endpoint is disabled. The AI Worker handles all message processing.' 
  });
}
