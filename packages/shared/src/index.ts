// === API Response Envelope ===

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// === File Types ===

export interface FileRecord {
  id: string;
  filename: string;
  size: number;
  mime_type: string;
  has_password: boolean;
  max_downloads: number | null;
  download_count: number;
  expires_at: string;
  created_at: string;
  is_expired: boolean;
  user_id: string;
}

export interface UploadResponse {
  id: string;
  url: string;
  filename: string;
  size: number;
  delete_token: string;
  max_downloads: number | null;
  expires_at: string;
}

export interface DownloadMeta {
  path: string;
  filename: string;
  size: number;
}

export interface FileStatus {
  id: string;
  filename: string;
  size: number;
  downloads_remaining: number | null;
  download_count: number;
  expires_at: string;
  created_at: string;
  is_expired: boolean;
}

export interface DeleteResponse {
  deleted: true;
  id: string;
}

export interface FileListResponse {
  files: FileRecord[];
}

// === Auth Types ===

export interface AuthKeyResponse {
  api_key: string;
  created_at: string;
}

// === CLI Config ===

export interface CliConfig {
  api_key?: string;
  server_url: string;
}

export const DEFAULT_SERVER_URL = "http://localhost:3456";
export const DEFAULT_EXPIRY = "24h";
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
