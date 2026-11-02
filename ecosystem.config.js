// PM2 config — keeps AdBazaar running in the background, restarts it if it crashes,
// and (after `pm2 save` + startup setup) starts it automatically when the computer boots.
//   pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'adbazaar',
      script: 'server.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: '400M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
