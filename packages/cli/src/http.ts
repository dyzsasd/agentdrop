import { loadConfig } from "./config.js";

export async function apiRequest(
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const config = loadConfig();
  const url = `${config.server_url}${path}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (config.api_key) {
    headers["Authorization"] = `Bearer ${config.api_key}`;
  }

  const res = await fetch(url, { ...options, headers });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await res.json();
    return { status: res.status, body };
  }

  return { status: res.status, body: null };
}

export async function downloadFile(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any; buffer?: Buffer; filename?: string }> {
  const config = loadConfig();
  const url = `${config.server_url}${path}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const disposition = res.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename="(.+?)"/);
  const filename = filenameMatch ? filenameMatch[1] : "download";

  return { status: res.status, body: null, buffer, filename };
}
