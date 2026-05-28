module.exports = {
  apps: [
    {
      name: "200m-backend",
      cwd: "./backend",
      script: "src/server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "200m-rank-checker",
      cwd: "./backend/services/rank-checker-service",
      script: "src/index.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "200m-short-link-checker",
      cwd: "./backend/services/short-link-checker-service",
      script: "src/index.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
