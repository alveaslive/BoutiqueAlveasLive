/* Écoute temps réel de Firebase par le flux REST (EventSource), sans SDK.
   Utilisé par le site et par l'overlay. */
let BASE = '';
export async function configurer(){
  const c = await (await fetch('/api/config')).json();
  BASE = `${c.db.replace(/\/$/, '')}/${c.prefixe}`;
  return BASE;
}
const params = q => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(q || {})) p.set(k, JSON.stringify(v)); return p.toString(); };

function poser(racine, chemin, donnee){
  const ks = chemin.split('/').filter(Boolean);
  if (!ks.length) return donnee;
  const copie = racine && typeof racine === 'object' ? { ...racine } : {};
  const [k, ...reste] = ks;
  const v = poser(copie[k], reste.join('/'), donnee);
  if (v === null || v === undefined) delete copie[k]; else copie[k] = v;
  return copie;
}

/* ecouter('encheres', {}, donnees => ...) ; renvoie une fonction pour arrêter */
export function ecouter(chemin, q, rappel){
  let donnee = null, es = null, arret = false, delai = 1000;
  const ouvrir = () => {
    es = new EventSource(`${BASE}/${chemin}.json?${params(q)}`);
    es.addEventListener('put', e => { const m = JSON.parse(e.data); donnee = poser(donnee, m.path, m.data); delai = 1000; rappel(donnee || {}); });
    es.addEventListener('patch', e => { const m = JSON.parse(e.data); for (const [k, v] of Object.entries(m.data || {})) donnee = poser(donnee, `${m.path}/${k}`, v); rappel(donnee || {}); });
    es.onerror = () => { if (arret) return; es.close(); setTimeout(() => { if (!arret) ouvrir(); }, delai); delai = Math.min(delai * 2, 20000); };
  };
  ouvrir();
  return () => { arret = true; es?.close(); };
}
export async function lire(chemin, q){ return (await (await fetch(`${BASE}/${chemin}.json?${params(q)}`)).json()) || {}; }
