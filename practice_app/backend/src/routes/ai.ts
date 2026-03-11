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
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
}

function resolveOllamaUrl(cfg: AiConfig): string {
  if (cfg.customUrl) return cfg.customUrl;
  if (cfg.mode === 'local') return 'http://host.docker.internal:11434';
  if (cfg.mode === 'docker') return 'http://ollama:11434';
  return process.env.OLLAMA_URL ?? 'http://localhost:11434';
}

// ── Prompt persistence ────────────────────────────────────────────────────────

export interface AiPrompts {
  noteSummarise: string;
}

export const DEFAULT_PROMPTS: AiPrompts = {
  noteSummarise: `You are a concise assistant. Read the following note and produce a brief summary block.
Format your response EXACTLY as markdown like this:

---
**AI Summary** *({date})*

**Key points:**
- point one
- point two

**Actions:**
- action one (if any)
---`,
};

function getPromptsPath(): string {
  return path.join(path.dirname(getConfigPath()), 'ai-prompts.json');
}

function readPrompts(): AiPrompts {
  const p = getPromptsPath();
  if (fs.existsSync(p)) {
    try {
      const stored = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<AiPrompts>;
      return { ...DEFAULT_PROMPTS, ...stored };
    } catch { /* fall through */ }
  }
  return { ...DEFAULT_PROMPTS };
}

function writePrompts(prompts: AiPrompts): void {
  const p = getPromptsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(prompts, null, 2));
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

// ── Prompts ───────────────────────────────────────────────────────────────────

// GET /api/ai/prompts
router.get('/prompts', (_req: Request, res: Response) => {
  res.json(readPrompts());
});

// PUT /api/ai/prompts  { noteSummarise?: string, ... }
router.put('/prompts', (req: Request, res: Response) => {
  const current = readPrompts();
  const updated: AiPrompts = { ...current };
  for (const key of Object.keys(DEFAULT_PROMPTS) as (keyof AiPrompts)[]) {
    if (typeof req.body[key] === 'string') updated[key] = req.body[key];
  }
  writePrompts(updated);
  res.json(updated);
});

// DELETE /api/ai/prompts/:key — reset a single prompt to its default
router.delete('/prompts/:key', (req: Request, res: Response) => {
  const key = req.params.key as keyof AiPrompts;
  if (!(key in DEFAULT_PROMPTS)) return res.status(400).json({ error: 'Unknown prompt key' });
  const current = readPrompts();
  current[key] = DEFAULT_PROMPTS[key];
  writePrompts(current);
  res.json(current);
});

// ── Summarise ─────────────────────────────────────────────────────────────────

// POST /api/ai/summarise  { content: string, model?: string }
// Returns { summary: string }
router.post('/summarise', async (req: Request, res: Response) => {
  const { content, model = 'llama3.2:3b' } = req.body as { content: string; model?: string };
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const url = resolveOllamaUrl(readConfig());
  const date = new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
  const systemPrompt = readPrompts().noteSummarise.replace(/\{date\}/g, date);
  try {
    const result = await ollamaPost(url, '/api/generate', {
      model,
      system: systemPrompt,
      prompt: content,
      stream: false,
    }) as { response: string };
    res.json({ summary: result.response.trim() });
  } catch (err) {
    res.status(502).json({ error: 'Ollama request failed: ' + String(err) });
  }
});

export default router;
