module.exports = {
  apps: [{
    name: 'moodchat-worker',
    script: 'worker-continuous.js',
    cwd: '/home/z/my-project',

    // === Zero-downtime reload support ===
    // When you run `pm2 reload moodchat-worker`:
    //   1. PM2 sends a 'shutdown' message to the running process
    //   2. The worker sets isShuttingDown=true and stops picking up new messages
    //   3. It waits for in-flight messages to finish (up to 25s)
    //   4. It exits cleanly
    //   5. PM2 starts the new instance and waits for process.send('ready')
    //   6. New worker starts processing — zero message loss, zero downtime
    wait_ready: true,                 // Wait for process.send('ready') before considering the process "online"
    shutdown_with_message: true,      // Send 'shutdown' message instead of SIGTERM (enables graceful shutdown)
    listen_timeout: 30000,            // Max time to wait for graceful shutdown (30s)
    kill_timeout: 35000,              // Force kill after 35s if graceful shutdown fails

    // === Environment ===
    env: {
      DATABASE_URL: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
      TELEGRAM_BOT_TOKEN: '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM',
      ADMIN_IDS: '1429407129',
      ZAI_BASE_URL: 'https://internal-api.z.ai/v1',
      ZAI_API_KEY: 'Z.ai',
      ZAI_CHAT_ID: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
      ZAI_USER_ID: '014c4da7-4f7f-4efa-9157-9091a73a3570',
      ZAI_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
      NODE_OPTIONS: '--max-old-space-size=512',
    },

    // === Resilience ===
    max_restarts: 100,                // High limit so worker keeps coming back after crashes
    restart_delay: 2000,              // Wait 2s between restart attempts
    min_uptime: '5s',                 // Process must run 5s to be considered "stable"
    exp_backoff_restart_delay: 200,   // Exponential backoff on rapid crashes

    // === Logging ===
    watch: false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    out_file: '/home/z/my-project/.pm2-logs/worker-out.log',
    error_file: '/home/z/my-project/.pm2-logs/worker-error.log',

    // === Graceful start/stop ===
    treekill: false,                  // Don't kill child processes (we don't spawn any, but safer)
  }]
};
