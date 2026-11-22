// POST /api/initiative  { mode: "create" | "analyze", prompt }  →  text/plain, streamed as Claude writes it
// Writes an initiative document (or an analysis of one) from a prompt the page assembles from its form.
// Only signed-in users listed in Firestore allowed/{email} may call it (same check as /api/parse-task).
// Needs ANTHROPIC_API_KEY in the Vercel project's environment variables; without it the endpoint answers 501.
// A failure after the text has started is sent as a last line "[[ERROR:code]]" (the status is already 200 by then).
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT = "aoshaban-87979";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const MAX_PROMPT = 60000;

async function caller(req){
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || ""); if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], JWKS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
    if (!payload.email || payload.email_verified !== true) return null;
    const email = String(payload.email).toLowerCase();
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/allowed/${encodeURIComponent(email)}`, { headers: { authorization: `Bearer ${m[1]}` } });
    return r.ok ? email : null;
  } catch { return null; }
}

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: "not_configured" });
  if (!(await caller(req))) return res.status(401).json({ error: "unauthorized" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const prompt = String(body.prompt || "").trim();
  if (!prompt || !["create", "analyze"].includes(body.mode)) return res.status(400).json({ error: "bad_request" });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: "too_long" });

  const client = new Anthropic();
  let started = false;
  const stop = new AbortController();
  req.on("close", () => { if (!res.writableEnded) stop.abort(); });
  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: prompt }],
    }, { signal: stop.signal });
    for await (const ev of stream){
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta"){
        if (!started){ started = true; res.statusCode = 200; res.setHeader("content-type", "text/plain; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.setHeader("x-accel-buffering", "no"); }
        res.write(ev.delta.text);
      }
    }
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal"){ if (!started) return res.status(422).json({ error: "refused" }); res.write("\n[[ERROR:refused]]"); }
    else if (msg.stop_reason === "max_tokens" && started) res.write("\n[[ERROR:max_tokens]]");
    if (!started) return res.status(502).json({ error: "empty" });
    res.end();
  } catch (e){
    if (stop.signal.aborted){ try { res.end(); } catch {} return; }
    const code = e instanceof Anthropic.RateLimitError ? "rate_limited" : e instanceof Anthropic.APIError ? "upstream" : "server";
    if (started){ res.write(`\n[[ERROR:${code}]]`); return res.end(); }
    return res.status(code === "rate_limited" ? 429 : 502).json({ error: code });
  }
}
