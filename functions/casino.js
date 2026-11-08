// Casino de Céladopole : le site envoie une demande (échanger des doublons, jouer un tour,
// acheter un lot, utiliser une pierre, poser un cadenas). On vérifie l'identité Twitch du
// viewer (cookie de session signé), puis on dépose la demande dans Firebase pour que le BOT
// l'exécute : c'est lui la source de vérité. Le résultat est renvoyé tel que le bot l'a écrit.
// Accessible via  POST .../casino
const ACTIONS = ["exchange", "buyback", "spin", "prize", "stone", "meteorite", "lock"];

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, message: "Méthode non autorisée" }, 405);

  const login = await getLoginFromCookie(request, env);
  if (!login) return json({ ok: false, message: "Non connecté. Reconnecte-toi avec Twitch." }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, message: "Requête invalide" }, 400); }
  const action = String(body.action || "");
  if (!ACTIONS.includes(action)) return json({ ok: false, message: "Action inconnue" }, 400);

  // on ne transmet que les champs attendus, bornés
  const d = body.data || {};
  const data = {};
  if (action === "exchange") {
    data.uids = (Array.isArray(d.uids) ? d.uids : []).slice(0, 2000).map(u => String(u).slice(0, 40));
    data.precious = !!d.precious;
  }
  if (action === "buyback") data.id = String(d.id || "").slice(0, 40);
  if (action === "prize")   data.key = String(d.key || "").slice(0, 30);
  if (action === "stone")   { data.uid = String(d.uid || "").slice(0, 40); data.stone = String(d.stone || "").slice(0, 12); }
  if (action === "meteorite") { data.uid = String(d.uid || "").slice(0, 40); data.forme = String(d.forme || "").slice(0, 12); }
  if (action === "lock")    { data.uid = String(d.uid || "").slice(0, 40); data.on = !!d.on; }

  const channel = env.CHANNEL || "alveaslive";
  const dbUrl = env.FIREBASE_DB_URL;
  if (!dbUrl) return json({ ok: false, message: "Config serveur incomplète (FIREBASE_DB_URL)" }, 500);

  const reqId = "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const reqPath = `${dbUrl}/pokebot_casino/${channel}/requests/${reqId}.json`;
  const put = await fetch(reqPath, { method: "PUT", headers: { "content-type": "application/json" },
                                     body: JSON.stringify({ user: login, action, data, at: Date.now() }) });
  if (!put.ok) return json({ ok: false, message: "Impossible d'enregistrer la demande" }, 502);

  // le bot répond sous .../results/{reqId}
  const resPath = `${dbUrl}/pokebot_casino/${channel}/results/${reqId}.json`;
  for (let i = 0; i < 24; i++) {
    await sleep(i < 6 ? 250 : 500);
    const r = await fetch(resPath);
    if (r.ok) {
      const res = await r.json();
      if (res) {
        fetch(resPath, { method: "DELETE" }).catch(() => {});
        return json(res);
      }
    }
  }
  fetch(reqPath, { method: "DELETE" }).catch(() => {});
  return json({ ok: false, message: "Le bot n'a pas répondu. Il doit être allumé pour jouer au casino." }, 504);
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
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
}
