import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import db from "./db.js";
import { saveFile, getFilePath, deleteFile } from "./storage.js";
import { requireAuth, AuthRequest } from "./auth.js";
import type { UploadResponse, FileStatus, DeleteResponse, FileRecord } from "@agentdrop/shared";

const router = Router();
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });

function parseExpiry(expr: string): Date {
  const match = expr.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error("Invalid expiry format. Use e.g. 1h, 24h, 7d");
  const num = parseInt(match[1]);
  const unit = match[2];
  const now = new Date();
  if (unit === "m") now.setMinutes(now.getMinutes() + num);
  else if (unit === "h") now.setHours(now.getHours() + num);
  else if (unit === "d") now.setDate(now.getDate() + num);
  return now;
}

function isExpired(row: { expires_at: string; deleted: number; max_downloads: number | null; download_count: number }): boolean {
  if (row.deleted) return true;
  if (new Date(row.expires_at + "Z") < new Date()) return true;
  if (row.max_downloads !== null && row.download_count >= row.max_downloads) return true;
  return false;
}

// POST /api/files — upload
router.post("/api/files", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: { code: "NO_FILE", message: "No file provided" } });
      return;
    }

    const id = uuidv4();
    const deleteToken = uuidv4();
    const expiresIn = (req.body.expires as string) || "24h";
    const maxDownloads = req.body.max_downloads ? parseInt(req.body.max_downloads) : null;
    const password = req.body.password as string | undefined;

    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const expiresAt = parseExpiry(expiresIn);

    saveFile(id, req.file.buffer);

    db.prepare(`
      INSERT INTO files (id, user_id, filename, original_filename, size, mime_type, password_hash, max_downloads, delete_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.userId!,
      id,
      req.file.originalname,
      req.file.size,
      req.file.mimetype,
      passwordHash,
      maxDownloads,
      deleteToken,
      expiresAt.toISOString().replace("Z", ""),
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const data: UploadResponse = {
      id,
      url: `${baseUrl}/f/${id}`,
      filename: req.file.originalname,
      size: req.file.size,
      delete_token: deleteToken,
      max_downloads: maxDownloads,
      expires_at: expiresAt.toISOString(),
    };

    res.status(201).json({ ok: true, data });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: { code: "UPLOAD_ERROR", message: err.message } });
  }
});

// GET /api/files/:id/download — download
router.get("/api/files/:id/download", async (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id) as any;

  if (!row || isExpired(row)) {
    res.status(410).json({ ok: false, error: { code: "GONE", message: "File not found or expired" } });
    return;
  }

  if (row.password_hash) {
    const password = req.headers["x-password"] as string || req.query.password as string;
    if (!password) {
      res.status(401).json({ ok: false, error: { code: "PASSWORD_REQUIRED", message: "This file is password protected. Provide password via X-Password header or ?password= query param." } });
      return;
    }
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      res.status(401).json({ ok: false, error: { code: "WRONG_PASSWORD", message: "Incorrect password" } });
      return;
    }
  }

  // Increment download count
  db.prepare("UPDATE files SET download_count = download_count + 1 WHERE id = ?").run(req.params.id);

  const filePath = getFilePath(row.filename);
  res.setHeader("Content-Disposition", `attachment; filename="${row.original_filename}"`);
  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("Content-Length", row.size);
  res.sendFile(filePath);
});

// GET /api/files/:id/status — status
router.get("/api/files/:id/status", (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id) as any;

  if (!row) {
    res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "File not found" } });
    return;
  }

  const expired = isExpired(row);
  const data: FileStatus = {
    id: row.id,
    filename: row.original_filename,
    size: row.size,
    downloads_remaining: row.max_downloads !== null ? Math.max(0, row.max_downloads - row.download_count) : null,
    download_count: row.download_count,
    expires_at: row.expires_at + "Z",
    created_at: row.created_at + "Z",
    is_expired: expired,
  };

  res.json({ ok: true, data });
});

// DELETE /api/files/:id — delete
router.delete("/api/files/:id", (req, res) => {
  const token = req.headers["x-delete-token"] as string || req.query.delete_token as string;
  if (!token) {
    res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Delete token required" } });
    return;
  }

  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "File not found" } });
    return;
  }

  if (row.delete_token !== token) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Invalid delete token" } });
    return;
  }

  db.prepare("UPDATE files SET deleted = 1 WHERE id = ?").run(req.params.id);
  deleteFile(row.filename);

  const data: DeleteResponse = { deleted: true, id: row.id };
  res.json({ ok: true, data });
});

// GET /api/files — list user's files
router.get("/api/files", requireAuth, (req: AuthRequest, res) => {
  const rows = db.prepare("SELECT * FROM files WHERE user_id = ? AND deleted = 0 ORDER BY created_at DESC").all(req.userId!) as any[];

  const files: FileRecord[] = rows.map((row) => ({
    id: row.id,
    filename: row.original_filename,
    size: row.size,
    mime_type: row.mime_type,
    has_password: !!row.password_hash,
    max_downloads: row.max_downloads,
    download_count: row.download_count,
    expires_at: row.expires_at + "Z",
    created_at: row.created_at + "Z",
    is_expired: isExpired(row),
    user_id: row.user_id,
  }));

  res.json({ ok: true, data: { files } });
});

// POST /api/auth/keys — generate API key
router.post("/api/auth/keys", (_req, res) => {
  const userId = uuidv4();
  const apiKey = `ad_${uuidv4().replace(/-/g, "")}`;

  db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
  db.prepare("INSERT INTO api_keys (key, user_id) VALUES (?, ?)").run(apiKey, userId);

  res.status(201).json({
    ok: true,
    data: {
      api_key: apiKey,
      user_id: userId,
      created_at: new Date().toISOString(),
    },
  });
});

export default router;
