# Ollama Integration – Architecture & Implementation Guide

## 1. Use-case summary

| Phase | Feature |
|---|---|
| Phase 1 (now) | AI summary button in Notes — prepends a short summary of key points/actions to the current note |
| Phase 2 (future) | Full data access — Ollama reads notes + SQLite to answer questions, extract actions, populate a Kanban board, etc. |

---

## 2. Deployment options

kaimahi supports two Ollama deployment modes. The user selects and switches between them from the Settings page at any time — no restart or config file editing required.

### Mode A — Local installation (recommended for Mac)

The user installs Ollama natively on their machine. kaimahi connects to it via `http://host.docker.internal:11434` (from inside the Docker container) or `http://localhost:11434` (local dev).

```
  macOS host
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │   ollama serve  ◀──────── Apple Metal GPU (full speed) │
  │   port 11434                                            │
  │                   ▲                                     │
  │                   │ host.docker.internal:11434           │
  │   ┌───────────────┴─────────────────────────────────┐  │
  │   │  docker-compose                                  │  │
  │   │  ┌──────────────────┐                           │  │
  │   │  │  kaimahi (3000)  │                           │  │
  │   │  └──────────────────┘                           │  │
  │   └─────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────┘
```

**Performance:** Docker Desktop on macOS runs containers inside a Linux VM with no Metal GPU access. Native Ollama bypasses this entirely.

| Setup | llama3.2:3b throughput | Summarise latency |
|---|---|---|
| Ollama in Docker (any) | ~20–50 tok/s (CPU only) | ~25–50 s |
| `ollama serve` native on Mac | ~80–150 tok/s (Metal GPU) | ~3–8 s |

**Mac setup:**
```bash
brew install ollama
brew services start ollama   # auto-starts on login
ollama pull llama3.2:3b
```

---

### Mode B — Docker container (recommended for Linux / servers)

An `ollama/ollama` container runs alongside kaimahi in the same docker-compose stack. Communication happens over the internal Docker network.

```
┌───────────────────────────────────────────────────────┐
│  docker-compose                                        │
│                                                        │
│  ┌──────────────────┐       ┌───────────────────────┐ │
│  │  kaimahi (3000)  │──────▶│  ollama (11434)        │ │
│  │  Express + React │  http │  ollama/ollama image   │ │
│  └──────────────────┘       └───────────────────────┘ │
│         │                           │                  │
│  ~/practice-data            ollama_data volume         │
└───────────────────────────────────────────────────────┘
         ▲ browser
```

Advantages:
- Fully self-contained — one `docker compose up` starts everything
- Ollama updates independently: `docker compose pull ollama && docker compose up -d ollama`
- Works on Linux with Nvidia/AMD GPU passthrough
- Models stored in a named Docker volume, separate from app data

---

### Option C — Same container ❌ Not recommended

Running Ollama inside the kaimahi container alongside Node.js is technically possible but ruled out:
- No GPU on Mac regardless
- Models (2–8 GB) pollute the app image or data volume
- Requires a process supervisor (supervisord) on Alpine
- Updating Ollama requires rebuilding the entire kaimahi image

---

## 3. Runtime mode selection (in-app)

The user chooses and switches between Mode A and Mode B from the **Settings → AI** page. The choice is persisted server-side in `/app/data/ai-config.json` so it survives container restarts without rebuilding anything.

### Config file (`/app/data/ai-config.json`)

```json
{
  "mode": "local",
  "customUrl": null
}
```

| Field | Values | Description |
|---|---|---|
| `mode` | `"local"` \| `"docker"` | Which preset to use |
| `customUrl` | `string \| null` | Overrides the preset URL if set |

Effective Ollama URL resolution (in order of priority):
1. `customUrl` if not null
2. `mode === "local"` → `http://host.docker.internal:11434`
3. `mode === "docker"` → `http://ollama:11434`
4. Fallback: `OLLAMA_URL` env var → `http://localhost:11434`

> **Dev note:** In local development (no Docker), `host.docker.internal` does not resolve. Set `OLLAMA_URL=http://localhost:11434` as an env var and leave `customUrl` null — the env var fallback takes over.

### Availability check

The backend `/api/ai/status` endpoint is the single source of truth for whether Ollama is reachable. It is called:
- On Settings page mount
- After the user changes the Ollama mode/URL in Settings
- On Notes page mount (to gate the Summarise button)
- Optionally: on a 60-second polling interval in the frontend

The endpoint returns the current config alongside connection state so the frontend always knows what mode is active.

---

## 4. Recommended models

| Model | Size | Best for |
|---|---|---|
| `llama3.2:3b` | ~2.0 GB | Best default — fast on both Metal and CPU |
| `qwen2.5:7b` | ~4.7 GB | Higher quality; use on Metal, slow on CPU |
| `phi4-mini` | ~2.5 GB | Good reasoning, reasonable on CPU |

**Suggested default:** `llama3.2:3b`. Users on Metal can upgrade to `qwen2.5:7b` for better output quality.

---

## 5. Implementation plan

### 5.1 docker-compose.yml

Ship a single `docker-compose.yml` that includes the `ollama` service. Mac users who prefer native Ollama simply don't start it (`docker compose up app`) or switch mode in Settings.

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
      # OLLAMA_URL is the env-var fallback only.
      # The active URL is managed in Settings and stored in ai-config.json.
      # Default here targets the docker service; override for native Ollama.
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama
    # Nvidia GPU on Linux: uncomment below
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

**Mac users who want native Ollama** can either:
- Change `OLLAMA_URL=http://host.docker.internal:11434` and skip starting the `ollama` service, **or**
- Leave compose unchanged and switch to Mode A in the Settings UI (which sets `customUrl` / `mode` in `ai-config.json`)

---

### 5.2 Backend — `backend/src/routes/ai.ts` (new file)

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
// Returns the current stored config + resolved URL
router.get('/config', (req: Request, res: Response) => {
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
// Streams pull progress as newline-delimited JSON
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

// ── Future: extract actions ───────────────────────────────────────────────────
// POST /api/ai/extract-actions  { content: string, model?: string }
// Returns { actions: { title: string, dueHint?: string }[] }
// Use Ollama's format: { type: "object", ... } parameter for structured JSON output.

export default router;
```

Register in `backend/src/index.ts`:

```typescript
import aiRouter from './routes/ai';
app.use('/api/ai', aiRouter);
```

---

### 5.3 Frontend types — `frontend/src/types/index.ts`

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

### 5.4 Frontend API — `frontend/src/api/client.ts`

```typescript
// ── AI / Ollama ───────────────────────────────────────────────────────────────
export const getAiStatus   = () => api.get<AiStatus>('/ai/status').then((r) => r.data);
export const getAiConfig   = () => api.get<AiConfig>('/ai/config').then((r) => r.data);
export const saveAiConfig  = (cfg: Pick<AiConfig, 'mode' | 'customUrl'>) =>
  api.put<AiConfig>('/ai/config', cfg).then((r) => r.data);
export const getAiModels   = () => api.get<OllamaModel[]>('/ai/models').then((r) => r.data);
export const deleteAiModel = (name: string) => api.delete(`/ai/models/${encodeURIComponent(name)}`);

export async function* pullAiModel(name: string): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
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

### 5.5 Settings page — AI / Ollama section

Add a new **"AI / Ollama"** section to `frontend/src/pages/Settings.tsx`. It is the primary place for all Ollama management.

#### 5.5.1 Ollama source selector

Shown at the top of the section. Lets the user switch between modes without editing any files.

```tsx
// State
const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
const [aiChecking, setAiChecking] = useState(false);
const [aiSaving, setAiSaving] = useState(false);
const [customUrl, setCustomUrl] = useState('');

// On mount
useEffect(() => { loadAiStatus(); }, []);

const loadAiStatus = async () => {
  setAiChecking(true);
  try {
    const status = await getAiStatus();
    setAiStatus(status);
    setAiConfig(status);
    setCustomUrl(status.customUrl ?? '');
  } finally {
    setAiChecking(false);
  }
};

const handleModeChange = async (mode: 'local' | 'docker') => {
  setAiSaving(true);
  try {
    const updated = await saveAiConfig({ mode, customUrl: aiConfig?.customUrl ?? null });
    setAiConfig(updated);
    await loadAiStatus(); // re-check connection with new URL
  } finally {
    setAiSaving(false);
  }
};

const handleCustomUrlSave = async () => {
  if (!aiConfig) return;
  setAiSaving(true);
  try {
    const updated = await saveAiConfig({ mode: aiConfig.mode, customUrl: customUrl.trim() || null });
    setAiConfig(updated);
    await loadAiStatus();
  } finally {
    setAiSaving(false);
  }
};
```

**UI layout:**

```
┌─────────────────────────────────────────────────────┐
│ Ollama source                                        │
│                                                      │
│  ● Local installation   ○ Docker container           │
│                                                      │
│  Active URL: http://host.docker.internal:11434       │
│  ┌─────────────────────────────────┐ [Save]          │
│  │ Custom URL (optional override)  │                 │
│  └─────────────────────────────────┘                 │
│                                                      │
│  Status: ● Connected  Ollama 0.6.x  [Re-check]       │
│          ○ Not connected — check Ollama is running   │
└─────────────────────────────────────────────────────┘
```

Connection status badge:
```tsx
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
```

Setup instructions shown contextually below the mode selector:
- **Local mode:** show `brew install ollama && brew services start ollama` in a code block
- **Docker mode:** show `docker compose up` note

#### 5.5.2 Active model selector

```tsx
// localStorage key
const MODEL_KEY = 'kaimahi_ai_model';

const [activeModel, setActiveModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? 'llama3.2:3b');

const handleModelSelect = (name: string) => {
  setActiveModel(name);
  localStorage.setItem(MODEL_KEY, name);
};
```

Dropdown of installed models (from `aiStatus.models`). Falls back to showing the stored value if Ollama is not connected.

#### 5.5.3 Model management

- Table of installed models: name, size (formatted as GB), modified date, Delete button
- Pull model: text input + Pull button. Streams progress via `pullAiModel()` async generator with a progress bar
- On pull complete: refresh model list and auto-select the new model

```tsx
// Pull progress state
const [pullName, setPullName] = useState('');
const [pulling, setPulling] = useState(false);
const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null);

const handlePull = async () => {
  if (!pullName.trim() || pulling) return;
  setPulling(true);
  setPullProgress(null);
  try {
    for await (const progress of pullAiModel(pullName.trim())) {
      setPullProgress(progress);
    }
    await loadAiStatus(); // refresh model list
    localStorage.setItem(MODEL_KEY, pullName.trim());
    setActiveModel(pullName.trim());
    setPullName('');
  } finally {
    setPulling(false);
    setPullProgress(null);
  }
};
```

---

### 5.6 Notes page — Summarise button

The Summarise button is **always visible** in the editor toolbar but is **disabled** when Ollama is not reachable.

```typescript
// On mount, check AI availability
const [aiAvailable, setAiAvailable] = useState(false);
const [summarising, setSummarising] = useState(false);
const [aiModel] = useState(() => localStorage.getItem('kaimahi_ai_model') ?? 'llama3.2:3b');

useEffect(() => {
  getAiStatus().then((s) => setAiAvailable(s.connected)).catch(() => setAiAvailable(false));
}, []);

const handleSummarise = async () => {
  if (!content.trim() || summarising) return;
  setSummarising(true);
  try {
    const { summary } = await summariseNote(content, aiModel);
    const updated = summary + '\n\n' + content;
    setContent(updated);
    scheduleSave(updated);
  } catch {
    // show inline error
  } finally {
    setSummarising(false);
  }
};
```

```tsx
<button
  onClick={handleSummarise}
  disabled={summarising || !aiAvailable || !content.trim()}
  title={!aiAvailable ? 'Ollama not connected — check Settings → AI' : 'AI summarise'}
  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
             bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40
             disabled:cursor-not-allowed transition-colors">
  {summarising ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
  Summarise
</button>
```

Import `Sparkles` from `lucide-react`.

---

## 6. Development setup

```bash
# Native Ollama (recommended for dev on Mac)
brew install ollama && brew services start ollama
ollama pull llama3.2:3b

# Backend
cd backend
OLLAMA_URL=http://localhost:11434 PORT=3001 npm run dev

# Frontend
cd frontend
npm run dev
```

In dev, `http://host.docker.internal` does not resolve (no Docker). The `OLLAMA_URL` env var (`http://localhost:11434`) serves as the fallback when `ai-config.json` has `mode: "local"` and no `customUrl`. This works transparently.

To test Docker mode in dev, start the ollama container standalone:
```bash
docker run -d -p 11434:11434 -v ollama_data:/root/.ollama ollama/ollama
# then set OLLAMA_URL=http://localhost:11434 in backend env — same result
```

---

## 7. Phase 2 — full data access (future)

Pattern: **tool-augmented prompting** via the backend. Ollama never accesses the DB directly — the backend assembles context and injects it into prompts.

| Endpoint | Input | Output | Notes |
|---|---|---|---|
| `POST /api/ai/extract-actions` | note content | `{ actions: { title, assignee?, dueHint? }[] }` | Uses Ollama JSON schema output |
| `POST /api/ai/chat` | `{ messages, context? }` | SSE stream of tokens | Context = recent notes + team snapshot |
| `POST /api/ai/team-summary` | snapshot ID | markdown summary | Reads matrix + allocations from DB |

No additional infrastructure needed — same Ollama instance, same `/api/ai` router.

---

## 8. File change summary

| File | Change |
|---|---|
| `docker-compose.yml` | Add `ollama` service + `ollama_data` volume; add `OLLAMA_URL` env var |
| `backend/src/routes/ai.ts` | **New** — config R/W, status, model CRUD, pull (streaming), summarise |
| `backend/src/index.ts` | Register `aiRouter` at `/api/ai` |
| `frontend/src/types/index.ts` | Add `OllamaModel`, `AiConfig`, `AiStatus` |
| `frontend/src/api/client.ts` | Add `getAiStatus`, `getAiConfig`, `saveAiConfig`, `getAiModels`, `deleteAiModel`, `pullAiModel`, `summariseNote` |
| `frontend/src/pages/Notes.tsx` | Add Summarise button (disabled when not connected) + `handleSummarise` |
| `frontend/src/pages/Settings.tsx` | Add AI section: mode selector, connection status, model list, pull, active model |
| `/app/data/ai-config.json` | Runtime config file (created automatically, persisted in data volume) |
