// Renvoie le login du viewer connecté (lu depuis le cookie signé), pour que
// la boutique affiche « connecté en tant que X ». Accessible via .../me
export async function onRequest(context) {
  const { request, env } = context;
  const login = await getLoginFromCookie(request, env);
  return new Response(JSON.stringify({ login: login || null }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
async function getLoginFromCookie(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)pb_session=([^;]+)/);
  if (!m) return null;
  const value = decodeURIComponent(m[1]);
  const [payloadB64, sig] = value.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = await hmac(payloadB64, env.TWITCH_CLIENT_SECRET);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.login || !payload.exp || Date.now() > payload.exp) return null;
    return payload.login;
  } catch { return null; }
}
async function hmac(data, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
}
