// Reçoit une action de duel du navigateur (lancer un défi / accepter / annuler),
// vérifie l'identité Twitch (cookie signé), puis dépose l'action dans Firebase
// pour que le BOT la valide et résolve (source de vérité). Accessible via POST .../duel
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, error: "Méthode non autorisée" }, 405);

  const login = await getLoginFromCookie(request, env);
  if (!login) return json({ ok: false, error: "Non connecté. Reconnecte-toi avec Twitch." }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Requête invalide" }, 400); }

  const type = String(body.type || "");
  if (!["challenge", "accept", "cancel"].includes(type)) return json({ ok: false, error: "Action inconnue" }, 400);

  const dbUrl = env.FIREBASE_DB_URL;
  const channel = env.CHANNEL || "alveaslive";
  if (!dbUrl) return json({ ok: false, error: "Config serveur incomplète (FIREBASE_DB_URL)" }, 500);

  // on injecte toujours le login vérifié, jamais celui du body
  const action = { type, user: login, at: Date.now() };
  if (type === "challenge") { action.toName = String(body.toName || ""); }
  if (type === "accept")    { action.challengeId = String(body.challengeId || ""); }
  if (type === "cancel")    { action.challengeId = String(body.challengeId || ""); action.mod = body.mod ? 1 : 0; }

  const actId = "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const actPath = `${dbUrl}/pokebot_duels/${channel}/actions/${actId}.json`;
  const put = await fetch(actPath, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
  if (!put.ok) return json({ ok: false, error: "Impossible d'enregistrer l'action" }, 502);

  const resPath = `${dbUrl}/pokebot_duels/${channel}/results/${actId}.json`;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const r = await fetch(resPath);
    if (r.ok) {
      const data = await r.json();
      if (data) {
        fetch(resPath, { method: "DELETE" }).catch(() => {});
        return json({ ok: !!data.ok, message: data.message || "", error: data.ok ? undefined : (data.message || "Refusé"), challengeId: data.challengeId, winner: data.winner });
      }
    }
  }
  fetch(actPath, { method: "DELETE" }).catch(() => {});
  return json({ ok: false, error: "Le bot n'a pas répondu. Il doit être allumé pour les duels." }, 504);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
