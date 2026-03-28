const BASE = "/api";

function getApiKey(): string | null {
  return localStorage.getItem("agentdrop_api_key");
}

export function setApiKey(key: string) {
  localStorage.setItem("agentdrop_api_key", key);
}

export function clearApiKey() {
  localStorage.removeItem("agentdrop_api_key");
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  const key = getApiKey();
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  return res.json();
}

export async function register(): Promise<any> {
  return request("/auth/keys", { method: "POST" });
}

export async function listFiles(): Promise<any> {
  return request("/files");
}

export async function uploadFile(
  file: File,
  opts: { password?: string; maxDownloads?: number; expires?: string },
): Promise<any> {
  const form = new FormData();
  form.append("file", file);
  form.append("expires", opts.expires || "24h");
  if (opts.password) form.append("password", opts.password);
  if (opts.maxDownloads) form.append("max_downloads", String(opts.maxDownloads));
  return request("/files", { method: "POST", body: form });
}

export async function deleteFile(id: string, deleteToken: string): Promise<any> {
  return request(`/files/${id}`, {
    method: "DELETE",
    headers: { "X-Delete-Token": deleteToken },
  });
}
