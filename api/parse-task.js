// POST /api/parse-task  { text, now: "YYYY-MM-DDTHH:MM", weekday }  →  { title, date, time, priority }
// Turns a task written in everyday Arabic into a clean title plus a date and time, using Claude.
// Only signed-in users of the site may call it: the Firebase ID token is verified and the user must
// be listed in Firestore allowed/{email} (read with the user's own token, so the site's rules decide).
// Needs ANTHROPIC_API_KEY in the Vercel project's environment variables; without it the endpoint
// answers 501 and the site falls back to its built-in parser.
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT = "aoshaban-87979";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const SYSTEM = `You turn a task or reminder that a user wrote in everyday Arabic (often Saudi dialect) into structured data for a task list.
Return:
- title: the task itself as a short, clear Modern Standard Arabic phrase, usually starting with a verbal noun (مصدر) such as "إعداد محضر اجتماع" or "الاتصال بمدير الجمعية". Drop the request words (ذكرني، لا تنساني، أبغى، ...) and every word that only expresses the date or time. Keep names, numbers and details that belong to the task. Correct hamzas and spelling. No trailing punctuation.
- date: the day the task is due, as YYYY-MM-DD, computed from the current date and weekday given in the message; null when the text names no day and no time. A weekday name means its next occurrence after today (the same weekday as today means next week). "الجاي/القادم" after a weekday also means its next occurrence. If only a time is given, use today when that time is still ahead, otherwise tomorrow.
- time: 24-hour HH:MM, or null when no time or part of the day is given. ص/صباحاً/الصبح = morning, م/مساءً/العصر/المغرب/الليل = afternoon or evening. An hour from 1 to 6 with no marker means the afternoon. Parts of the day alone: الصبح 09:00، الظهر 12:00، العصر 15:30، المغرب 18:00، الليل 21:00. "بعد ساعتين" and similar are counted from the current time.
- priority: "high" only when the text says it is important or urgent (مهم، ضروري، عاجل، مستعجل), otherwise "normal".`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    date: { anyOf: [{ type: "string" }, { type: "null" }] },
    time: { anyOf: [{ type: "string" }, { type: "null" }] },
    priority: { type: "string", enum: ["normal", "high"] },
  },
  required: ["title", "date", "time", "priority"],
  additionalProperties: false,
};

async function caller(req){
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || ""); if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], JWKS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
    if (!payload.email || payload.email_verified !== true) return null;
    const email = String(payload.email).toLowerCase();
    // the user's own token reads their entry in allowed/: the Firestore rules decide who is in
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/allowed/${encodeURIComponent(email)}`, { headers: { authorization: `Bearer ${m[1]}` } });
    return r.ok ? email : null;
  } catch { return null; }
}

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: "not_configured" });
  if (!(await caller(req))) return res.status(401).json({ error: "unauthorized" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const text = String(body.text || "").trim().slice(0, 400);
  const now = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.now || "") ? body.now : null;
  const wd = Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6 ? body.weekday : null;
  if (!text || !now || wd === null) return res.status(400).json({ error: "bad_request" });

  const client = new Anthropic();
  try {
    const msg = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2048,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Now: ${now.replace("T", " ")} (${DAYS[wd]}).\nText: ${text}` }],
    });
    if (msg.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    const block = msg.content.find(b => b.type === "text");
    const out = block ? JSON.parse(block.text) : null;
    if (!out || !out.title) return res.status(502).json({ error: "empty" });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(out.date || "") ? out.date : null;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(out.time || "") ? out.time : null;
    return res.status(200).json({ title: String(out.title).slice(0, 160), date, time, priority: out.priority === "high" ? "high" : "normal" });
  } catch (e){
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: "upstream", status: e.status });
    return res.status(500).json({ error: "server" });
  }
}
