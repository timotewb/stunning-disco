# Ollama Integration – Architecture & Implementation Guide

## Overview

kaimahi integrates Ollama as a local AI backend. Phase 1 adds a Summarise button in the Notes view. Phase 2 (future) extends this to action extraction, Kanban population, and a chat interface across all app data.

The integration is split into **four self-contained steps** that can be built, tested, and committed independently.

| Step | What it delivers | Depends on |
|---|---|---|
| 1 | Backend AI routes + docker-compose | nothing |
| 2 | Settings: Ollama source selector + connection status | Step 1 |
| 3 | Settings: Model management (pull, delete, active model) | Step 2 |
| 4 | Notes: Summarise button | Steps 1 + 3 |

---

## Deployment options

The user chooses their Ollama source from within the app (Settings → AI). Two modes are supported:

**Mode A — Local installation (recommended for Mac)**
Install Ollama natively. kaimahi connects to it via `http://host.docker.internal:11434`. Native Ollama gets full Apple Metal GPU access — roughly 5–10× faster than CPU-only Docker.

| Setup | llama3.2:3b throughput | Summarise latency |
|---|---|---|
| Ollama in Docker | ~20–50 tok/s (CPU only) | ~25–50 s |
| Native `ollama serve` on Mac | ~80–150 tok/s (Metal GPU) | ~3–8 s |

Mac setup: `brew install ollama && brew services start ollama`

**Mode B — Docker container (recommended for Linux / servers)**
Runs `ollama/ollama` as a docker-compose service. Fully self-contained. Supports Nvidia/AMD GPU passthrough on Linux.

The active mode and a custom URL override are persisted in `/app/data/ai-config.json` (same data volume as the SQLite DB). No container restart required when switching modes.

**URL resolution order (backend):**
1. `customUrl` from config file (if set)
2. `mode: local` → `http://host.docker.internal:11434`
3. `mode: docker` → `http://ollama:11434`
4. `OLLAMA_URL` environment variable
5. Fallback: `http://localhost:11434`

---

## Recommended models

| Model | Size | Notes |
|---|---|---|
| `llama3.2:3b` | ~2.0 GB | Best default — fast on Metal and CPU |
| `qwen2.5:7b` | ~4.7 GB | Higher quality; comfortable on Metal, slow on CPU |
| `phi4-mini` | ~2.5 GB | Good reasoning, reasonable on CPU |

---

---

# Step 1 — Backend AI routes

**Goal:** All Ollama API communication goes through the Express backend. The frontend never calls Ollama directly. After this step a developer can test every AI endpoint with `curl` before any UI exists.

**Commit message suggestion:** `feat(ai): add backend AI routes and docker-compose Ollama service`

---

### 1a. docker-compose.yml

Replace the current `docker-compose.yml` with this. The `ollama` service is always present; Mac users who run native Ollama simply don't start it.

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ~/practice-data:/app/data
    environment:
      - DATABASE_URL=file:/app/data/practice.db
      - NODE_ENV=production
      # Default targets the docker service.
      # Override to http://host.docker.internal:11434 for native Ollama on Mac.
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama
    # Nvidia GPU on Linux — uncomment:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]
    volumes:
      - ollama_data:/root/.ollama

volumes:
  ollama_data:
```

---

### 1b. New file: `backend/src/routes/ai.ts`

```typescript
import { Router, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

const router = Router();

// ── Config persistence ────────────────────────────────────────────────────────

interface AiConfig {
  mode: 'local' | 'docker';
  customUrl: string | null;
}

function getConfigPath(): string {
  const dbUrl = process.env.DATABASE_URL ?? 'file:/app/data/practice.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const absDb = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  return path.join(path.dirname(absDb), 'ai-config.json');
}

function readConfig(): AiConfig {
  const p = getConfigPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* fall through */ }
  }
  return { mode: 'docker', customUrl: null };
}

function writeConfig(cfg: AiConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
}

function resolveOllamaUrl(cfg: AiConfig): string {
  if (cfg.customUrl) return cfg.customUrl;
  if (cfg.mode === 'local') return 'http://host.docker.internal:11434';
  if (cfg.mode === 'docker') return 'http://ollama:11434';
  return process.env.OLLAMA_URL ?? 'http://localhost:11434';
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function ollamaPost(baseUrl: string, apiPath: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(apiPath, baseUrl);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function ollamaGet(baseUrl: string, apiPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http.get(new URL(apiPath, baseUrl), (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  });
}

// ── Config routes ─────────────────────────────────────────────────────────────

// GET /api/ai/config
router.get('/config', (_req: Request, res: Response) => {
  const cfg = readConfig();
  res.json({ ...cfg, resolvedUrl: resolveOllamaUrl(cfg) });
});

// PUT /api/ai/config  { mode: 'local' | 'docker', customUrl?: string | null }
router.put('/config', (req: Request, res: Response) => {
  const { mode, customUrl = null } = req.body as Partial<AiConfig>;
  if (mode !== 'local' && mode !== 'docker') {
    return res.status(400).json({ error: 'mode must be "local" or "docker"' });
  }
  const cfg: AiConfig = { mode, customUrl: customUrl ?? null };
  writeConfig(cfg);
  res.json({ ...cfg, resolvedUrl: resolveOllamaUrl(cfg) });
});

// ── Status ────────────────────────────────────────────────────────────────────

// GET /api/ai/status
// Returns { connected, version?, models[], mode, resolvedUrl }
router.get('/status', async (_req: Request, res: Response) => {
  const cfg = readConfig();
  const url = resolveOllamaUrl(cfg);
  try {
    const version = await ollamaGet(url, '/api/version') as { version: string };
    const list = await ollamaGet(url, '/api/tags') as { models: { name: string }[] };
    res.json({
      connected: true,
      version: version.version,
      models: list.models.map((m) => m.name),
      mode: cfg.mode,
      resolvedUrl: url,
    });
  } catch {
    res.json({ connected: false, models: [], mode: cfg.mode, resolvedUrl: url });
  }
});

// ── Model management ──────────────────────────────────────────────────────────

// GET /api/ai/models
router.get('/models', async (_req: Request, res: Response) => {
  const url = resolveOllamaUrl(readConfig());
  try {
    const data = await ollamaGet(url, '/api/tags') as { models: { name: string; size: number; modified_at: string }[] };
    res.json(data.models ?? []);
  } catch {
    res.status(502).json({ error: 'Cannot reach Ollama' });
  }
});

// POST /api/ai/models/pull  { name: "llama3.2:3b" }
// Streams progress as newline-delimited JSON
router.post('/models/pull', (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  if (!name) return res.status(400).json({ error: 'name required' });
  const baseUrl = resolveOllamaUrl(readConfig());
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  const payload = JSON.stringify({ name, stream: true });
  const proxyReq = http.request(new URL('/api/pull', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (proxyRes) => proxyRes.pipe(res));
  proxyReq.on('error', (err) => res.end(JSON.stringify({ error: String(err) })));
  proxyReq.write(payload);
  proxyReq.end();
});

// DELETE /api/ai/models/:name
router.delete('/models/:name', async (req: Request, res: Response) => {
  const url = resolveOllamaUrl(readConfig());
  try {
    await ollamaPost(url, '/api/delete', { name: req.params.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ── Summarise ─────────────────────────────────────────────────────────────────

// POST /api/ai/summarise  { content: string, model?: string }
// Returns { summary: string }
router.post('/summarise', async (req: Request, res: Response) => {
  const { content, model = 'llama3.2:3b' } = req.body as { content: string; model?: string };
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const url = resolveOllamaUrl(readConfig());
  const date = new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `You are a concise assistant. Read the following note and produce a brief summary block.
Format your response EXACTLY as markdown like this:

---
**AI Summary** *(${date})*

**Key points:**
- point one
- point two

**Actions:**
- action one (if any)
---

Note:
${content}`;
  try {
    const result = await ollamaPost(url, '/api/generate', { model, prompt, stream: false }) as { response: string };
    res.json({ summary: result.response.trim() });
  } catch (err) {
    res.status(502).json({ error: 'Ollama request failed: ' + String(err) });
  }
});

export default router;
```

---

### 1c. `backend/src/index.ts`

Add two lines:

```typescript
import aiRouter from './routes/ai';
// ... existing imports ...
app.use('/api/ai', aiRouter);
```

---

### 1d. Frontend types — `frontend/src/types/index.ts`

Append:

```typescript
export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface AiConfig {
  mode: 'local' | 'docker';
  customUrl: string | null;
  resolvedUrl: string;
}

export interface AiStatus extends AiConfig {
  connected: boolean;
  version?: string;
  models: string[];
}
```

---

### 1e. Frontend API — `frontend/src/api/client.ts`

Append:

```typescript
// ── AI / Ollama ───────────────────────────────────────────────────────────────
import type { AiConfig, AiStatus, OllamaModel } from '../types';

export const getAiStatus  = () => api.get<AiStatus>('/ai/status').then((r) => r.data);
export const getAiConfig  = () => api.get<AiConfig>('/ai/config').then((r) => r.data);
export const saveAiConfig = (cfg: Pick<AiConfig, 'mode' | 'customUrl'>) =>
  api.put<AiConfig>('/ai/config', cfg).then((r) => r.data);
export const getAiModels  = () => api.get<OllamaModel[]>('/ai/models').then((r) => r.data);
export const deleteAiModel = (name: string) =>
  api.delete(`/ai/models/${encodeURIComponent(name)}`);

export async function* pullAiModel(
  name: string,
): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
  const response = await fetch('/api/ai/models/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) { try { yield JSON.parse(line); } catch { /* skip */ } }
    }
  }
}

export const summariseNote = (content: string, model?: string) =>
  api.post<{ summary: string }>('/ai/summarise', { content, model }).then((r) => r.data);
```

---

### Step 1 — how to test

```bash
# Start Ollama (native Mac)
brew services start ollama

# Start backend in dev
cd backend
OLLAMA_URL=http://localhost:11434 PORT=3001 npm run dev

# In another terminal — verify endpoints
curl http://localhost:3001/api/ai/status
# → { connected: true, version: "...", models: [...], mode: "docker", resolvedUrl: "..." }

curl -X PUT http://localhost:3001/api/ai/config \
  -H 'Content-Type: application/json' \
  -d '{"mode":"local","customUrl":null}'
# → { mode: "local", customUrl: null, resolvedUrl: "http://host.docker.internal:11434" }

curl http://localhost:3001/api/ai/models
# → [...array of installed models...]

curl -X POST http://localhost:3001/api/ai/summarise \
  -H 'Content-Type: application/json' \
  -d '{"content":"Met with team. Discussed roadmap. Alice to update the Jira board by Friday.","model":"llama3.2:3b"}'
# → { summary: "---\n**AI Summary**..." }
```

Also run `cd backend && npm run build` to confirm TypeScript compiles cleanly.

---

---

# Step 2 — Settings: Ollama source & connection status

**Goal:** The user can see whether Ollama is reachable and switch between local and Docker modes from the Settings page. No model management yet — just source configuration and a live status badge.

**Commit message suggestion:** `feat(ai): settings UI for Ollama source selection and connection status`

---

### 2a. `frontend/src/pages/Settings.tsx`

Add a new **"AI / Ollama"** section. Place it below the existing sections. The section has two parts: source selector and connection status.

**New state to add:**

```typescript
import { getAiStatus, saveAiConfig } from '../api/client';
import type { AiStatus } from '../types';

const [aiStatus, setAiStatus]     = useState<AiStatus | null>(null);
const [aiChecking, setAiChecking] = useState(false);
const [aiSaving, setAiSaving]     = useState(false);
const [customUrl, setCustomUrl]   = useState('');
```

**Load on mount** (add to existing `useEffect` or create a separate one):

```typescript
const loadAiStatus = async () => {
  setAiChecking(true);
  try {
    const s = await getAiStatus();
    setAiStatus(s);
    setCustomUrl(s.customUrl ?? '');
  } finally {
    setAiChecking(false);
  }
};
useEffect(() => { loadAiStatus(); }, []);
```

**Handlers:**

```typescript
const handleModeChange = async (mode: 'local' | 'docker') => {
  if (!aiStatus || aiSaving) return;
  setAiSaving(true);
  try {
    await saveAiConfig({ mode, customUrl: aiStatus.customUrl });
    await loadAiStatus();
  } finally {
    setAiSaving(false);
  }
};

const handleCustomUrlSave = async () => {
  if (!aiStatus || aiSaving) return;
  setAiSaving(true);
  try {
    await saveAiConfig({ mode: aiStatus.mode, customUrl: customUrl.trim() || null });
    await loadAiStatus();
  } finally {
    setAiSaving(false);
  }
};
```

**JSX to add** (inside the Settings return, as a new card):

```tsx
{/* ── AI / Ollama ──────────────────────────────────────── */}
<div className="bg-white rounded-xl border border-gray-100 p-6">
  <h2 className="text-base font-semibold text-gray-800 mb-4">AI / Ollama</h2>

  {/* Source selector */}
  <div className="mb-5">
    <p className="text-sm font-medium text-gray-700 mb-2">Ollama source</p>
    <div className="flex gap-4">
      {(['local', 'docker'] as const).map((m) => (
        <label key={m} className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="ollamaMode"
            value={m}
            checked={aiStatus?.mode === m}
            disabled={aiSaving}
            onChange={() => handleModeChange(m)}
            className="accent-indigo-600"
          />
          <span className="text-sm text-gray-700">
            {m === 'local' ? 'Local installation' : 'Docker container'}
          </span>
        </label>
      ))}
    </div>

    {/* Contextual setup instructions */}
    {aiStatus?.mode === 'local' && (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 font-mono">
        brew install ollama &amp;&amp; brew services start ollama
      </div>
    )}
    {aiStatus?.mode === 'docker' && (
      <p className="mt-3 text-xs text-gray-500">
        The <code>ollama</code> service in docker-compose.yml will be used.
        Run <code className="bg-gray-100 px-1 rounded">docker compose up</code> to start it.
      </p>
    )}
  </div>

  {/* Resolved URL + custom override */}
  {aiStatus && (
    <div className="mb-5">
      <p className="text-xs text-gray-500 mb-1">
        Active URL: <code className="bg-gray-100 px-1 rounded">{aiStatus.resolvedUrl}</code>
      </p>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="Custom URL override (optional)"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={handleCustomUrlSave}
          disabled={aiSaving}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg
                     hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          Save
        </button>
      </div>
    </div>
  )}

  {/* Connection status */}
  <div className="flex items-center gap-3">
    {aiChecking ? (
      <span className="flex items-center gap-1.5 text-xs text-gray-500">
        <Loader2 size={12} className="animate-spin" /> Checking…
      </span>
    ) : aiStatus?.connected ? (
      <span className="flex items-center gap-1.5 text-xs text-green-600">
        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        Connected — Ollama {aiStatus.version}
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-xs text-red-500">
        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
        Not connected — is Ollama running?
      </span>
    )}
    <button
      onClick={loadAiStatus}
      disabled={aiChecking}
      className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors">
      Re-check
    </button>
  </div>
</div>
```

Import `Loader2` from `lucide-react` if not already imported.

---

### Step 2 — how to test

1. Start the app (`npm run dev` in both backend and frontend, with Ollama running).
2. Navigate to Settings. Scroll to the "AI / Ollama" section.
3. Verify the status badge shows "Connected" with the Ollama version.
4. Toggle between "Local installation" and "Docker container" — the Active URL should change between `host.docker.internal:11434` and `ollama:11434`.
5. Stop Ollama (`brew services stop ollama`), click Re-check — badge should turn red.
6. Restart Ollama, Re-check again — turns green.
7. Enter a custom URL (e.g. `http://localhost:12345`) and save — Active URL updates; Re-check shows Not connected (nothing at that port). Clear it and save again to restore.

Run `cd frontend && npm run build` to confirm TypeScript compiles cleanly.

---

---

# Step 3 — Settings: model management

**Goal:** The user can see installed models, pull new ones with a live progress bar, delete models, and select which model to use for AI features. The active model is persisted in `localStorage`.

**Commit message suggestion:** `feat(ai): settings model management — pull, delete, active model selector`

**Depends on:** Step 2 (the AI section already exists in Settings.tsx).

---

### 3a. `frontend/src/pages/Settings.tsx` additions

Add to the AI section's state block:

```typescript
import { getAiModels, deleteAiModel, pullAiModel } from '../api/client';
import type { OllamaModel } from '../types';

const MODEL_KEY = 'kaimahi_ai_model';

const [models, setModels]           = useState<OllamaModel[]>([]);
const [activeModel, setActiveModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? 'llama3.2:3b');
const [pullName, setPullName]       = useState('');
const [pulling, setPulling]         = useState(false);
const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null);
const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null);
```

Update `loadAiStatus` to also load models:

```typescript
const loadAiStatus = async () => {
  setAiChecking(true);
  try {
    const s = await getAiStatus();
    setAiStatus(s);
    setCustomUrl(s.customUrl ?? '');
    if (s.connected) setModels(await getAiModels());
  } finally {
    setAiChecking(false);
  }
};
```

**Handlers:**

```typescript
const handleSelectModel = (name: string) => {
  setActiveModel(name);
  localStorage.setItem(MODEL_KEY, name);
};

const handlePull = async () => {
  if (!pullName.trim() || pulling) return;
  setPulling(true);
  setPullProgress(null);
  try {
    for await (const p of pullAiModel(pullName.trim())) {
      setPullProgress(p);
    }
    const refreshed = await getAiModels();
    setModels(refreshed);
    handleSelectModel(pullName.trim());
    setPullName('');
  } finally {
    setPulling(false);
    setPullProgress(null);
  }
};

const handleDeleteModel = async (name: string) => {
  await deleteAiModel(name);
  setModels((prev) => prev.filter((m) => m.name !== name));
  if (activeModel === name) {
    const next = models.find((m) => m.name !== name)?.name ?? '';
    handleSelectModel(next);
  }
  setConfirmDeleteModel(null);
};
```

**JSX to add** inside the AI section card, below the connection status row:

```tsx
{aiStatus?.connected && (
  <>
    {/* Active model selector */}
    <div className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-sm font-medium text-gray-700 mb-2">Active model</p>
      {models.length === 0 ? (
        <p className="text-xs text-gray-400">No models installed. Pull one below.</p>
      ) : (
        <select
          value={activeModel}
          onChange={(e) => handleSelectModel(e.target.value)}
          className="w-full max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-indigo-300">
          {models.map((m) => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
      )}
    </div>

    {/* Installed models table */}
    <div className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-sm font-medium text-gray-700 mb-3">Installed models</p>
      {models.length === 0 ? (
        <p className="text-xs text-gray-400">None yet.</p>
      ) : (
        <div className="space-y-1">
          {models.map((m) => (
            <div key={m.name}
              className="flex items-center justify-between px-3 py-2 rounded-lg
                         bg-gray-50 hover:bg-gray-100 transition-colors">
              <div>
                <span className="text-sm text-gray-800">{m.name}</span>
                <span className="ml-2 text-xs text-gray-400">
                  {(m.size / 1e9).toFixed(1)} GB
                </span>
              </div>
              {confirmDeleteModel === m.name ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">Delete?</span>
                  <button onClick={() => handleDeleteModel(m.name)}
                    className="text-xs text-red-600 font-medium hover:text-red-800">Yes</button>
                  <button onClick={() => setConfirmDeleteModel(null)}
                    className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteModel(m.name)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Pull model */}
    <div className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-sm font-medium text-gray-700 mb-2">Pull a model</p>
      <p className="text-xs text-gray-400 mb-3">
        Find models at{' '}
        <a href="https://ollama.com/library" target="_blank" rel="noreferrer"
          className="text-indigo-500 hover:underline">ollama.com/library</a>.
        Suggested: <code>llama3.2:3b</code>, <code>qwen2.5:7b</code>
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={pullName}
          onChange={(e) => setPullName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePull()}
          placeholder="e.g. llama3.2:3b"
          disabled={pulling}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-indigo-300
                     disabled:opacity-50"
        />
        <button
          onClick={handlePull}
          disabled={pulling || !pullName.trim()}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg
                     hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
          {pulling && <Loader2 size={12} className="animate-spin" />}
          Pull
        </button>
      </div>
      {pullProgress && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 mb-1">{pullProgress.status}</p>
          {pullProgress.total ? (
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.round(((pullProgress.completed ?? 0) / pullProgress.total) * 100)}%` }}
              />
            </div>
          ) : (
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 bg-indigo-400 rounded-full animate-pulse w-1/3" />
            </div>
          )}
        </div>
      )}
    </div>
  </>
)}
```

Import `Trash2` from `lucide-react` if not already imported.

---

### Step 3 — how to test

1. Open Settings → AI section. With Ollama connected, the model sections should appear below the status badge.
2. Pull `llama3.2:3b` if not already installed — progress bar should fill, model appears in list on completion and becomes the active model.
3. Change the active model in the dropdown — reload the page, confirm the selection is remembered.
4. Delete a model — confirm prompt appears, model disappears from list on confirm.
5. If no models are installed, the "No models installed" message shows and the active model selector is hidden.

---

---

# Step 4 — Notes: Summarise button

**Goal:** A Summarise button appears in the Notes editor toolbar. It calls Ollama via the backend and prepends a structured summary block to the note. The button is disabled when Ollama is not connected, with a tooltip explaining why.

**Commit message suggestion:** `feat(ai): add AI Summarise button to Notes editor`

**Depends on:** Steps 1 and 3 (backend routes must exist; active model stored in localStorage).

---

### 4a. `frontend/src/pages/Notes.tsx`

**New imports:**

```typescript
import { getAiStatus, summariseNote } from '../api/client';
import { Sparkles } from 'lucide-react';
```

**New state** (add inside the `Notes` component):

```typescript
const [aiAvailable, setAiAvailable] = useState(false);
const [summarising, setSummarising] = useState(false);
const [aiModel] = useState(() => localStorage.getItem('kaimahi_ai_model') ?? 'llama3.2:3b');
```

**Check availability on mount** (add to the existing `useEffect` that loads initial data, or add a separate one):

```typescript
useEffect(() => {
  getAiStatus()
    .then((s) => setAiAvailable(s.connected))
    .catch(() => setAiAvailable(false));
}, []);
```

**Summarise handler:**

```typescript
const handleSummarise = async () => {
  if (!content.trim() || summarising) return;
  setSummarising(true);
  try {
    const { summary } = await summariseNote(content, aiModel);
    const updated = summary + '\n\n' + content;
    setContent(updated);
    scheduleSave(updated);
  } catch {
    // optionally surface an inline error message here
  } finally {
    setSummarising(false);
  }
};
```

**Button** — add to the editor toolbar, after the existing Edit / Split / Preview mode buttons:

```tsx
<button
  onClick={handleSummarise}
  disabled={summarising || !aiAvailable || !content.trim()}
  title={
    !aiAvailable
      ? 'Ollama not connected — configure in Settings → AI'
      : summarising
      ? 'Summarising…'
      : 'AI summarise note'
  }
  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
             bg-indigo-50 text-indigo-700 hover:bg-indigo-100
             disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
  {summarising
    ? <Loader2 size={13} className="animate-spin" />
    : <Sparkles size={13} />}
  Summarise
</button>
```

---

### Step 4 — how to test

1. Open a daily note or team member note with some content.
2. Click Summarise — a loading spinner should appear for a few seconds.
3. The note content should now begin with a formatted `---\n**AI Summary**…\n---` block, followed by a blank line, then the original content.
4. The note should auto-save (status indicator shows "Saving…" then "Saved").
5. Stop Ollama. Reload the page. The Summarise button should be greyed out. Hovering shows the tooltip "Ollama not connected — configure in Settings → AI".
6. Restart Ollama. Reload. Button re-enables.

---

---

# Step 5 (future) — Phase 2: full data access

No infrastructure changes needed. Add new routes to `backend/src/routes/ai.ts` following the same pattern.

| Route | Input | Output |
|---|---|---|
| `POST /api/ai/extract-actions` | `{ content, model? }` | `{ actions: { title, assignee?, dueHint? }[] }` — use Ollama JSON schema output |
| `POST /api/ai/chat` | `{ messages, context? }` | SSE token stream — context assembled by backend from notes + team data |
| `POST /api/ai/team-summary` | `{ snapshotId }` | markdown summary — backend reads matrix + allocations, injects as prompt context |

The backend assembles context (notes, team data from SQLite) and injects it into prompts. Ollama never needs direct DB access.

---

## Development setup reference

```bash
# Native Ollama on Mac (recommended — Metal GPU)
brew install ollama && brew services start ollama
ollama pull llama3.2:3b

# Backend dev
cd backend
OLLAMA_URL=http://localhost:11434 PORT=3001 npm run dev

# Frontend dev
cd frontend
npm run dev
# Switch to Mode A in Settings to use native Ollama from the UI
```

In dev (no Docker), `host.docker.internal` doesn't resolve. The `OLLAMA_URL` env var fallback handles this transparently — no code changes needed between dev and production.
