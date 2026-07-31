// Renvoie le login du viewer connecté ET son solde de pièces (lu dans Firebase),
// pour que la boutique affiche « 👤 pseudo · 💰 solde ». Accessible via .../me
export async function onRequest(context) {
  const { request, env } = context;
  const login = await getLoginFromCookie(request, env);
  if (!login) {
    return json({ login: null, coins: null });
  }

  // Lire le solde du joueur dans Firebase. La clé du joueur = pseudo normalisé
  // (minuscules, sans accents ni caractères spéciaux) — même règle que le bot.
  let coins = null;
  try {
    const dbUrl = env.FIREBASE_DB_URL;
    const channel = env.CHANNEL || "alveaslive";
    if (dbUrl) {
      const key = normKey(login);
      const r = await fetch(`${dbUrl}/pokebot/${channel}/players/${key}/coins.json`);
      if (r.ok) {
        const val = await r.json();
        if (typeof val === "number") coins = val;
      }
    }
  } catch (e) { /* si la lecture échoue, on renvoie juste le login sans le solde */ }

  return json({ login, coins });
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

// même normalisation que le bot : minuscules, sans accents, sans caractères spéciaux
function normKey(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
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
