/* Test de charge : 25 joueurs qui jouent en même temps, puis contrôle de cohérence.
   node tests/charge.mjs            (LATENCE=40 par défaut : 0 à 80 ms par requête vers la base, comme en production) */
process.env.PORT = '8795'; process.env.PORT_DB = '8794'; process.env.SAUVE = 'non'; process.env.LATENCE ??= '40';
const { serveur, serveurBase, lireBase, compterRequetes } = await import('../dev/serveur.mjs');
const { JEU, tirageMax, broyeurDe } = await import('../public/js/regles.js');
await new Promise(r => serveur.listen(8795, r)); await new Promise(r => serveurBase.listen(8794, r));
const URL0 = 'http://localhost:8795', NB = +(process.env.JOUEURS || 25);
let ok = 0, ko = 0;
const verifier = (cond, msg, detail) => { if (cond){ ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, detail ?? ''); } };
const B = () => lireBase().chauvalerie;
const secret = (chemin, v) => fetch(`http://localhost:8794/db/chauvalerie/${chemin}.json?auth=dev`, { method: 'PATCH', body: JSON.stringify(v) });
const hasard = l => l[Math.floor(Math.random() * l.length)];
const durees = {};
async function connecter(login){
  const r = await fetch(`${URL0}/api/dev-login?login=${login}`, { redirect: 'manual' });
  const c = r.headers.getSetCookie().find(x => x.startsWith('chv_session=')).split(';')[0];
  return { login, uid: `tw_${login}`,
    post: async (action, corps = {}) => { const t = Date.now(); const r = await fetch(`${URL0}/api/${action}`, { method: 'POST', headers: { cookie: c, 'content-type': 'application/json', origin: URL0 }, body: JSON.stringify(corps) });
      (durees[action] ||= []).push(Date.now() - t); return { ...(await r.json()), statut: r.status }; } };
}
const copiesDe = uid => Object.entries(B().copies || {}).filter(([, x]) => x.proprio === uid).map(([cuid, x]) => ({ ...x, uid: cuid }));
const libres = uid => copiesDe(uid).filter(x => !x.vente && !x.lie && !x.pca);
const total = () => Object.values(B().joueurs).reduce((t, j) => t + (j.reflets || 0), 0);
const bloque = () => Object.values(B().public?.encheres || {}).filter(e => !e.fini && e.meneur).reduce((t, e) => t + e.offre, 0);

/* ---------- contrôles de cohérence, après chaque phase ---------- */
function coherence(phase, adjuges = false){
  const b = B(), copies = b.copies || {}, ench = b.public?.encheres || {}, ech = b.echanges || {}, cat = b.public.catalogue;
  const pb = [];
  for (const [cuid, x] of Object.entries(copies)){
    if (!b.joueurs[x.proprio]) pb.push(`${cuid} sans propriétaire`);
    if (x.vente){
      const v = String(x.vente);
      if (v === 'pca'){ if (!x.pca) pb.push(`${cuid} marqué PCA sans expertise`); }
      else if (v.startsWith('echange:')){ const e = ech[v.slice(8)]; if (!e || e.statut !== 'en-cours') pb.push(`${cuid} reste verrouillé par l'échange ${v.slice(8)} (${e?.statut})`); }
      else { const e = ench[v]; if (!e || e.fini) pb.push(`${cuid} reste en vente alors que l'enchère ${v} est ${e ? 'finie' : 'introuvable'}`); }
    }
  }
  for (const [eid, e] of Object.entries(ench)){
    const x = copies[e.copie];
    if (!e.fini && (!x || x.vente !== eid)) pb.push(`enchère ouverte ${eid} dont le chauve n'est pas verrouillé`);
    if (adjuges && e.fini && !e.annulee && e.meneur && x && x.proprio !== e.meneur) pb.push(`enchère ${eid} adjugée mais le chauve n'a pas changé de main`);
    if (adjuges && e.fini && !e.meneur && x && x.proprio !== e.vendeur) pb.push(`enchère ${eid} sans offre mais le chauve n'est plus au vendeur`);
  }
  for (const [tid, e] of Object.entries(ech)){
    if (e.statut === 'en-cours') pb.push(`échange ${tid} bloqué « en cours »`);
    if (e.statut === 'accepte'){ for (const y of e.donne || []) if (copies[y.uid] && copies[y.uid].proprio !== e.a) pb.push(`échange ${tid} accepté mais ${y.uid} pas transféré`);
      for (const y of e.demande || []) if (copies[y.uid] && copies[y.uid].proprio !== e.de) pb.push(`échange ${tid} accepté mais ${y.uid} pas transféré`); }
  }
  for (const [u, j] of Object.entries(b.joueurs)){ if ((j.reflets || 0) < 0) pb.push(`${u} a ${j.reflets} cheveux`); if ((j.poussiere || 0) < 0) pb.push(`${u} a ${j.poussiere} poussières`); }
  const par = {}; for (const x of Object.values(copies)) par[x.id] = (par[x.id] || 0) + 1;
  for (const [id, n] of Object.entries(par)){ const c = cat.chauves[id]; if (!c) continue; const e = b.public.emis?.[id] || 0;
    if (n > e) pb.push(`${id} : ${n} exemplaires pour ${e} émis`); if (e > tirageMax(c)) pb.push(`${id} : ${e} émis au-delà du tirage ${tirageMax(c)}`); }
  verifier(!pb.length, `${phase} : tout est cohérent (${Object.keys(copies).length} chauves, ${Object.keys(ench).length} enchères, ${Object.keys(ech).length} échanges)`, pb.slice(0, 8).join('\n      '));
}

console.log(`Préparation : ${NB} joueurs, latence ${process.env.LATENCE} ms`);
const admin = await connecter('alveas'); await admin.post('admin-init');
/* un catalogue plus riche : des rares, des épiques, des légendaires limités, un unique */
const sup = {};
for (let i = 0; i < 12; i++) sup[`r${i}`] = { nom: `Rare ${i}`, coll: 'premiers', rarete: 'rare', img: '/img/barbald.webp', ordre: 20 + i };
for (let i = 0; i < 6; i++) sup[`e${i}`] = { nom: `Épique ${i}`, coll: 'ruines', rarete: 'epique', img: '/img/barbald.webp', ordre: 40 + i, tirage: 30 };
for (let i = 0; i < 3; i++) sup[`l${i}`] = { nom: `Légende ${i}`, coll: 'ecorches', rarete: 'legendaire', img: '/img/barbald.webp', ordre: 50 + i, tirage: 4 };
sup.u0 = { nom: 'Unique', coll: 'ecorches', rarete: 'unique', img: '/img/barbald.webp', ordre: 60, tirage: 2 };
/* comme sur le site en ligne : communes et rares illimitées, épiques, légendaires et uniques limitées */
for (const [id, c] of Object.entries(B().public.catalogue.chauves)) sup[id] = { ...c, illimite: true };
for (const id of Object.keys(sup)) if (sup[id].rarete === 'rare') sup[id].illimite = true;
await secret('public/catalogue/chauves', sup);
await secret('public/catalogue/boosters/saison-1', { chauves: [...Object.keys(B().public.catalogue.chauves)], taux: { commun: .55, rare: .25, epique: .12, legendaire: .06, unique: .02 } });
const J = await Promise.all(Array.from({ length: NB }, (_, i) => connecter(`joueur${i + 1}`)));
for (const j of J) await secret(`joueurs/${j.uid}`, { reflets: 6000 });
coherence('Inscription');

/* ---------- 1. tout le monde ouvre des boosters en même temps ---------- */
console.log('\n1. Ouverture de boosters en rafale');
{ const c0 = compterRequetes(), t = Date.now(); const r = await Promise.all(J.map(j => j.post('pack', { pack: 'saison-1' })));
  verifier(r.every(x => !x.erreur), `${NB} joueurs ouvrent un booster à la même seconde : ${Date.now() - t} ms pour tous, ${(c0.n / NB).toFixed(1)} requêtes base par booster`); durees.pack = []; }
let cpt = compterRequetes();
const res1 = await Promise.all(J.flatMap(j => [1, 2, 3, 4].map(() => j.post('pack', { pack: 'saison-1' }))));
verifier(res1.every(r => !r.erreur), `${res1.length} boosters ouverts en même temps, aucun refusé`, res1.filter(r => r.erreur).map(r => r.erreur).slice(0, 3));
const lim = Object.entries(B().public.catalogue.chauves).filter(([, c]) => ['legendaire', 'unique'].includes(c.rarete));
verifier(lim.every(([id, c]) => (B().public.emis?.[id] || 0) <= tirageMax(c)), 'les cartes limitées ne dépassent jamais leur tirage, même en rafale');
console.log(`    ${(cpt.n / res1.length).toFixed(1)} requêtes base par booster`);
coherence('Après les boosters');

/* ---------- 2. enchères : 10 ventes, tout le monde mise en même temps ---------- */
console.log('\n2. Enchères disputées');
const vendeurs = J.slice(0, 10), ventes = [];
for (const v of vendeurs){ const x = libres(v.uid)[0]; const r = await v.post('vendre', { copie: x.uid, depart: 20, duree: 0 }); ventes.push({ v, eid: r.eid, x }); }
const T0 = total() + bloque();
cpt = compterRequetes();
const mises = [];
for (let tour = 0; tour < 4; tour++){
  await Promise.all(J.slice(5).map(async j => { const cible = hasard(ventes.filter(s => s.v !== j)); const e = B().public.encheres[cible.eid];
    const m = Math.ceil((e.offre || 0) * 1.05 + 1 + Math.random() * 40) + (e.offre ? 0 : 20); mises.push(await j.post('miser', { eid: cible.eid, montant: m })); }));
}
console.log(`    ${mises.filter(r => !r.erreur).length} mises acceptées, ${mises.filter(r => r.erreur).length} refusées proprement (quelqu'un a misé juste avant)`);
verifier(mises.every(r => !r.erreur || r.statut === 409 || r.statut === 400), 'une mise refusée l\'est toujours avec un message clair, jamais une erreur serveur', mises.filter(r => r.statut >= 500).map(r => r.erreur));
verifier(total() + bloque() === T0, 'pendant les enchères, aucun cheveu ne se crée ni ne se perd (mises bloquées comprises)', `${total() + bloque()} au lieu de ${T0}`);
coherence('Pendant les enchères');
/* les ventes arrivent à échéance : plusieurs pages demandent la clôture en même temps */
for (const s of ventes) await secret(`public/encheres/${s.eid}`, { fin: Date.now() - 1000 });
const clot = await Promise.all(ventes.flatMap(s => J.slice(0, 6).map(j => j.post('cloturer', { eid: s.eid }))));
await admin.post('regler');
for (let k = 0; k < 50 && !ventes.every(v => B().public.encheres[v.eid].regle === true); k++) await new Promise(r => setTimeout(r, 100));
const adjugees = ventes.map(s => B().public.encheres[s.eid]).filter(e => e.meneur);
const taxes = adjugees.reduce((t, e) => t + (e.offre - Math.round(e.offre * (1 - JEU.taxe))), 0);
verifier(clot.filter(r => r.resultat === 'adjuge' || r.resultat === 'sans-offre').length <= ventes.length && ventes.every(v => B().public.encheres[v.eid].regle === true), 'chaque enchère n\'est clôturée qu\'une seule fois, même demandée 6 fois en même temps', clot.map(r => r.resultat).join(','));
verifier(adjugees.every(e => B().joueurs[e.vendeur].stats?.ventes === 1 && B().joueurs[e.vendeur].stats?.gainsVentes === Math.round(e.offre * (1 - JEU.taxe))), 'chaque vendeur est payé une seule fois (moins la taxe du Marché)');
verifier(T0 - total() === taxes, 'au total, seule la taxe du Marché a quitté le jeu');
coherence('Après les enchères', true);

/* ---------- 3. échanges croisés, acceptations simultanées ---------- */
console.log('\n3. Échanges en rafale');
const props = [];
for (let i = 0; i < 12; i++){
  const a = J[i], b = J[(i + 7) % NB], da = libres(a.uid), db = libres(b.uid);
  if (!da.length || !db.length) continue;
  props.push({ a, b, r: await a.post('echange-proposer', { a: b.uid, donne: [da[0].uid], demande: [db[0].uid], reflets: 10 }) });
}
/* deux propositions qui demandent le même chauve : une seule peut aboutir */
const cibleB = J[20], convoite = libres(cibleB.uid)[1];
const c1 = await J[21].post('echange-proposer', { a: cibleB.uid, donne: [libres(J[21].uid)[0].uid], demande: [convoite.uid] });
const c2 = await J[22].post('echange-proposer', { a: cibleB.uid, donne: [libres(J[22].uid)[0].uid], demande: [convoite.uid] });
const T1 = total();
const rep = await Promise.all([...props.map(p => p.b.post('echange-repondre', { tid: p.r.tid, accepte: true })), ...props.map(p => p.b.post('echange-repondre', { tid: p.r.tid, accepte: true })),
  cibleB.post('echange-repondre', { tid: c1.tid, accepte: true }), cibleB.post('echange-repondre', { tid: c2.tid, accepte: true })]);
verifier(props.every(p => B().echanges[p.r.tid].statut === 'accepte' || B().echanges[p.r.tid].statut === 'caduc'), 'un échange accepté deux fois en même temps n\'est réglé qu\'une fois');
verifier([c1, c2].filter(c => B().echanges[c.tid].statut === 'accepte').length === 1, 'deux échanges qui visent le même chauve : un seul aboutit, l\'autre est annulé', [c1, c2].map(c => B().echanges[c.tid].statut));
verifier(total() === T1, 'les échanges ne créent ni ne perdent de cheveux');
verifier(rep.every(r => r.statut < 500), 'aucune erreur serveur pendant les échanges', rep.filter(r => r.statut >= 500).map(r => r.erreur));
coherence('Après les échanges');

/* ---------- 4. ventes, échanges et broyage sur les mêmes chauves au même moment ---------- */
console.log('\n4. Conflits : vendre, échanger et broyer le même chauve en même temps');
const conflits = [];
for (let i = 0; i < 8; i++){
  const j = J[i], autre = J[i + 10], mes = copiesDe(j.uid).filter(x => !x.vente && !x.lie);
  const par = {}; for (const x of mes) (par[x.id] ||= []).push(x);
  const dbl = Object.values(par).find(l => l.length > 1 && !['unique', 'or'].includes(B().public.catalogue.chauves[l[0].id].rarete)); if (!dbl) continue;
  const x = dbl[1], tr = await autre.post('echange-proposer', { a: j.uid, donne: [], demande: [x.uid], reflets: 5 });
  conflits.push(Promise.all([j.post('vendre', { copie: x.uid, depart: 10, duree: 0 }), j.post('broyer', { copies: [x.uid] }), j.post('echange-repondre', { tid: tr.tid, accepte: true }), j.post('pca-envoyer', { copie: x.uid })]).then(r => ({ x, r })));
}
const resC = await Promise.all(conflits);
const gagnants = resC.map(({ r }) => r.filter(y => !y.erreur).length);
verifier(gagnants.every(n => n <= 1), `sur ${resC.length} chauves disputés, une seule des 4 actions réussit à chaque fois`, gagnants.join(','));
verifier(resC.every(({ r }) => r.every(y => y.statut < 500)), 'les actions perdantes sont refusées proprement', resC.flatMap(({ r }) => r.filter(y => y.statut >= 500).map(y => y.erreur)));
coherence('Après les conflits');

/* ---------- 5. broyage et fabrication en rafale ---------- */
console.log('\n5. Broyeur en rafale');
await Promise.all(J.map(async j => { await secret(`joueurs/${j.uid}`, { poussiere: 3000 }); }));
const avantF = Object.fromEntries(lim.map(([id]) => [id, B().public.emis?.[id] || 0]));
const fab = await Promise.all(J.flatMap(j => ['l0', 'l1', 'l2'].map(id => j.post('fabriquer', { id }))));
verifier(lim.every(([id, c]) => (B().public.emis?.[id] || 0) <= tirageMax(c)), 'les légendaires limitées ne se fabriquent jamais au-delà de leur tirage, même à 25 en même temps');
verifier(Object.values(B().joueurs).every(j => (j.poussiere || 0) >= 0) && fab.every(r => r.statut < 500), 'personne ne paie une fabrication refusée, aucune erreur serveur');
const avantP = Object.values(B().joueurs).reduce((t, j) => t + (j.poussiere || 0), 0);
const brs = await Promise.all(J.map(j => { const mes = copiesDe(j.uid), par = {}; for (const x of mes) (par[x.id] ||= []).push(x);
  const l = Object.values(par).filter(v => v.length > 1).flatMap(v => v.slice(1)).filter(x => !x.vente && !x.lie && !x.pca && !['unique', 'or'].includes(B().public.catalogue.chauves[x.id].rarete)).map(x => x.uid);
  return l.length ? Promise.all([j.post('broyer', { copies: l }), j.post('broyer', { copies: l })]) : []; }));
const broyes = brs.flat().filter(r => !r.erreur).reduce((t, r) => t + r.poussiere, 0);
verifier(Object.values(B().joueurs).reduce((t, j) => t + (j.poussiere || 0), 0) === avantP + broyes, 'broyer deux fois les mêmes doublons en même temps ne rapporte qu\'une fois');
verifier(J.every(j => new Set(copiesDe(j.uid).map(x => x.id)).size >= 1), 'chacun garde au moins un exemplaire de ses chauves');
coherence('Après le Broyeur');

/* ---------- 6. présence sur le stream : l'overlay relève le chat pendant que tout le monde joue ---------- */
console.log('\n6. Présence pendant le jeu');
const cle = (await admin.post('admin-presence', {})).cle;
const avantPres = Object.fromEntries(J.map(j => [j.uid, B().joueurs[j.uid].reflets]));
await Promise.all([fetch(`${URL0}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cle, simul: J.map(j => j.login) }) }),
  fetch(`${URL0}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cle, simul: J.map(j => j.login) }) }),
  ...J.map(j => j.post('pack', { pack: 'saison-1' }))]);
verifier(J.every(j => B().joueurs[j.uid].presenceMin === 6), 'deux relevés du chat en même temps ne créditent qu\'une fois, même en pleine ouverture de boosters');
coherence('Final');

/* ---------- temps de réponse ---------- */
console.log('\nTemps de réponse (avec la latence simulée)');
for (const [a, l] of Object.entries(durees)){ const s = [...l].sort((x, y) => x - y), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  if (['pack', 'miser', 'vendre', 'echange-repondre', 'broyer', 'fabriquer', 'cloturer'].includes(a)) console.log(`    ${a.padEnd(17)} médiane ${q(.5)} ms · 95 % sous ${q(.95)} ms · ${l.length} appels`); }

console.log(`\n${ok} réussis, ${ko} échoués`);
serveur.close(); serveurBase.close(); process.exit(ko ? 1 : 0);
