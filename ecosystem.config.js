module.exports = {
  apps: [{
    name: 'moodchat-worker',
    script: 'worker-continuous.js',
    cwd: '/home/z/my-project',
    env: {
      DATABASE_URL: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
      TELEGRAM_BOT_TOKEN: '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8',
      ADMIN_IDS: '1429407129',
      ZAI_BASE_URL: 'https://internal-api.z.ai/v1',
      ZAI_API_KEY: 'Z.ai',
      ZAI_CHAT_ID: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
      ZAI_USER_ID: '014c4da7-4f7f-4efa-9157-9091a73a3570',
      ZAI_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
    },
    max_restarts: 50,
    restart_delay: 3000,
    min_uptime: '10s',
    watch: false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    out_file: '/home/z/my-project/.pm2-logs/worker-out.log',
    error_file: '/home/z/my-project/.pm2-logs/worker-error.log',
  }]
};
