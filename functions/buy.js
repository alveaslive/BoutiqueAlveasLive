// Reçoit une demande d'achat du navigateur, vérifie l'identité Twitch du viewer
// (via le cookie de session posé à la connexion), puis dépose la demande dans
// Firebase pour que le BOT la traite (le bot est la source de vérité des pièces).
// Accessible via  POST .../buy
// les 21 badges Pokémon d'Halloween (vendus à l'unité)
const HW_BADGES = ["b_pikachu", "b_evoli", "b_ecto", "b_salameche", "b_carapuce", "b_bulbi", "b_noctali", "b_miaouss", "b_goupix",
  "b_colossinge", "b_psykokwak", "b_caninos", "b_lokhlass", "b_togepi", "b_marill", "b_hoothoot", "b_germignon", "b_hericendre", "b_kaiminus", "b_scarhino", "b_teddiursa"];

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json({ ok: false, error: "Méthode non autorisée" }, 405);
  }

  // 1) Qui est connecté ? On lit le cookie de session signé posé par /auth.
  const login = await getLoginFromCookie(request, env);
  if (!login) {
    return json({ ok: false, error: "Non connecté. Reconnecte-toi avec Twitch." }, 401);
  }

  // 2) Que veut-il acheter ?
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Requête invalide" }, 400); }
  const item = String(body.item || "").toLowerCase();
  let qty = parseInt(body.qty, 10); if (!Number.isFinite(qty) || qty < 1) qty = 1; qty = Math.min(qty, 99);

  const allowed = ["superball", "hyperball", "masterball", "superbonbon",
    // Event Halloween 🎃 : articles payés en bonbons (le bot vérifie que l'event est actif)
    "hw_legendaire", "hw_oeuf", "hw_titre", "hw_cadre", "hw_bordure", "hw_fondnuit",
    ...HW_BADGES.map(b => "hw_" + b),
    // afficher / masquer une déco possédée (gratuit)
    "hwt_cadre", "hwt_bordure", "hwt_fondnuit", ...HW_BADGES.map(b => "hwt_" + b)];
  if (!allowed.includes(item)) return json({ ok: false, error: "Objet inconnu" }, 400);
  if (item.startsWith("hw")) qty = 1;   // articles et réglages d'event : un seul à la fois

  // 3) Déposer la demande dans Firebase, sous un identifiant unique.
  const channel = env.CHANNEL || "alveaslive";
  const dbUrl = env.FIREBASE_DB_URL; // ex: https://pokebot-25974-default-rtdb.europe-west1.firebasedatabase.app
  if (!dbUrl) return json({ ok: false, error: "Config serveur incomplète (FIREBASE_DB_URL)" }, 500);

  const reqId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const reqPath = `${dbUrl}/pokebot_shop/${channel}/requests/${reqId}.json`;

  const putRes = await fetch(reqPath, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: login, item, qty, at: Date.now() })
  });
  if (!putRes.ok) return json({ ok: false, error: "Impossible d'enregistrer la demande" }, 502);

  // 4) Attendre la réponse du bot (il écrit sous .../results/{reqId}).
  //    On sonde quelques secondes ; si le bot est éteint, on le signale.
  const resPath = `${dbUrl}/pokebot_shop/${channel}/results/${reqId}.json`;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const r = await fetch(resPath);
    if (r.ok) {
      const data = await r.json();
      if (data) {
        // nettoyer le résultat pour ne pas encombrer la base
        fetch(resPath, { method: "DELETE" }).catch(() => {});
        return json({ ok: !!data.ok, message: data.message || "", coins: data.coins, candy: data.candy, decoOff: data.decoOff, hwLegend: data.hwLegend });
      }
    }
  }
  // pas de réponse : le bot est probablement hors ligne
  fetch(reqPath, { method: "DELETE" }).catch(() => {});
  return json({ ok: false, error: "Le bot n'a pas répondu. Il doit être allumé pour acheter." }, 504);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Lit le cookie de session "pb_session" et en extrait le login Twitch, après
// vérification de la signature (le secret sert à empêcher la falsification).
async function getLoginFromCookie(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)pb_session=([^;]+)/);
  if (!m) return null;
  const value = decodeURIComponent(m[1]);
  const [payloadB64, sig] = value.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = await hmac(payloadB64, env.TWITCH_CLIENT_SECRET);
  if (sig !== expected) return null; // signature invalide → cookie falsifié
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.login || !payload.exp || Date.now() > payload.exp) return null;
    return payload.login;
  } catch { return null; }
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
}
