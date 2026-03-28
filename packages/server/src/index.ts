import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "3456");

app.use(cors());
app.use(morgan("short"));
app.use(express.json());

// API routes
app.use(routes);

// Serve web UI static files (after build)
const webDistPath = path.resolve(__dirname, "..", "..", "web", "dist");
app.use(express.static(webDistPath));

// SPA fallback — serve index.html for non-API routes
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Endpoint not found" } });
    return;
  }
  res.sendFile(path.join(webDistPath, "index.html"), (err) => {
    if (err) {
      res.status(200).send("AgentDrop server running. Web UI not built yet — run 'npm run build -w packages/web'");
    }
  });
});

// Cleanup job — run every 10 minutes
import db from "./db.js";
import { deleteFile } from "./storage.js";

function cleanupExpired() {
  const now = new Date().toISOString().replace("Z", "");
  const expired = db
    .prepare("SELECT id, filename FROM files WHERE deleted = 0 AND expires_at < ?")
    .all(now) as { id: string; filename: string }[];

  for (const row of expired) {
    db.prepare("UPDATE files SET deleted = 1 WHERE id = ?").run(row.id);
    deleteFile(row.filename);
  }

  // Also clean up download-exhausted files
  const exhausted = db
    .prepare("SELECT id, filename FROM files WHERE deleted = 0 AND max_downloads IS NOT NULL AND download_count >= max_downloads")
    .all() as { id: string; filename: string }[];

  for (const row of exhausted) {
    deleteFile(row.filename);
  }

  if (expired.length || exhausted.length) {
    console.log(`Cleanup: removed ${expired.length} expired, ${exhausted.length} exhausted files`);
  }
}

setInterval(cleanupExpired, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`AgentDrop server running on http://localhost:${PORT}`);
});
