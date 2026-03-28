import { Request, Response, NextFunction } from "express";
import db from "./db.js";

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing or invalid API key. Use 'agentdrop auth <key>' to configure." },
    });
    return;
  }

  const apiKey = header.slice(7);
  const row = db.prepare("SELECT user_id FROM api_keys WHERE key = ?").get(apiKey) as
    | { user_id: string }
    | undefined;

  if (!row) {
    res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid API key." },
    });
    return;
  }

  req.userId = row.user_id;
  next();
}
