#!/usr/bin/env node
import { program } from "commander";
import fs from "fs";
import path from "path";
import { loadConfig, saveConfig } from "./config.js";
import { apiRequest, downloadFile } from "./http.js";
import { output, errorOutput, setOutputMode } from "./output.js";

program
  .name("agentdrop")
  .description("CLI for sharing files between AI agents")
  .version("0.1.0")
  .option("--json", "Force JSON output")
  .option("--human", "Force human-readable output")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    setOutputMode({ json: opts.json, human: opts.human });
  });

// === auth ===
program
  .command("auth <api-key>")
  .description("Save API key for authentication")
  .action((apiKey: string) => {
    saveConfig({ api_key: apiKey });
    output(
      { ok: true, message: "API key saved" },
      () => "API key saved to ~/.agentdrop/config.json",
    );
  });

// === register ===
program
  .command("register")
  .description("Register a new account and get an API key")
  .action(async () => {
    const { status, body } = await apiRequest("/api/auth/keys", { method: "POST" });
    if (status !== 201 || !body?.ok) {
      errorOutput("REGISTER_FAILED", body?.error?.message || "Registration failed");
      process.exit(1);
    }
    saveConfig({ api_key: body.data.api_key });
    output(body.data, () =>
      `Registered! API key: ${body.data.api_key}\nKey saved to ~/.agentdrop/config.json`,
    );
  });

// === upload ===
program
  .command("upload <filepath>")
  .description("Upload a file and get a shareable URL")
  .option("-p, --password <password>", "Password-protect the file")
  .option("-n, --max-downloads <n>", "Maximum number of downloads", parseInt)
  .option("-e, --expires <duration>", "Expiration duration (e.g. 1h, 24h, 7d)", "24h")
  .action(async (filepath: string, opts) => {
    if (!fs.existsSync(filepath)) {
      errorOutput("FILE_NOT_FOUND", `File not found: ${filepath}`);
      process.exit(1);
    }

    const config = loadConfig();
    if (!config.api_key) {
      errorOutput("NOT_AUTHENTICATED", "Run 'agentdrop register' or 'agentdrop auth <key>' first");
      process.exit(1);
    }

    const stat = fs.statSync(filepath);
    if (stat.size > 100 * 1024 * 1024) {
      errorOutput("FILE_TOO_LARGE", "File exceeds 100MB limit");
      process.exit(1);
    }

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filepath);
    const blob = new Blob([fileBuffer]);
    formData.append("file", blob, path.basename(filepath));
    formData.append("expires", opts.expires);
    if (opts.password) formData.append("password", opts.password);
    if (opts.maxDownloads) formData.append("max_downloads", String(opts.maxDownloads));

    const { status, body } = await apiRequest("/api/files", {
      method: "POST",
      body: formData,
    });

    if (status !== 201 || !body?.ok) {
      errorOutput(body?.error?.code || "UPLOAD_FAILED", body?.error?.message || "Upload failed");
      process.exit(1);
    }

    output(body.data, () => {
      let msg = `Uploaded: ${body.data.filename} (${formatSize(body.data.size)})\n`;
      msg += `URL: ${body.data.url}\n`;
      msg += `Expires: ${body.data.expires_at}\n`;
      if (body.data.max_downloads) msg += `Max downloads: ${body.data.max_downloads}\n`;
      msg += `Delete token: ${body.data.delete_token}`;
      return msg;
    });
  });

// === download ===
program
  .command("download <url>")
  .description("Download a file from an AgentDrop URL")
  .option("-o, --output <path>", "Output file path")
  .option("-p, --password <password>", "Password for protected files")
  .action(async (url: string, opts) => {
    // Extract file ID from URL
    const idMatch = url.match(/\/f\/([a-f0-9-]+)/);
    const fileId = idMatch ? idMatch[1] : url;

    const headers: Record<string, string> = {};
    if (opts.password) headers["X-Password"] = opts.password;

    const result = await downloadFile(`/api/files/${fileId}/download`, headers);

    if (!result.buffer) {
      const err = result.body?.error;
      errorOutput(err?.code || "DOWNLOAD_FAILED", err?.message || "Download failed");
      process.exit(1);
    }

    const outputPath = opts.output || result.filename || "download";
    fs.writeFileSync(outputPath, result.buffer);

    output(
      { path: outputPath, filename: result.filename, size: result.buffer.length },
      () => `Downloaded: ${result.filename} (${formatSize(result.buffer!.length)}) → ${outputPath}`,
    );
  });

// === status ===
program
  .command("status <url-or-id>")
  .description("Check file status and remaining downloads")
  .action(async (urlOrId: string) => {
    const idMatch = urlOrId.match(/\/f\/([a-f0-9-]+)/);
    const fileId = idMatch ? idMatch[1] : urlOrId;

    const { body } = await apiRequest(`/api/files/${fileId}/status`);

    if (!body?.ok) {
      errorOutput(body?.error?.code || "STATUS_FAILED", body?.error?.message || "Status check failed");
      process.exit(1);
    }

    output(body.data, () => {
      const d = body.data;
      let msg = `File: ${d.filename} (${formatSize(d.size)})\n`;
      msg += `Status: ${d.is_expired ? "EXPIRED" : "ACTIVE"}\n`;
      msg += `Downloads: ${d.download_count}`;
      if (d.downloads_remaining !== null) msg += ` / ${d.download_count + d.downloads_remaining}`;
      msg += `\nExpires: ${d.expires_at}`;
      return msg;
    });
  });

// === delete ===
program
  .command("delete <url-or-id>")
  .description("Delete/revoke a file")
  .requiredOption("-t, --token <delete-token>", "Delete token (from upload)")
  .action(async (urlOrId: string, opts) => {
    const idMatch = urlOrId.match(/\/f\/([a-f0-9-]+)/);
    const fileId = idMatch ? idMatch[1] : urlOrId;

    const { body } = await apiRequest(`/api/files/${fileId}`, {
      method: "DELETE",
      headers: { "X-Delete-Token": opts.token },
    });

    if (!body?.ok) {
      errorOutput(body?.error?.code || "DELETE_FAILED", body?.error?.message || "Delete failed");
      process.exit(1);
    }

    output(body.data, () => `Deleted file ${fileId}`);
  });

// === list ===
program
  .command("list")
  .alias("ls")
  .description("List your uploaded files")
  .action(async () => {
    const config = loadConfig();
    if (!config.api_key) {
      errorOutput("NOT_AUTHENTICATED", "Run 'agentdrop register' or 'agentdrop auth <key>' first");
      process.exit(1);
    }

    const { body } = await apiRequest("/api/files");

    if (!body?.ok) {
      errorOutput(body?.error?.code || "LIST_FAILED", body?.error?.message || "List failed");
      process.exit(1);
    }

    output(body.data, () => {
      const files = body.data.files;
      if (files.length === 0) return "No files uploaded yet.";
      const lines = files.map((f: any) => {
        const status = f.is_expired ? "EXPIRED" : "ACTIVE";
        return `[${status}] ${f.filename} (${formatSize(f.size)}) - ${f.download_count} downloads - expires ${f.expires_at}`;
      });
      return lines.join("\n");
    });
  });

// === config ===
program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    output(
      { ...config, api_key: config.api_key ? `${config.api_key.slice(0, 8)}...` : undefined },
      () => {
        let msg = `Server: ${config.server_url}`;
        if (config.api_key) msg += `\nAPI key: ${config.api_key.slice(0, 8)}...`;
        else msg += "\nAPI key: not set";
        return msg;
      },
    );
  });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

program.parse();
