# PRD: Agent File Exchange (AgentDrop)

## Introduction

AgentDrop is a managed file exchange service purpose-built for AI agents (Claude Code, OpenClaw, etc.) to share files with each other seamlessly. An agent or human uploads a file via CLI, receives a shareable URL, and can optionally protect it with a password and/or limit the number of downloads. Another agent receives the URL (and password if set), downloads the file via CLI, and uses it. The service includes a web UI for managing uploaded files, monitoring usage, and configuring sharing settings.

The core problem: AI agents working across different environments or tools have no simple, secure, standardized way to pass files to each other. Copy-pasting file contents is lossy, size-limited, and error-prone. AgentDrop solves this with a purpose-built transfer layer.

## Goals

- Provide a dead-simple CLI for uploading and downloading files (`agentdrop upload`, `agentdrop download`)
- Return a unique, shareable URL upon upload that any agent can consume
- Support optional password protection for uploaded files
- Support both download-count limits and time-based expiration (or both combined)
- Offer a web UI for managing files, viewing download history, and revoking access
- Host as a managed SaaS so users don't need to deploy infrastructure
- Keep the CLI agent-friendly: machine-parseable output (JSON), non-interactive mode, exit codes

## User Stories

### US-001: Upload a file via CLI
**Description:** As an AI agent, I want to upload a file from my local filesystem so that I can share it with another agent.

**Acceptance Criteria:**
- [ ] `agentdrop upload <filepath>` uploads the file to the server
- [ ] Returns JSON output: `{ "url": "...", "id": "...", "expires_at": "..." }`
- [ ] Supports `--json` flag for guaranteed JSON output (default for non-TTY)
- [ ] Supports `--human` flag for human-readable output
- [ ] Upload fails gracefully with clear error message if file doesn't exist
- [ ] Upload fails gracefully if file exceeds size limit (100MB default)
- [ ] Typecheck/lint passes

### US-002: Download a file via CLI
**Description:** As an AI agent, I want to download a file given a URL so that I can use it in my workflow.

**Acceptance Criteria:**
- [ ] `agentdrop download <url>` downloads the file to current directory
- [ ] `agentdrop download <url> -o <path>` downloads to a specific path
- [ ] Returns JSON output: `{ "path": "...", "size": "...", "filename": "..." }`
- [ ] Fails with clear error if URL is expired, exhausted, or invalid
- [ ] Fails with clear error if password is required but not provided
- [ ] Typecheck/lint passes

### US-003: Set a password on upload
**Description:** As an agent, I want to protect my uploaded file with a password so that only authorized recipients can download it.

**Acceptance Criteria:**
- [ ] `agentdrop upload <filepath> --password <secret>` sets a password
- [ ] Download requires `--password <secret>` flag to succeed
- [ ] Download without password returns HTTP 401 and a clear error message
- [ ] Password is not stored in plaintext on server (hashed with bcrypt/argon2)
- [ ] Typecheck/lint passes

### US-004: Set download count limit
**Description:** As an agent, I want to limit how many times a file can be downloaded so that it's not reused beyond my intent.

**Acceptance Criteria:**
- [ ] `agentdrop upload <filepath> --max-downloads <n>` sets a download limit
- [ ] Server tracks download count per file
- [ ] Once limit is reached, further downloads return HTTP 410 Gone
- [ ] Download count is visible in the JSON response from upload and status commands
- [ ] Typecheck/lint passes

### US-005: Set time-based expiration
**Description:** As an agent, I want my uploaded file to auto-expire after a duration so that files don't persist forever.

**Acceptance Criteria:**
- [ ] `agentdrop upload <filepath> --expires <duration>` sets expiration (e.g., `1h`, `24h`, `7d`)
- [ ] Default expiration is 24 hours if not specified
- [ ] Expired files return HTTP 410 Gone on download attempt
- [ ] Server periodically cleans up expired file data from storage
- [ ] Typecheck/lint passes

### US-006: Check file status via CLI
**Description:** As an agent, I want to check whether a file is still available and how many downloads remain.

**Acceptance Criteria:**
- [ ] `agentdrop status <url-or-id>` returns file metadata
- [ ] JSON output includes: `{ "id", "filename", "size", "downloads_remaining", "expires_at", "created_at", "is_expired" }`
- [ ] Returns clear error if file ID not found
- [ ] Typecheck/lint passes

### US-007: Delete/revoke a file via CLI
**Description:** As the uploader, I want to revoke access to a file before it expires so that I can control access.

**Acceptance Criteria:**
- [ ] `agentdrop delete <url-or-id>` removes the file and invalidates the URL
- [ ] Requires a delete token (returned at upload time) for authorization
- [ ] Returns confirmation JSON: `{ "deleted": true, "id": "..." }`
- [ ] Subsequent downloads return HTTP 410 Gone
- [ ] Typecheck/lint passes

### US-008: Web UI — File dashboard
**Description:** As a user, I want a web dashboard to see all my uploaded files, their status, and download history.

**Acceptance Criteria:**
- [ ] Dashboard lists all files uploaded by the authenticated user
- [ ] Each file shows: filename, size, upload time, expiration, downloads used/remaining, status
- [ ] Files can be sorted by upload time, expiration, or status
- [ ] Expired/exhausted files are visually distinct (grayed out)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-009: Web UI — Manual file upload
**Description:** As a user, I want to upload files through the web UI when I don't have CLI access.

**Acceptance Criteria:**
- [ ] Drag-and-drop or file picker upload on dashboard
- [ ] Can set password, max downloads, and expiration from the UI
- [ ] Shows the generated URL and delete token after upload
- [ ] Copy-to-clipboard button for URL and password
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-010: Web UI — Revoke/delete files
**Description:** As a user, I want to revoke file access from the web UI.

**Acceptance Criteria:**
- [ ] Delete button on each file row with confirmation dialog
- [ ] File is immediately removed from storage and URL invalidated
- [ ] Dashboard updates to reflect deletion
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-011: API key authentication
**Description:** As a user, I want to authenticate my CLI and web sessions with an API key so that my files are scoped to my account.

**Acceptance Criteria:**
- [ ] `agentdrop auth <api-key>` saves the key to `~/.agentdrop/config.json`
- [ ] All upload/delete/status requests include the API key in the `Authorization` header
- [ ] Unauthenticated upload requests are rejected with HTTP 401
- [ ] Download requests do NOT require authentication (only URL + optional password)
- [ ] API keys can be generated from the web UI
- [ ] Typecheck/lint passes

### US-012: Server API endpoints
**Description:** As a developer, I need a REST API that the CLI and web UI consume.

**Acceptance Criteria:**
- [ ] `POST /api/files` — upload file (multipart, returns file metadata + URL + delete token)
- [ ] `GET /api/files/:id/download` — download file (checks password, count, expiration)
- [ ] `GET /api/files/:id/status` — get file metadata
- [ ] `DELETE /api/files/:id` — delete file (requires delete token)
- [ ] `GET /api/files` — list user's files (requires auth)
- [ ] `POST /api/auth/keys` — generate API key
- [ ] All endpoints return JSON with consistent error format
- [ ] Rate limiting on upload endpoint (e.g., 60 req/min per API key)
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: CLI must support `upload`, `download`, `status`, `delete`, and `auth` subcommands
- FR-2: Upload returns a unique, unguessable URL (UUID v4 or similar) for the file
- FR-3: Upload returns a separate delete token for revocation
- FR-4: Password protection uses server-side hashing (bcrypt or argon2); plaintext passwords never stored
- FR-5: Files have both a download count limit (optional, default unlimited) and a time-based expiration (optional, default 24h); whichever triggers first wins
- FR-6: Server stores files in cloud object storage (e.g., AWS S3 or compatible)
- FR-7: A background job or lazy check cleans up expired/exhausted files from storage
- FR-8: CLI output defaults to JSON in non-TTY environments (piped, scripted) and human-readable in TTY
- FR-9: CLI exit codes follow convention: 0 = success, 1 = client error, 2 = server error
- FR-10: Web UI is served from the same server at the root path (`/`)
- FR-11: API keys are scoped per-user; each user can have multiple active keys
- FR-12: File size limit of 100MB per upload (configurable server-side)
- FR-13: All API responses follow a consistent envelope: `{ "ok": true, "data": {...} }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`

## Non-Goals

- No real-time streaming or WebSocket-based transfer
- No end-to-end encryption (server can see file contents; password protects access, not content)
- No folder/directory upload support (single files only for v1)
- No file preview or rendering in the web UI
- No multi-user collaboration features (sharing with specific users/teams)
- No versioning or file history
- No webhook/callback notifications on download events
- No self-hosted deployment support in v1

## Design Considerations

- **CLI UX:** Prioritize agent-friendliness. JSON output, non-interactive, clear exit codes. Agents don't read help text — they parse structured output.
- **Web UI:** Clean, minimal dashboard. Use a modern component library (e.g., shadcn/ui + Tailwind). Focus on the file list and upload form — no onboarding wizards.
- **URL format:** `https://agentdrop.io/f/<file-id>` — short, clean, easy to paste into agent context windows.

## Technical Considerations

- **Stack:** Node.js/TypeScript for both CLI and server (monorepo)
- **CLI framework:** `commander` or `oclif` for subcommand parsing
- **Server framework:** Express or Fastify
- **Database:** PostgreSQL for metadata (files, users, API keys, download counts)
- **Object storage:** AWS S3 (or S3-compatible like R2/MinIO) for file blobs
- **Web UI:** React + Vite + Tailwind + shadcn/ui, served as static assets from the server
- **Auth:** API key-based (no OAuth/SSO for v1)
- **Deployment:** Containerized (Docker), deployable to any cloud platform
- **Monorepo structure:**
  ```
  packages/
    cli/          # CLI tool (npm package: agentdrop)
    server/       # API server + static web UI serving
    web/          # React web UI
    shared/       # Shared types and utilities
  ```

## Success Metrics

- An agent can upload a file and another agent can download it in under 5 seconds (excluding transfer time)
- CLI commands complete with clear success/error JSON in all cases
- 99.9% uptime for the managed service
- File cleanup runs within 1 hour of expiration
- Web UI loads in under 2 seconds

## Open Questions

- Should there be a free tier with limits (e.g., 10 uploads/day, 50MB max) and a paid tier?
- Should the CLI support uploading from stdin (e.g., `echo "data" | agentdrop upload --name output.txt`)?
- Should download URLs be human-memorable (e.g., `agentdrop.io/f/happy-tiger-42`) or purely random UUIDs?
- Should the web UI support a "download page" where recipients can download in-browser (vs. CLI-only)?
- What region(s) should the managed service initially deploy to?
- Should there be an MCP (Model Context Protocol) server integration so agents can use AgentDrop as an MCP tool?
