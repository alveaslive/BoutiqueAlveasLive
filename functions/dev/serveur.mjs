/* =========================================================
   Émulateur local : sert le site, les Functions et une base
   « façon Firebase » en mémoire (REST + flux temps réel SSE).
   Lancer :  node dev/serveur.mjs   puis ouvrir http://localhost:8788
   Connexion de test : /api/dev-login?login=alveas (admin) ou ?login=bob
   ========================================================= */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8788), PORT_DB = +(process.env.PORT_DB || PORT + 1);
const SAUVE = process.env.SAUVE || join(RACINE, 'dev', 'base-locale.json');
export const ENV = { FIREBASE_DB_URL: `http://localhost:${PORT_DB}/db`, DB_PREFIX: 'chauvalerie', FIREBASE_SECRET: 'dev', SESSION_SECRET: 'secret-de-dev', ADMIN_TWITCH_IDS: 'alveas', DEV: '1', TWITCH_CLIENT_ID: 'x' };

/* ---------- la base en mémoire ---------- */
let base = {};
if (process.env.SAUVE !== 'non' && existsSync(SAUVE)) base = JSON.parse(await readFile(SAUVE, 'utf8'));
const morceaux = p => p.split('/').filter(Boolean);
const lireA = (p, arbre = base) => morceaux(p).reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), arbre) ?? null;
const nettoyer = v => { if (v === null || typeof v !== 'object') return v; const o = Array.isArray(v) ? [...v] : { ...v }; for (const k in o){ o[k] = nettoyer(o[k]); if (o[k] === null || (typeof o[k] === 'object' && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k]; } return o; };
function ecrireA(p, v){
  const ks = morceaux(p); if (!ks.length){ base = nettoyer(v) || {}; return; }
  let n = base; for (const k of ks.slice(0, -1)){ if (!n[k] || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
  const der = ks.at(-1); v = nettoyer(v);
  if (v === null || v === undefined || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete n[der]; else n[der] = v;
  base = nettoyer(base) || {};
}
const etag = v => createHash('md5').update(JSON.stringify(v ?? null)).digest('hex');
let dernierPush = 0, compteurPush = 0;
function clePush(){ const t = Date.now(); compteurPush = t === dernierPush ? compteurPush + 1 : 0; dernierPush = t; return '-' + t.toString(36).padStart(9, '0') + compteurPush.toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 7); }
function valeurServeur(chemin, v){
  if (v && typeof v === 'object' && v['.sv']?.increment !== undefined) return (Number(lireA(chemin)) || 0) + v['.sv'].increment;
  return v;
}
function requete(v, q){
  if (!q.orderBy || v === null || typeof v !== 'object') return v;
  const cle = JSON.parse(q.orderBy); let ent = Object.entries(v);
  const val = ([k, x]) => cle === '$key' ? k : cle === '$value' ? x : x?.[cle];
  if (q.equalTo !== undefined){ const eq = JSON.parse(q.equalTo); ent = ent.filter(e => val(e) === eq); }
  ent.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : a[0] < b[0] ? -1 : 1));
  if (q.limitToLast) ent = ent.slice(-(+q.limitToLast));
  if (q.limitToFirst) ent = ent.slice(0, +q.limitToFirst);
  return Object.fromEntries(ent);
}
/* abonnés aux flux temps réel */
const flux = new Set();
function diffuser(){
  for (const f of flux){ const v = requete(lireA(f.chemin), f.q), s = JSON.stringify(v); if (s !== f.dernier){ f.dernier = s; f.res.write(`event: put\ndata: ${JSON.stringify({ path: '/', data: v })}\n\n`); } }
  planifierSauvegarde();
}
let minuteur = null;
function planifierSauvegarde(){ if (process.env.SAUVE === 'non') return; clearTimeout(minuteur); minuteur = setTimeout(() => writeFile(SAUVE, JSON.stringify(base)).catch(() => {}), 500); }

async function routeBase(req, res, url){
  const chemin = decodeURIComponent(url.pathname.slice(3).replace(/\.json$/, '')), q = Object.fromEntries(url.searchParams);
  const corps = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
  const envoyer = (statut, v, h = {}) => { res.writeHead(statut, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...h }); res.end(JSON.stringify(v)); };
  if (req.method === 'GET' && (req.headers.accept || '').includes('text/event-stream')){
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*', connection: 'keep-alive' });
    const f = { chemin, q, res, dernier: null }; flux.add(f);
    const v = requete(lireA(chemin), q); f.dernier = JSON.stringify(v);
    res.write(`event: put\ndata: ${JSON.stringify({ path: '/', data: v })}\n\n`);
    const ka = setInterval(() => res.write('event: keep-alive\ndata: null\n\n'), 25000);
    req.on('close', () => { flux.delete(f); clearInterval(ka); });
    return;
  }
  /* LATENCE=40 : chaque requête attend 0 à 2×40 ms, comme entre Cloudflare et Firebase (tests de charge) */
  if (process.env.LATENCE) await new Promise(r => setTimeout(r, Math.random() * 2 * +process.env.LATENCE));
  if (compteur) compteur.n++;
  const secret = q.auth === ENV.FIREBASE_SECRET;
  if (req.method !== 'GET' && !secret) return envoyer(401, { error: 'Permission denied' });
  const actuel = lireA(chemin);
  if (req.method === 'GET'){
    let v = requete(actuel, q);
    if (q.shallow === 'true' && v && typeof v === 'object') v = Object.fromEntries(Object.keys(v).map(k => [k, true]));
    return envoyer(200, v, req.headers['x-firebase-etag'] ? { etag: etag(actuel) } : {});
  }
  if (req.headers['if-match'] && req.headers['if-match'] !== etag(actuel)) return envoyer(412, actuel, { etag: etag(actuel) });
  const donnee = corps ? JSON.parse(corps) : null;
  if (req.method === 'PUT'){ ecrireA(chemin, valeurServeur(chemin, donnee)); envoyer(200, donnee); }
  else if (req.method === 'PATCH'){ for (const [k, v] of Object.entries(donnee || {})) ecrireA(`${chemin}/${k}`, valeurServeur(`${chemin}/${k}`, v)); envoyer(200, donnee); }
  else if (req.method === 'POST'){ const k = clePush(); ecrireA(`${chemin}/${k}`, donnee); envoyer(200, { name: k }); }
  else if (req.method === 'DELETE'){ ecrireA(chemin, null); envoyer(200, null); }
  diffuser();
}

/* ---------- les Functions ---------- */
const { onRequest } = await import('../functions/api/[action].js');
async function routeApi(req, res, url){
  const corps = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(r => { const d = []; req.on('data', c => d.push(c)); req.on('end', () => r(Buffer.concat(d))); });
  const request = new Request(url, { method: req.method, headers: req.headers, body: corps });
  const attentes = [];
  const reponse = await onRequest({ request, env: ENV, params: { action: url.pathname.split('/')[2] }, waitUntil: p => attentes.push(p) });
  const h = {}; reponse.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
  const cookies = reponse.headers.getSetCookie?.() || []; if (cookies.length) h['set-cookie'] = cookies.map(c => c.replace('; Secure', ''));
  res.writeHead(reponse.status, h); res.end(Buffer.from(await reponse.arrayBuffer()));
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
/* la base écoute sur son propre port, comme Firebase qui est sur un autre domaine */
export const serveurBase = http.createServer((req, res) => routeBase(req, res, new URL(req.url, `http://localhost:${PORT_DB}`)).catch(e => { console.error(e); res.writeHead(500); res.end(); }));
export const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) return await routeApi(req, res, url);
    let f = join(RACINE, 'public', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!f.startsWith(join(RACINE, 'public')) || !existsSync(f)) f = existsSync(f + '.html') ? f + '.html' : null;
    if (!f){ res.writeHead(404); return res.end('Introuvable'); }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
  } catch (e){ console.error(e); res.writeHead(500); res.end(String(e)); }
});
export const reinitialiser = (v = {}) => { base = v; diffuser(); };
export const lireBase = () => base;
/* compte les requêtes reçues par la base (tests de charge) */
let compteur = null;
export const compterRequetes = () => { compteur = { n: 0 }; return compteur; };
if (process.argv[1] === fileURLToPath(import.meta.url)){ serveurBase.listen(PORT_DB); serveur.listen(PORT, () => console.log(`La Chauvalerie en local : http://localhost:${PORT}\nConnexion de test : http://localhost:${PORT}/api/dev-login?login=alveas (admin)`)); }
