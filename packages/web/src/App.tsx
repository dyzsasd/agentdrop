import { useState, useEffect, useCallback } from "react";
import { hasApiKey, setApiKey, register, listFiles, uploadFile, deleteFile } from "./api";

interface FileRecord {
  id: string;
  filename: string;
  size: number;
  has_password: boolean;
  max_downloads: number | null;
  download_count: number;
  expires_at: string;
  created_at: string;
  is_expired: boolean;
}

interface UploadResult {
  id: string;
  url: string;
  filename: string;
  delete_token: string;
  expires_at: string;
  max_downloads: number | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function App() {
  const [authed, setAuthed] = useState(hasApiKey());
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);
  const [deleteTokens, setDeleteTokens] = useState<Record<string, string>>({});

  // Upload form state
  const [uploadPassword, setUploadPassword] = useState("");
  const [uploadMaxDl, setUploadMaxDl] = useState("");
  const [uploadExpires, setUploadExpires] = useState("24h");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const res = await listFiles();
    if (res.ok) setFiles(res.data.files);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) fetchFiles();
  }, [authed, fetchFiles]);

  const handleRegister = async () => {
    const res = await register();
    if (res.ok) {
      setApiKey(res.data.api_key);
      setAuthed(true);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const res = await uploadFile(file, {
      password: uploadPassword || undefined,
      maxDownloads: uploadMaxDl ? parseInt(uploadMaxDl) : undefined,
      expires: uploadExpires,
    });
    if (res.ok) {
      setLastUpload(res.data);
      setDeleteTokens((prev) => ({ ...prev, [res.data.id]: res.data.delete_token }));
      setUploadPassword("");
      setUploadMaxDl("");
      fetchFiles();
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    const token = deleteTokens[id];
    if (!token) {
      const input = prompt("Enter delete token for this file:");
      if (!input) return;
      const res = await deleteFile(id, input);
      if (res.ok) fetchFiles();
      else alert(res.error?.message || "Delete failed");
      return;
    }
    if (!confirm("Delete this file? This cannot be undone.")) return;
    const res = await deleteFile(id, token);
    if (res.ok) fetchFiles();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-6 max-w-md">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">AgentDrop</h1>
            <p className="text-gray-400">Secure file exchange for AI agents</p>
          </div>
          <button
            onClick={handleRegister}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
          >
            Get Started — Generate API Key
          </button>
          <p className="text-sm text-gray-500">
            Or use the CLI: <code className="bg-gray-800 px-2 py-1 rounded">agentdrop register</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AgentDrop</h1>
          <p className="text-sm text-gray-400">Secure file exchange for AI agents</p>
        </div>
        <button onClick={fetchFiles} className="text-sm text-gray-400 hover:text-white transition-colors">
          Refresh
        </button>
      </div>

      {/* Upload Section */}
      <div className="mb-8 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragOver ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-500"
          }`}
        >
          <p className="text-gray-400 mb-3">
            {uploading ? "Uploading..." : "Drop a file here or"}
          </p>
          {!uploading && (
            <label className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors">
              Browse Files
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
            </label>
          )}
        </div>

        {/* Upload Options */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="password"
            placeholder="Password (optional)"
            value={uploadPassword}
            onChange={(e) => setUploadPassword(e.target.value)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            type="number"
            placeholder="Max downloads"
            value={uploadMaxDl}
            onChange={(e) => setUploadMaxDl(e.target.value)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm w-36 focus:outline-none focus:border-blue-500"
          />
          <select
            value={uploadExpires}
            onChange={(e) => setUploadExpires(e.target.value)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="1h">1 hour</option>
            <option value="6h">6 hours</option>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
        </div>
      </div>

      {/* Last Upload Result */}
      {lastUpload && (
        <div className="mb-8 p-4 bg-green-900/30 border border-green-800 rounded-xl space-y-2">
          <p className="text-green-400 font-medium">Uploaded: {lastUpload.filename}</p>
          <div className="flex items-center gap-2">
            <code className="text-sm bg-gray-900 px-3 py-1 rounded flex-1 truncate">{lastUpload.url}</code>
            <button
              onClick={() => copyToClipboard(lastUpload.url)}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
            >
              Copy URL
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm bg-gray-900 px-3 py-1 rounded flex-1 truncate font-mono">{lastUpload.delete_token}</code>
            <button
              onClick={() => copyToClipboard(lastUpload.delete_token)}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
            >
              Copy Token
            </button>
          </div>
          <p className="text-xs text-gray-500">Save the delete token — you'll need it to revoke access</p>
        </div>
      )}

      {/* Files List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Your Files</h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : files.length === 0 ? (
          <p className="text-gray-500">No files yet. Upload one above.</p>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                  f.is_expired
                    ? "bg-gray-900/50 border-gray-800 opacity-50"
                    : "bg-gray-900 border-gray-800 hover:border-gray-700"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium truncate">{f.filename}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      f.is_expired
                        ? "bg-red-900/50 text-red-400"
                        : "bg-green-900/50 text-green-400"
                    }`}>
                      {f.is_expired ? "EXPIRED" : "ACTIVE"}
                    </span>
                    {f.has_password && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400">
                        PROTECTED
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    <span>{formatSize(f.size)}</span>
                    <span>{f.download_count} downloads{f.max_downloads !== null ? ` / ${f.max_downloads} max` : ""}</span>
                    <span>uploaded {timeAgo(f.created_at)}</span>
                    <span>expires {new Date(f.expires_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/f/${f.id}`)}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
                  >
                    Copy URL
                  </button>
                  {!f.is_expired && (
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded-lg text-sm transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
