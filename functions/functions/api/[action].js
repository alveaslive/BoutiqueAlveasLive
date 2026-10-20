/* Cloudflare Pages Function : toutes les routes /api/<action>.
   Variables d'environnement : TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, FIREBASE_DB_URL, FIREBASE_SECRET,
   SESSION_SECRET, ADMIN_TWITCH_IDS (ids Twitch séparés par des virgules), DB_PREFIX (facultatif). */
import { base } from '../../lib/firebase.js';
import { signer, lire, cookie, cookies, NOM, DUREE } from '../../lib/session.js';
import { ACTIONS, PUBLIQUES, Refus, inscrire, regler, enMaintenance } from '../../lib/actions.js';

const json = (d, statut = 200, entetes = {}) => new Response(JSON.stringify(d), { status: statut, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...entetes } });
const estAdmin = (env, uid) => (env.ADMIN_TWITCH_IDS || '').split(',').map(s => s.trim()).filter(Boolean).some(id => uid === `tw_${id}`);

export async function onRequest(context){
  const { request, env, params } = context, action = params.action, url = new URL(request.url);
  const secure = url.protocol === 'https:', db = base(env);
  try {
    /* ----- configuration publique pour le navigateur ----- */
    if (action === 'config') return json({ db: env.FIREBASE_DB_URL, prefixe: env.DB_PREFIX ?? 'chauvalerie' });

    /* ----- connexion Twitch ----- */
    if (action === 'login'){
      /* ?presence=1 : l'admin autorise la lecture de la liste du chat (cheveux gagnés en regardant le stream) */
      const presence = url.searchParams.get('presence') === '1', etat = (presence ? 'p-' : '') + crypto.randomUUID();
      const auth = new URL('https://id.twitch.tv/oauth2/authorize');
      auth.search = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, redirect_uri: `${url.origin}/api/callback`, response_type: 'code', scope: presence ? 'moderator:read:chatters' : '', state: etat, ...(presence ? { force_verify: 'true' } : {}) });
      return new Response(null, { status: 302, headers: { location: auth.toString(), 'set-cookie': cookie('chv_etat', etat, { maxAge: 600, secure }) } });
    }
    if (action === 'callback'){
      const code = url.searchParams.get('code'), etat = url.searchParams.get('state');
      if (!code || !etat || etat !== cookies(request).chv_etat) return new Response('Connexion refusée ou expirée. Réessaie depuis le site.', { status: 400 });
      const tok = await (await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: `${url.origin}/api/callback` }) })).json();
      if (!tok.access_token) return new Response('Twitch a refusé la connexion.', { status: 400 });
      const u = (await (await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` } })).json()).data?.[0];
      if (!u) return new Response('Profil Twitch introuvable.', { status: 400 });
      /* jeton de la chaîne gardé côté serveur pour relever la liste du chat (jamais lisible par les navigateurs) */
      if (etat.startsWith('p-') && estAdmin(env, `tw_${u.id}`) && tok.refresh_token)
        await db.set('prive/twitch', { id: u.id, login: u.login, acces: tok.access_token, refresh: tok.refresh_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 });
      return await ouvrirSession(db, env, u, secure, etat.startsWith('p-') ? '/#atelier' : '/');
    }
    /* connexion de test, uniquement avec DEV=1 (jamais en production) */
    if (action === 'dev-login' && env.DEV === '1'){
      const login = (url.searchParams.get('login') || 'testeur').toLowerCase().replace(/[^a-z0-9_]/g, '');
      return await ouvrirSession(db, env, { id: url.searchParams.get('id') || login, login, display_name: url.searchParams.get('nom') || login }, secure);
    }
    if (action === 'logout') return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookie(NOM, '', { maxAge: 0, secure }) } });

    /* ----- image d'un chauve ajouté depuis l'Atelier ----- */
    if (action === 'image'){
      const donnee = await db.get(`images/${(url.searchParams.get('id') || '').replace(/[^a-z0-9-]/g, '')}`);
      if (!donnee) return new Response('Introuvable', { status: 404 });
      const [entete, b64] = donnee.split(',');
      return new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { headers: { 'content-type': entete.slice(5).split(';')[0], 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    const session = await lire(request, env.SESSION_SECRET);
    const moi = session ? { uid: session.uid, nom: session.nom, admin: estAdmin(env, session.uid) } : null;

    if (action === 'me'){
      if (!moi) return json({ connecte: false });
      return json({ connecte: true, uid: moi.uid, nom: moi.nom, admin: moi.admin });
    }

    /* ----- actions du jeu : POST uniquement, depuis le site lui-même ----- */
    const fn = ACTIONS[action];
    if (!fn) return json({ erreur: 'Action inconnue' }, 404);
    if (request.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);
    const origine = request.headers.get('origin');
    if (origine && origine !== url.origin) return json({ erreur: 'Origine refusée' }, 403);
    if (!moi && !PUBLIQUES.has(action)) return json({ erreur: 'Connecte-toi avec Twitch pour jouer' }, 401);
    /* mode maintenance : seul l'admin peut jouer (la présence sur le stream continue d'être créditée) */
    if (!moi?.admin && action !== 'presence' && await enMaintenance(db)) return json({ erreur: 'Le Salon est en maintenance, reviens un peu plus tard', maintenance: true }, 503);
    const corps = await request.json().catch(() => ({}));
    const res = await fn(db, moi, corps, env);
    /* chaque action en profite pour clôturer les enchères échues */
    if (action !== 'regler') context.waitUntil?.(regler(db).catch(() => {}));
    return json(res);
  } catch (e){
    if (e instanceof Refus) return json({ erreur: e.message }, e.statut);
    console.error(e);
    return json({ erreur: 'Erreur du serveur, réessaie dans un instant' }, 500);
  }
}

async function ouvrirSession(db, env, profil, secure, retour = '/'){
  const uid = await inscrire(db, profil);
  const jeton = await signer({ uid, nom: profil.display_name || profil.login }, env.SESSION_SECRET);
  const h = new Headers({ location: retour });
  h.append('set-cookie', cookie(NOM, jeton, { maxAge: DUREE / 1000, secure }));
  h.append('set-cookie', cookie('chv_etat', '', { maxAge: 0, secure }));
  return new Response(null, { status: 302, headers: h });
}
