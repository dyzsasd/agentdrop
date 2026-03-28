# AgentDrop

Secure file exchange for AI agents. Upload a file, get a URL, share it with another agent. That's it.

AgentDrop lets AI agents (Claude Code, OpenClaw, etc.) and humans pass files to each other through a simple CLI. Files can be password-protected and set to expire after a number of downloads or a time duration.

**Live service:** https://agentdrop-457589095314.us-central1.run.app
**npm:** `@dyzsasd/agent-drop`
**Web dashboard:** https://agentdrop-457589095314.us-central1.run.app

## Install

```bash
npm install -g @dyzsasd/agent-drop
```

## Quick Start

```bash
# 1. Register (one-time) — saves API key to ~/.agentdrop/config.json
agentdrop register

# 2. Upload a file
agentdrop upload report.pdf

# 3. Share the URL with another agent or person
# Output: { "url": "https://agentdrop-.../f/abc-123", "delete_token": "..." }

# 4. Download from another machine/agent
agentdrop download https://agentdrop-.../f/abc-123 -o report.pdf
```

## Features

```bash
# Password protection
agentdrop upload secret.json --password mypass
agentdrop download https://agentdrop-.../f/abc-123 --password mypass

# Limit downloads (auto-expires after N downloads)
agentdrop upload build.tar.gz --max-downloads 3

# Custom expiry (default: 24h)
agentdrop upload logs.txt --expires 1h
agentdrop upload archive.zip --expires 7d

# Combine them
agentdrop upload credentials.json --password s3cret --max-downloads 1 --expires 1h

# Check file status
agentdrop status abc-123

# List your files
agentdrop list

# Delete/revoke a file
agentdrop delete abc-123 --token <delete-token>
```

## JSON Output

AgentDrop outputs JSON by default when piped (non-TTY). Force it with `--json`:

```bash
agentdrop --json upload myfile.txt
```

```json
{
  "id": "a0f1d0bf-5e50-4a26-b1ff-ede43a77a02e",
  "url": "https://agentdrop-.../f/a0f1d0bf-5e50-4a26-b1ff-ede43a77a02e",
  "filename": "myfile.txt",
  "size": 1234,
  "delete_token": "7224027c-c1c9-44c3-b67a-d3c882df867b",
  "max_downloads": null,
  "expires_at": "2025-01-02T12:00:00.000Z"
}
```

## Using AgentDrop with Claude Code

Claude Code can use AgentDrop to send and receive files with other agents. Add these instructions to your project's `CLAUDE.md` or system prompt:

### Sending files from Claude Code

Tell Claude Code:

> Upload the file `output.csv` using agentdrop and give me the URL.

Claude Code will run:

```bash
agentdrop --json upload output.csv --password mypass --max-downloads 3 --expires 1h
```

And return the URL and password for you to share with another agent.

### Receiving files in Claude Code

Give Claude Code a URL from another agent:

> Download this file and process it: https://agentdrop-.../f/abc-123 (password: mypass)

Claude Code will run:

```bash
agentdrop --json download https://agentdrop-.../f/abc-123 --password mypass -o downloaded-file.csv
```

### CLAUDE.md setup

Add this to your project's `CLAUDE.md` to make AgentDrop always available:

```markdown
## File Sharing

This project uses AgentDrop for file exchange between agents.
The CLI `agentdrop` is installed globally. API key is configured in ~/.agentdrop/config.json.

To share a file with another agent:
1. `agentdrop --json upload <file> [--password <pw>] [--max-downloads <n>] [--expires <dur>]`
2. Share the returned URL (and password if set) with the other agent

To receive a file from another agent:
1. `agentdrop --json download <url> [-o <output-path>] [--password <pw>]`
```

## Using AgentDrop with OpenClaw

OpenClaw agents can use AgentDrop through shell tool calls. Here's how to set it up:

### Agent-to-agent file transfer

**Agent A** (sender) generates a file and uploads it:

```bash
# Agent A runs via shell tool:
agentdrop --json upload /tmp/analysis-results.json --password agent-secret --max-downloads 1 --expires 1h
```

Agent A then passes the URL and password to Agent B through the conversation or task handoff.

**Agent B** (receiver) downloads and uses the file:

```bash
# Agent B runs via shell tool:
agentdrop --json download https://agentdrop-.../f/abc-123 --password agent-secret -o /tmp/analysis-results.json
```

### OpenClaw system prompt setup

Add to your OpenClaw agent's system prompt or tool configuration:

```
You have access to `agentdrop` CLI for file sharing with other agents.

Uploading: agentdrop --json upload <filepath> [--password <pw>] [--max-downloads <n>] [--expires <duration>]
Downloading: agentdrop --json download <url> [-o <path>] [--password <pw>]
Status: agentdrop --json status <id>

Always use --json flag for parseable output. When sharing files:
- Set --max-downloads 1 for one-time transfers
- Set --password for sensitive data
- Set --expires for time-limited access
- Parse the JSON response to extract the URL and share it with the receiving agent
```

### Multi-agent pipeline example

```
Agent A (data collector)  →  uploads dataset.csv  →  shares URL+password
                                                          ↓
Agent B (analyzer)        →  downloads dataset.csv →  uploads report.pdf  →  shares URL
                                                                                  ↓
Agent C (reviewer)        →  downloads report.pdf  →  final review
```

Each agent only needs `agentdrop` installed and a registered API key. No shared filesystem required.

## API

All endpoints return `{ "ok": true, "data": {...} }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/keys` | No | Register, get API key |
| `POST` | `/api/files` | API key | Upload file (multipart) |
| `GET` | `/api/files/:id/download` | No* | Download file |
| `GET` | `/api/files/:id/status` | No | File metadata |
| `DELETE` | `/api/files/:id` | Delete token | Revoke file |
| `GET` | `/api/files` | API key | List your files |

*Password-protected files require `X-Password` header or `?password=` query param.

Auth: pass API key as `Authorization: Bearer <key>` header.

## Architecture

```
packages/
  shared/    — TypeScript types (API envelope, file records)
  server/    — Express API + SQLite + local file storage
  cli/       — Commander CLI (published to npm)
  web/       — React + Vite + Tailwind dashboard
```

Deployed on Google Cloud Run. SQLite for metadata, local filesystem for file blobs.

## Development

```bash
# Install dependencies
npm install

# Start server (port 3456)
npx tsx packages/server/src/index.ts

# Dev CLI (points to localhost:3456 by default)
npx tsx packages/cli/src/index.ts register
npx tsx packages/cli/src/index.ts upload myfile.txt

# Dev web UI (port 5173, proxies API to 3456)
cd packages/web && npx vite

# Run E2E tests (local)
npx tsx packages/server/src/index.ts &
bash test/e2e.sh

# Run E2E tests (prod)
bash test/e2e-prod.sh
```

## License

MIT
