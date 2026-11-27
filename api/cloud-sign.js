// POST /api/cloud-sign  { folder }  →  { cloudName, apiKey, timestamp, folder, signature }
// Signs a Cloudinary upload on the server so the upload preset no longer has to be open to anyone.
// Only signed-in users listed in Firestore allowed/{email} get a signature, and only for a folder under the site's own.
// Needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Vercel; without them it answers 501
// and the site keeps using the unsigned preset.
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT = "aoshaban-87979";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

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
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !key || !secret) return res.status(501).json({ error: "not_configured" });
  if (!(await caller(req))) return res.status(401).json({ error: "unauthorized" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const folder = String(body.folder || "").replace(/[^\w\-/]/g, "").replace(/\/{2,}/g, "/").replace(/^\/|\/$/g, "").slice(0, 120);
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { ...(folder ? { folder } : {}), timestamp };
  const toSign = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  const signature = crypto.createHash("sha1").update(toSign + secret).digest("hex");
  return res.status(200).json({ cloudName: cloud, apiKey: key, timestamp, folder, signature });
}
