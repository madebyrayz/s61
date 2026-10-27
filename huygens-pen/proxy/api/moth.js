// Vercel function that keeps the Moth API key server-side. Huygens Pen uses it for measured bits:
// a graph-v1 state measured in the Z basis gives uniform random bitstrings, one photon position per shot.
// POST { engine, params }  -> submits a job, waits up to ~25s, returns { status, job_id, result }
//                             or 202 { status: "pending", job_id } if the job is still running.
// GET  ?job=<id>           -> 200 { status: "completed", job_id, result } or 202 while pending.
const BASE = "https://api.mothquantum.com/api/v1";
const ENGINES = new Set(["graph-v1", "coin-toss-v1"]);
const WAIT_MS = 25000;

export const config = { maxDuration: 60 };

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOW_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function moth(path, init = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.MOTH_API_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body.detail || body.title || `Moth returned ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return body;
}

async function settle(jobId, deadline) {
  for (;;) {
    const { status, error } = await moth(`/jobs/${encodeURIComponent(jobId)}/status`);
    if (status === "completed") {
      const out = await moth(`/jobs/${encodeURIComponent(jobId)}/result`);
      return { code: 200, body: { status, job_id: jobId, result: out.result ?? out } };
    }
    if (status === "failed" || status === "cancelled") {
      return { code: 502, body: { status, job_id: jobId, error: error || `Job ${status}` } };
    }
    if (Date.now() > deadline) return { code: 202, body: { status: "pending", job_id: jobId } };
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!process.env.MOTH_API_KEY) return res.status(500).json({ error: "MOTH_API_KEY is not set on the server" });
  try {
    if (req.method === "GET" && req.query.job) {
      const out = await settle(String(req.query.job), Date.now() + WAIT_MS);
      return res.status(out.code).json(out.body);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
    const { engine = "graph-v1", params = {} } = req.body || {};
    if (!ENGINES.has(engine)) return res.status(400).json({ error: `Engine ${engine} is not allowed` });
    const { job_id } = await moth(`/engines/${engine}/process`, { method: "POST", body: JSON.stringify({ params }) });
    const out = await settle(job_id, Date.now() + WAIT_MS);
    return res.status(out.code).json(out.body);
  } catch (e) {
    return res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message });
  }
}
