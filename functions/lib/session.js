/* Session signée (HMAC-SHA256) dans un cookie HttpOnly, comme pour le PokéBot. */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const cle = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export const NOM = 'chv_session';
export const DUREE = 30 * 864e5;

export async function signer(donnees, secret){
  const corps = b64u(enc.encode(JSON.stringify({ ...donnees, exp: Date.now() + DUREE })));
  return `${corps}.${b64u(await crypto.subtle.sign('HMAC', await cle(secret), enc.encode(corps)))}`;
}
export async function lire(requete, secret){
  const brut = cookies(requete)[NOM]; if (!brut || !secret) return null;
  const [corps, sig] = brut.split('.'); if (!corps || !sig) return null;
  try {
    if (!await crypto.subtle.verify('HMAC', await cle(secret), deB64u(sig), enc.encode(corps))) return null;
    const s = JSON.parse(new TextDecoder().decode(deB64u(corps)));
    return s.exp > Date.now() ? s : null;
  } catch { return null; }
}
export function cookies(requete){
  const out = {};
  for (const p of (requete.headers.get('cookie') || '').split(';')){ const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return out;
}
export function cookie(nom, valeur, { maxAge, secure = true } = {}){
  return `${nom}=${encodeURIComponent(valeur)}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${maxAge !== undefined ? `; Max-Age=${maxAge}` : ''}`;
}
