---
Task ID: 1
Agent: Main Agent
Task: Fix MoodChat bot - remove channel join message and greeting in every reply

Work Log:
- Fixed SYSTEM_PROMPT in both bot-polling.ts and telegram-bot.ts
- Removed "تبدأ بالسلام" from the AI instructions
- Added strict rules: no greeting at start of every reply, answer directly
- Channel join message "🚀 To use this bot, you must join our channel" needs to be disabled from BotFather manually
- Bot is running in polling mode and receiving/responding to messages
- Pushed all fixes to GitHub

Stage Summary:
- Bot works in polling mode with Z-AI internal API
- System prompt updated to prevent greetings in every reply
- Vercel webhook backup code also updated
- Channel join message must be removed via BotFather by user
