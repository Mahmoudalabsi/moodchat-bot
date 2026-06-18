
---
Task ID: remove-promo-ads
Agent: main (Super Z)
Task: إزالة الإعلانات التي دُمجت في رسائل /start و /help (ترويج GLM-5.2 و Z-AI SDK).

Work Log:
- Searched codebase for promotional content (GLM-5.2, Z-AI SDK, Zhipu, "أحدث نموذج").
- Found ads in src/lib/telegram-bot.ts:
  * Admin /start message: "بكل قدرات GLM-5.2!", "قدرات GLM-5.2 الجديدة:", "قدرات Z-AI الكاملة:"
  * Admin /help message: "🤖 المحرك: GLM-5.2 (أحدث نموذج من Z AI)", "قدرات GLM-5.2 الجديدة:"
  * User /start message (both pre-approval and post-approval): "🤖 Z-AI SDK" tagline
  * User /help message: "🤖 المحرك: GLM-5.2 (أحدث نموذج)", "قدرات GLM-5.2 الجديدة:"
  * User activation success message: "🤖 Z-AI SDK" tagline
- Edited src/lib/telegram-bot.ts (6 edits via MultiEdit + 1 follow-up Edit):
  * Removed all "GLM-5.2" mentions from user-facing messages
  * Removed all "Z-AI SDK" tagline mentions from user-facing messages
  * Removed "أحدث نموذج" engine-status lines
  * Renamed "قدرات GLM-5.2 الجديدة" → "القدرات المتقدمة" (generic)
  * Renamed "قدرات Z-AI الكاملة" → "القدرات الكاملة" (generic)
  * Kept all functional command listings (/agent, /think, /search, /draw, /tts, /read, /doc, /code)
- Left admin-only /aistatus and /togglepollinations outputs untouched (technical diagnostic info, not promotional).
- Left code comments and console.log untouched (developer-facing, not user-facing).
- Committed: bdadf17 "fix: remove GLM-5.2 / Z-AI SDK promotional text from /start and /help messages"
- Pushed to origin/main → Vercel will auto-redeploy in ~60s.

Stage Summary:
- 1 file modified: src/lib/telegram-bot.ts (6 insertions, 6 deletions)
- All user-facing promotional branding (GLM-5.2, Z-AI SDK) is now removed from /start, /help, and account-activation success messages.
- Functional command listings preserved (users still see /agent, /think, /search, etc.).
- Admin /aistatus still shows the technical backend identity (Z-AI SDK status) since that's diagnostic, not promotional.
- Bot (worker-continuous.js) was already running and unaffected by this Vercel-side change.
- Deploy triggered: https://my-project-two-nu-94.vercel.app will rebuild automatically.
