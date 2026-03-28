import fs from "fs";
import path from "path";
import os from "os";
import type { CliConfig } from "@agentdrop/shared";
import { DEFAULT_SERVER_URL } from "@agentdrop/shared";

const CONFIG_DIR = path.join(os.homedir(), ".agentdrop");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function loadConfig(): CliConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return { server_url: DEFAULT_SERVER_URL, ...JSON.parse(raw) };
  } catch {
    return { server_url: DEFAULT_SERVER_URL };
  }
}

export function saveConfig(config: Partial<CliConfig>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...config };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}
