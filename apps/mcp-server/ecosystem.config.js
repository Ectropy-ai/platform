module.exports = {
  apps: [
    {
      name: 'ectropy-mcp',
      script: './src/server-simple.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
      },
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      merge_logs: true,
      time: true,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
    },
  ],
};
