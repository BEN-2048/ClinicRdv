module.exports = {
  apps: [
    {
      name: 'clinicrdv-api',
      script: 'src/server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '400M',
      restart_delay: 3000,
      time: true,
    },
  ],
};
