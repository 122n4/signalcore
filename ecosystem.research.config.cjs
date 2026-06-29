/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

function loadResearchEnv() {
  const envPath = path.join(__dirname, ".env.research");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) {
      env[key] = value;
    }
  }

  return env;
}

const researchEnv = {
  NODE_ENV: "production",
  RESEARCH_SUPABASE_SYNC: "1",
  ...loadResearchEnv(),
};

module.exports = {
  apps: [
    {
      name: "syntrake-research-supervisor",
      script: "npm",
      args: "run research:supervisor",
      cwd: __dirname,
      interpreter: "none",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "30s",
      restart_delay: 5000,
      kill_timeout: 30000,
      time: true,
      env: researchEnv,
      out_file: "artifacts/trading-research/runtime/pm2-supervisor.out.log",
      error_file: "artifacts/trading-research/runtime/pm2-supervisor.err.log",
      merge_logs: true,
    },
    {
      name: "syntrake-research-sync",
      script: "npm",
      args: "run research:sync:loop -- --intervalSeconds=60",
      cwd: __dirname,
      interpreter: "none",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "30s",
      restart_delay: 5000,
      kill_timeout: 15000,
      time: true,
      env: researchEnv,
      out_file: "artifacts/trading-research/runtime/pm2-sync.out.log",
      error_file: "artifacts/trading-research/runtime/pm2-sync.err.log",
      merge_logs: true,
    },
    {
      name: "syntrake-research-data-backfill",
      script: "npm",
      args: "run research:data-backfill:loop -- --intervalMinutes=360",
      cwd: __dirname,
      interpreter: "none",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "30s",
      restart_delay: 10000,
      kill_timeout: 30000,
      time: true,
      env: researchEnv,
      out_file: "artifacts/trading-research/runtime/pm2-backfill.out.log",
      error_file: "artifacts/trading-research/runtime/pm2-backfill.err.log",
      merge_logs: true,
    },
    {
      name: "syntrake-research-data-hunter",
      script: "npm",
      args: `run research:data-hunter:loop -- --intervalMinutes=${researchEnv.TRADING_DATA_HUNTER_INTERVAL_MINUTES || "180"}`,
      cwd: __dirname,
      interpreter: "none",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "30s",
      restart_delay: 10000,
      kill_timeout: 30000,
      time: true,
      env: researchEnv,
      out_file: "artifacts/trading-research/runtime/pm2-data-hunter.out.log",
      error_file: "artifacts/trading-research/runtime/pm2-data-hunter.err.log",
      merge_logs: true,
    },
  ],
};
