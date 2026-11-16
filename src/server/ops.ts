import fs from "fs";
import os from "os";
import path from "path";
import { sqlite } from "@/db";
import { version } from "@/lib/version";

export interface OpsAccount {
  username: string;
  status: string;
  createdAt: string;
}

export interface OpsSnapshot {
  version: string;
  uptimeSeconds: number;
  memory: { rss: number; heapUsed: number; free: number; total: number };
  databaseBytes: number;
  accounts: { total: number; active: number; disabled: number };
  signups: { day: number; week: number; month: number };
  pages: number;
  links: number;
  recentSignups: OpsAccount[];
}

function count(query: string): number {
  const row = sqlite.prepare(query).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

/**
 * One-shot operator snapshot. Each section is independent so a new number
 * is another field here, not a new page. Never includes password hashes.
 */
export function getOpsSnapshot(): OpsSnapshot {
  const mem = process.memoryUsage();
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "linkbreeze.db");
  let databaseBytes = 0;
  try {
    databaseBytes = fs.statSync(dbPath).size;
    for (const suffix of ["-wal", "-shm"]) {
      try {
        databaseBytes += fs.statSync(dbPath + suffix).size;
      } catch {
        // companion files are optional
      }
    }
  } catch {
    databaseBytes = 0;
  }

  const recent = sqlite
    .prepare("SELECT username, status, created_at FROM users ORDER BY id DESC LIMIT 8")
    .all() as { username: string; status: string; created_at: string }[];

  return {
    version,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      free: os.freemem(),
      total: os.totalmem(),
    },
    databaseBytes,
    accounts: {
      total: count("SELECT count(*) AS c FROM users"),
      active: count("SELECT count(*) AS c FROM users WHERE status = 'active'"),
      disabled: count("SELECT count(*) AS c FROM users WHERE status = 'disabled'"),
    },
    signups: {
      day: count("SELECT count(*) AS c FROM users WHERE created_at >= datetime('now', '-1 day')"),
      week: count("SELECT count(*) AS c FROM users WHERE created_at >= datetime('now', '-7 day')"),
      month: count("SELECT count(*) AS c FROM users WHERE created_at >= datetime('now', '-30 day')"),
    },
    pages: count("SELECT count(*) AS c FROM pages"),
    links: count("SELECT count(*) AS c FROM links"),
    recentSignups: recent.map((row) => ({
      username: row.username,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
