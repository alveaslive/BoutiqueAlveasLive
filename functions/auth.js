// Reçoit le retour de Twitch après autorisation, échange le code contre
// l'identité du viewer, pose un cookie de session signé, et renvoie au pokédex.
export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri = url.origin + "/auth";

  const page = (titre, corps, headers) => new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${titre}</title>
     <style>
       body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#1a1230;color:#f7f5ef;font-family:system-ui,sans-serif;text-align:center}
       .card{background:#241f38;border:2px solid #2d63c8;border-radius:16px;padding:32px 28px;max-width:420px}
       h1{font-size:1.3rem;margin:0 0 12px}
       p{color:#b8a8d8;line-height:1.5;margin:8px 0}
       a{display:inline-block;margin-top:18px;background:#2d63c8;color:#fff;text-decoration:none;
         padding:10px 20px;border-radius:9px;font-weight:700}
     </style></head><body><div class="card">${corps}</div></body></html>`,
    { headers: Object.assign({ "content-type": "text/html; charset=utf-8" }, headers || {}) }
  );

  if (!code) {
    return page("Erreur", "<h1>❌ Connexion annulée</h1><p>Aucun code reçu de Twitch.</p><a href='/login'>Réessayer</a>");
  }

  try {
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });
    const token = await tokenRes.json();
    if (!token.access_token) {
      return page("Erreur", "<h1>❌ Échec</h1><p>Twitch n'a pas renvoyé de jeton.</p><a href='/login'>Réessayer</a>");
    }

    const userRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: { "Authorization": "Bearer " + token.access_token, "Client-Id": env.TWITCH_CLIENT_ID }
    });
    const userData = await userRes.json();
    const me = userData.data && userData.data[0];
    if (!me) {
      return page("Erreur", "<h1>❌ Échec</h1><p>Impossible de lire ton profil Twitch.</p><a href='/login'>Réessayer</a>");
    }

    // Cookie de session signé : { login, exp } + signature HMAC (secret = anti-falsification)
    const payload = { login: me.display_name, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 };
    const payloadB64 = btoa(JSON.stringify(payload));
    const sig = await hmac(payloadB64, env.TWITCH_CLIENT_SECRET);
    const cookieVal = encodeURIComponent(payloadB64 + "." + sig);
    const cookie = `pb_session=${cookieVal}; Path=/; Max-Age=${60 * 60 * 24 * 7}; HttpOnly; Secure; SameSite=Lax`;

    return new Response(null, {
      status: 302,
      headers: { "Location": "/?connected=1#shop", "Set-Cookie": cookie }
    });
  } catch (e) {
    return page("Erreur", "<h1>❌ Erreur serveur</h1><p>" + escapeHtml(String(e.message || e)) + "</p><a href='/login'>Réessayer</a>");
  }
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
