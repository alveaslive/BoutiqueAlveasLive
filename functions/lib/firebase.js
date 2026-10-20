/* Accès à Firebase Realtime Database par l'API REST, avec le secret de la base.
   Seules les Functions l'utilisent : les règles interdisent toute écriture aux navigateurs. */
export function base(env){
  const racine = env.FIREBASE_DB_URL.replace(/\/$/, ''), prefixe = env.DB_PREFIX ?? 'chauvalerie', secret = env.FIREBASE_SECRET;
  const url = (chemin, q = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) p.set(k, typeof v === 'string' && !['shallow', 'print'].includes(k) ? JSON.stringify(v) : String(v));
    if (secret) p.set('auth', secret);
    return `${racine}/${[prefixe, chemin].filter(Boolean).join('/')}.json?${p}`;
  };
  async function req(methode, chemin, corps, q, entetes = {}){
    const r = await fetch(url(chemin, q), { method: methode, headers: { 'content-type': 'application/json', ...entetes }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    if (!r.ok && r.status !== 412) throw new Error(`Firebase ${methode} ${chemin} : ${r.status} ${await r.text()}`);
    return r;
  }
  return {
    get: async (chemin, q) => (await req('GET', chemin, undefined, q)).json(),
    set: async (chemin, v) => { await req('PUT', chemin, v); },
    update: async (chemin, v) => { await req('PATCH', chemin, v); },
    push: async (chemin, v) => (await (await req('POST', chemin, v)).json()).name,
    del: async chemin => { await req('DELETE', chemin); },
    /* incrément atomique côté serveur */
    inc: async (chemin, n) => { await req('PUT', chemin, { '.sv': { increment: n } }); },
    /* incrément à placer dans une écriture groupée : db.update('', { 'a/b': INC(1), ... }) */
    INC: n => ({ '.sv': { increment: n } }),
    /* transaction : fn reçoit la valeur actuelle et renvoie la nouvelle, ou undefined pour abandonner */
    async tx(chemin, fn, essais = 40){
      for (let i = 0; i < essais; i++){
        /* conflit : on réessaie après une petite pause au hasard, de plus en plus longue, pour que tout le monde ne réessaie pas en même temps */
        if (i) await new Promise(r => setTimeout(r, Math.random() * Math.min(400, 15 * 2 ** Math.min(i, 5))));
        const r = await req('GET', chemin, undefined, undefined, { 'X-Firebase-ETag': 'true' });
        const etag = r.headers.get('ETag'), actuel = await r.json(), suivant = fn(actuel);
        if (suivant === undefined) return { ok: false, valeur: actuel };
        const w = await req('PUT', chemin, suivant, undefined, { 'if-match': etag });
        if (w.status !== 412) return { ok: true, valeur: suivant, avant: actuel };
      }
      throw new Error('Trop de monde en même temps, réessaie');
    },
  };
}
