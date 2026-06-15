module.exports = {
  apps: [{
    name: 'moodchat-worker',
    script: 'npx',
    args: 'tsx src/ai-worker.ts',
    cwd: '/home/z/my-project',
    env: {
      DATABASE_URL: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
      TELEGRAM_BOT_TOKEN: '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8',
      ADMIN_IDS: '1429407129',
    },
    max_restarts: 15,
    restart_delay: 5000,
    watch: false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }]
};
