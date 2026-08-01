// Renvoie la boîte de Pokémon du viewer connecté (uid, nom, puissance, niveau, shiny),
// lue dans Firebase, pour que le site laisse choisir quel Pokémon proposer à l'échange.
// Accessible via .../mybox
export async function onRequest(context) {
  const { request, env } = context;
  const login = await getLoginFromCookie(request, env);
  if (!login) return json({ box: null });

  try {
    const dbUrl = env.FIREBASE_DB_URL;
    const channel = env.CHANNEL || "alveaslive";
    if (!dbUrl) return json({ box: null });
    const key = normKey(login);
    // le bot publie le dex/box sous players/{key}. On lit la liste des exemplaires.
    const r = await fetch(`${dbUrl}/pokebot/${channel}/players/${key}.json`);
    if (!r.ok) return json({ box: [] });
    const player = await r.json();
    if (!player) return json({ box: [] });
    // le bot expose la boîte détaillée sous "webbox" (uid/nom/pow/lvl/shiny) — voir note ci-dessous
    const box = Array.isArray(player.webbox) ? player.webbox : [];
    return json({ box, login });
  } catch (e) {
    return json({ box: [] });
  }
}

function json(obj) { return new Response(JSON.stringify(obj), { headers: { "content-type": "application/json; charset=utf-8" } }); }
function normKey(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }

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
