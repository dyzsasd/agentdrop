import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, "..", "data", "uploads");

fs.mkdirSync(STORAGE_DIR, { recursive: true });

export function saveFile(fileId: string, buffer: Buffer): void {
  fs.writeFileSync(path.join(STORAGE_DIR, fileId), buffer);
}

export function getFilePath(fileId: string): string {
  return path.join(STORAGE_DIR, fileId);
}

export function deleteFile(fileId: string): void {
  const fp = path.join(STORAGE_DIR, fileId);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}

export function fileExists(fileId: string): boolean {
  return fs.existsSync(path.join(STORAGE_DIR, fileId));
}
