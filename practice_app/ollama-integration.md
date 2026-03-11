# Ollama Integration – Architecture & Implementation Guide

## 1. Use-case summary

| Phase | Feature |
|---|---|
| Phase 1 (now) | AI summary button in Notes — prepends a short summary of key points/actions to the current note |
| Phase 2 (future) | Full data access — Ollama can read notes + SQLite to answer questions, extract actions, populate a Kanban board, etc. |

---

## 2. Architecture options

### Option A — Ollama inside the same container ❌ Not recommended

Run the Ollama binary alongside Node.js in the existing `node:20-alpine` image, using a shell script to start both processes.

**Why it sounds appealing:** single image, single `docker compose up`.

**Why it is the wrong choice:**

| Problem | Detail |
|---|---|
| No GPU on Mac | Docker Desktop for Mac runs containers inside a Linux VM. It cannot access Apple Metal. An embedded Ollama runs CPU-only, making even a 3B model slow (~20–60 s per summarise call). |
| Image size bloat | The Ollama binary is ~50 MB; models are 2–8 GB each. Storing models in the image is impractical. Storing them in the data volume (`/app/data`) works, but now model files live alongside the SQLite database, which is messy. |
| No independent updates | Updating Ollama means rebuilding and redeploying the entire kaimahi image. |
| Process supervision complexity | Alpine has no init system. You need `supervisord` or a fragile `&`/`wait` shell script to manage two long-lived processes. |
| Port conflict risk | Ollama binds to 11434 internally; nothing exposes it, which is fine for now, but it makes future debugging harder. |

---

### Option B — Ollama as a separate docker-compose service ✅ Recommended

Add an `ollama` service to `docker-compose.yml` using the official `ollama/ollama` image. kaimahi's backend proxies requests to it over the internal Docker network.

```
┌─────────────────────────────────────────────────────┐
│  docker-compose                                      │
│                                                      │
│  ┌──────────────────┐       ┌─────────────────────┐ │
│  │  kaimahi (3000)  │──────▶│  ollama (11434)      │ │
│  │  Express + React │  http │  ollama/ollama image │ │
│  └──────────────────┘       └─────────────────────┘ │
│         │                          │                 │
│  ~/practice-data            ollama_data volume       │
└─────────────────────────────────────────────────────┘
         ▲ browser
```

**Advantages:**

- Official, maintained image — `docker pull ollama/ollama` gets the latest release.
- Models live in their own named Docker volume (`ollama_data`) — clean separation from app data.
- Updating Ollama = `docker compose pull ollama && docker compose up -d ollama`. kaimahi image is untouched.
- kaimahi backend uses `OLLAMA_URL=http://ollama:11434` — one env var to point anywhere.
- Works identically on Linux servers (with GPU passthrough if available).

**GPU note for Apple Silicon (arm64 Mac):**
Docker Desktop on macOS does **not** pass Metal through to containers. The Ollama container runs CPU-only regardless of which option you choose. For maximum performance on a Mac, see the "GPU acceleration" note in Section 5.

---

### Option C — Native Ollama on Mac host ✅ Recommended for Mac

Install Ollama directly on macOS (`brew install ollama`), run `ollama serve` as a background service, and point kaimahi at it via `http://host.docker.internal:11434`. Docker Desktop automatically resolves `host.docker.internal` to the Mac host's loopback, so the kaimahi container can reach the native Ollama process with no extra networking configuration.

```
  macOS host
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   ollama serve  ◀──────────── Metal GPU (full speed)    │
  │   port 11434                                             │
  │                   ▲                                      │
  │                   │ host.docker.internal:11434            │
  │   ┌───────────────┴──────────────────────────────────┐  │
  │   │  docker-compose                                   │  │
  │   │                                                   │  │
  │   │  ┌──────────────────┐                            │  │
  │   │  │  kaimahi (3000)  │                            │  │
  │   │  │  Express + React │                            │  │
  │   │  └──────────────────┘                            │  │
  │   └───────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────┘
            ▲ browser
```

**Why this is faster on Mac:**

Docker Desktop runs containers inside a **Linux VM**. That VM has no access to Apple Metal. Any Ollama running inside Docker — whether in the kaimahi container or a separate service — is CPU-only.

Native `ollama serve` runs directly on macOS and uses **Metal Performance Shaders** (MPS) via the full Apple Silicon GPU and unified memory.

| Setup | llama3.2:3b typical throughput | Summarise call latency |
|---|---|---|
| Ollama in Docker (any option) | ~20–50 tok/s (CPU only) | ~25–50 s |
| `ollama serve` native on Mac | ~80–150 tok/s (Metal GPU) | ~3–8 s |

The difference is roughly 5–10× — significant enough to matter for interactive use.

**Setup:**

```bash
brew install ollama
brew services start ollama   # runs ollama serve on login
ollama pull llama3.2:3b      # download default model (~2 GB)
```

Then in `docker-compose.yml`, set:

```yaml
environment:
  - OLLAMA_URL=http://host.docker.internal:11434
```

No `ollama` service or `ollama_data` volume needed in compose.

**Trade-offs vs Option B:**

| | Option B (Docker service) | Option C (native Mac) |
|---|---|---|
| GPU on Mac | ❌ CPU only | ✅ Full Metal |
| Self-contained | ✅ One `docker compose up` | ⚠️ Requires brew install |
| Linux server | ✅ Works (+ Nvidia GPU) | N/A |
| Model updates | `docker exec ollama ollama pull …` | `ollama pull …` in terminal |
| Portability | ✅ Works anywhere Docker runs | macOS only |

---

## 3. Recommended approach: configurable `OLLAMA_URL`

The backend uses a single `OLLAMA_URL` environment variable, defaulting to `http://localhost:11434`. This decouples kaimahi from how Ollama is deployed and lets each user choose the right option for their environment:

| Environment | `OLLAMA_URL` value | Ollama setup |
|---|---|---|
| Mac (recommended) | `http://host.docker.internal:11434` | `brew install ollama && brew services start ollama` |
| Linux server | `http://ollama:11434` | Option B docker-compose service |
| Local dev (no Docker) | `http://localhost:11434` | `ollama serve` in a terminal |

**For a new Mac user**, the getting-started flow becomes:

```bash
brew install ollama && brew services start ollama && ollama pull llama3.2:3b
# edit docker-compose.yml: OLLAMA_URL=http://host.docker.internal:11434
docker compose up
```

This gives the best performance with minimal complexity.

---

## 4. Recommended models

| Model | Size | Best for |
|---|---|---|
| `llama3.2:3b` | ~2.0 GB | Best default — fast on both Metal and CPU |
| `qwen2.5:7b` | ~4.7 GB | Higher quality summaries and structured extraction; comfortable on Metal, slow on CPU |
| `phi4-mini` | ~2.5 GB | Good reasoning, efficient; reasonable on CPU if Metal unavailable |

**Suggested default:** `llama3.2:3b` — good quality/speed on any setup. Users with Metal can comfortably run `qwen2.5:7b` for better output quality.

---

## 5. Implementation plan

### 5.1 docker-compose.yml

Two variants depending on deployment target.

**Mac (recommended — native Ollama for Metal GPU):**

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
      - OLLAMA_URL=http://host.docker.internal:11434
```

Pre-requisite: `brew install ollama && brew services start ollama && ollama pull llama3.2:3b`

**Linux server (self-contained, Ollama as docker-compose service):**

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
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama
    # Nvidia GPU: add the deploy.resources block below
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

### 5.2 Backend — `backend/src/routes/ai.ts` (new file)

This router proxies all Ollama interactions. The frontend never calls Ollama directly.

```typescript
import { Router, Request, Response } from 'express';
import http from 'http';

const router = Router();
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

// ── helpers ──────────────────────────────────────────────────────────────────

async function ollamaPost(path: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, OLLAMA_URL);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function ollamaGet(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, OLLAMA_URL);
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

// ── status ───────────────────────────────────────────────────────────────────

// GET /api/ai/status
// Returns { connected: bool, version?: string, models: string[] }
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const version = await ollamaGet('/api/version') as { version: string };
    const list = await ollamaGet('/api/tags') as { models: { name: string }[] };
    res.json({ connected: true, version: version.version, models: list.models.map((m) => m.name) });
  } catch {
    res.json({ connected: false, models: [] });
  }
});

// ── model management ─────────────────────────────────────────────────────────

// GET /api/ai/models
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const data = await ollamaGet('/api/tags') as { models: { name: string; size: number; modified_at: string }[] };
    res.json(data.models ?? []);
  } catch (err) {
    res.status(502).json({ error: 'Cannot reach Ollama' });
  }
});

// POST /api/ai/models/pull  { name: "llama3.2:3b" }
// Streams pull progress back as newline-delimited JSON
router.post('/models/pull', async (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  if (!name) return res.status(400).json({ error: 'name required' });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  const payload = JSON.stringify({ name, stream: true });
  const url = new URL('/api/pull', OLLAMA_URL);
  const proxyReq = http.request(url, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (proxyRes) => {
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => res.end(JSON.stringify({ error: String(err) })));
  proxyReq.write(payload);
  proxyReq.end();
});

// DELETE /api/ai/models/:name
router.delete('/models/:name', async (req: Request, res: Response) => {
  const name = req.params.name;
  try {
    await ollamaPost('/api/delete', { name });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ── summarise ────────────────────────────────────────────────────────────────

// POST /api/ai/summarise  { content: string, model?: string }
// Returns { summary: string }
router.post('/summarise', async (req: Request, res: Response) => {
  const { content, model = 'llama3.2:3b' } = req.body as { content: string; model?: string };
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  const prompt = `You are a concise assistant. Read the following note and produce a brief summary block. 
Format your response EXACTLY as markdown like this:

---
**AI Summary** *(${new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })})*

**Key points:**
- point one
- point two

**Actions:**
- action one (if any)
---

Note:
${content}`;

  try {
    const result = await ollamaPost('/api/generate', { model, prompt, stream: false }) as { response: string };
    res.json({ summary: result.response.trim() });
  } catch (err) {
    res.status(502).json({ error: 'Ollama request failed: ' + String(err) });
  }
});

// ── future: extract actions ───────────────────────────────────────────────────
// POST /api/ai/extract-actions  { content: string, model?: string }
// Returns { actions: { title: string, dueHint?: string }[] }
// Implementation: similar to /summarise but prompt asks for JSON output
// using Ollama's format: "json" parameter for structured output.

export default router;
```

Register in `backend/src/index.ts`:

```typescript
import aiRouter from './routes/ai';
// ...
app.use('/api/ai', aiRouter);
```

---

### 5.3 Frontend types — `frontend/src/types/index.ts`

Add to the end of the file:

```typescript
export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface AiStatus {
  connected: boolean;
  version?: string;
  models: string[];
}
```

---

### 5.4 Frontend API — `frontend/src/api/client.ts`

Add to the end of the file:

```typescript
// ── AI / Ollama ───────────────────────────────────────────────────────────────
export const getAiStatus = () => api.get<AiStatus>('/ai/status').then((r) => r.data);
export const getAiModels = () => api.get<OllamaModel[]>('/ai/models').then((r) => r.data);
export const deleteAiModel = (name: string) => api.delete(`/ai/models/${encodeURIComponent(name)}`);

/** Pull a model. Returns an async generator that yields progress lines. */
export async function* pullAiModel(name: string): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
  const response = await fetch(`/api/ai/models/pull`, {
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
      if (line.trim()) {
        try { yield JSON.parse(line); } catch { /* skip */ }
      }
    }
  }
}

export const summariseNote = (content: string, model?: string) =>
  api.post<{ summary: string }>('/ai/summarise', { content, model }).then((r) => r.data);
```

---

### 5.5 Notes page — AI Summarise button

In `frontend/src/pages/Notes.tsx`, add a **Summarise** button to the editor toolbar (next to the mode toggle buttons). When clicked:

1. Calls `summariseNote(content, selectedModel)`.
2. Prepends the returned summary block to the note content (with a blank line separator).
3. Triggers auto-save.

**State to add:**

```typescript
const [summarising, setSummarising] = useState(false);
const [aiModel, setAiModel] = useState('llama3.2:3b');
```

**Handler:**

```typescript
const handleSummarise = async () => {
  if (!content.trim() || summarising) return;
  setSummarising(true);
  try {
    const { summary } = await summariseNote(content, aiModel);
    setContent(summary + '\n\n' + content);
    scheduleSave(summary + '\n\n' + content);
  } catch {
    // show error toast / inline message
  } finally {
    setSummarising(false);
  }
};
```

**Button (in toolbar, after mode buttons):**

```tsx
<button
  onClick={handleSummarise}
  disabled={summarising || !content.trim()}
  title="AI summarise"
  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
             bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40
             disabled:cursor-not-allowed transition-colors">
  {summarising
    ? <Loader2 size={13} className="animate-spin" />
    : <Sparkles size={13} />}
  Summarise
</button>
```

Import `Sparkles` from `lucide-react`.

---

### 5.6 Settings page — AI section

Add a new **"AI / Ollama"** section to `frontend/src/pages/Settings.tsx`. It should:

1. **Status card** — on mount, call `getAiStatus()`. Show green "Connected" or red "Not connected" badge, Ollama version if available.
2. **Model list** — table of installed models with name, size, and a Delete button. Confirm before delete.
3. **Pull model** — text input (e.g. `llama3.2:3b`) + Pull button. Show streaming progress bar using `pullAiModel()` async generator. On completion refresh the model list.
4. **Active model selector** — dropdown of installed models. Persist selection to `localStorage` as `kaimahi_ai_model`. Notes page reads this on mount to pre-fill `aiModel` state.

**Example progress display:**

```tsx
{pullProgress && (
  <div className="mt-2">
    <div className="text-xs text-gray-500 mb-1">{pullProgress.status}</div>
    {pullProgress.total && (
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className="bg-indigo-500 h-1.5 rounded-full transition-all"
             style={{ width: `${Math.round((pullProgress.completed! / pullProgress.total) * 100)}%` }} />
      </div>
    )}
  </div>
)}
```

---

## 6. Development setup

```bash
# Option A: use docker-compose for everything (Ollama CPU-only on Mac)
docker compose up

# Option B: native Ollama for Metal GPU speed (Mac)
brew install ollama
brew services start ollama
ollama pull llama3.2:3b
# Then run kaimahi backend with:
OLLAMA_URL=http://localhost:11434 PORT=3001 npm run dev
```

For the docker-compose dev override, create `docker-compose.override.yml`:

```yaml
services:
  app:
    environment:
      - OLLAMA_URL=http://host.docker.internal:11434  # points to native Ollama on Mac host
```

---

## 7. Phase 2 — full data access (future)

When extending Ollama to access all app data, the recommended pattern is **tool-augmented prompting** via the backend:

1. **Context assembly**: the backend collects relevant data (recent notes, team members, matrix entries) and injects them as context in the prompt. Ollama does not need direct DB access.
2. **Structured output**: use Ollama's `format: <json-schema>` parameter to get machine-readable responses (e.g. a list of `{ title, assignee, dueHint }` action objects).
3. **Orchestration route**: add `POST /api/ai/extract-actions` — takes a note's content, returns structured actions the frontend can render in a Kanban view.
4. **Streaming chat**: add `POST /api/ai/chat` with SSE streaming for an interactive assistant that can answer questions about the team.

No additional infrastructure is needed for Phase 2 — the same Ollama service handles all of this.

---

## 8. File change summary

| File | Change |
|---|---|
| `docker-compose.yml` | Add `ollama` service + `ollama_data` volume; add `OLLAMA_URL` env to app |
| `backend/src/routes/ai.ts` | **New file** — status, model list, pull, delete, summarise |
| `backend/src/index.ts` | Register `aiRouter` at `/api/ai` |
| `frontend/src/types/index.ts` | Add `OllamaModel`, `AiStatus` |
| `frontend/src/api/client.ts` | Add `getAiStatus`, `getAiModels`, `deleteAiModel`, `pullAiModel`, `summariseNote` |
| `frontend/src/pages/Notes.tsx` | Add Summarise button + handler to editor toolbar |
| `frontend/src/pages/Settings.tsx` | Add AI/Ollama section (status, model list, pull, active model) |
