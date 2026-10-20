/* 6 navigateurs ouverts pendant que 19 autres joueurs jouent : node tests/charge-navigateur.cjs <dossier-captures> */
const { chromium } = require('playwright'); const { spawn } = require('child_process');
const OUT = process.argv[2] || '.', U = 'http://localhost:8788', DB = 'http://localhost:8789/db/chauvalerie';
const patch = (c, v) => fetch(`${DB}/${c}.json?auth=dev`, { method: 'PATCH', body: JSON.stringify(v) });
const lireDB = c => fetch(`${DB}/${c}.json?auth=dev`).then(r => r.json());
const pause = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const verifier = (c, m, d) => { if (c){ ok++; console.log('  ✓', m); } else { ko++; console.log('  ✗', m, d ?? ''); } };
(async () => {
  const srv = spawn('node', ['dev/serveur.mjs'], { env: { ...process.env, SAUVE: 'non', LATENCE: '30' }, stdio: 'ignore' }); await pause(1200);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); const errs = [];
  const ouvrir = async (login, vp) => { const ctx = await b.newContext({ viewport: vp || { width: 1280, height: 860 } }); await ctx.addInitScript(() => { const O = window.EventSource; window.__flux = 0; window.EventSource = function(...a){ window.__flux++; return new O(...a); }; window.EventSource.prototype = O.prototype; }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    p.on('pageerror', e => errs.push(`${login}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push(`${login}: ${m.text()}`); });
    await p.goto(`${U}/api/dev-login?login=${login}`); await pause(500); return p; };
  const api = (p, action, corps = {}) => p.evaluate(async ([a, c]) => (await fetch(`/api/${a}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) })).json(), [action, corps]);
  const admin = await ouvrir('alveas'); await api(admin, 'admin-init');
  const cat = await lireDB('public/catalogue/chauves'); const ill = {}; for (const id of Object.keys(cat)) ill[`${id}/illimite`] = true; await patch('public/catalogue/chauves', ill);
  /* 6 joueurs avec un vrai navigateur, 19 joueurs « robots » qui passent par l'API */
  const P = []; for (let i = 1; i <= 6; i++) P.push(await ouvrir(`ecran${i}`, i % 2 ? undefined : { width: 390, height: 844 }));
  const R = []; for (let i = 1; i <= 19; i++) R.push(await ouvrir(`robot${i}`));
  for (const p of [...P, ...R]) for (let k = 0; k < 3; k++) await api(p, 'pack', { pack: 'saison-1' });
  const vues = ['salon', 'chauvedex', 'marche', 'accueil', 'succes', 'broyeur'];
  for (let i = 0; i < 6; i++){ await P[i].goto(`${U}/#${vues[i]}`); await pause(300); }
  /* compteur de redessins de la page */
  const flux = await Promise.all(P.map(p => p.evaluate(() => window.__flux)));
  verifier(flux.every(n => n <= 2), `2 connexions en direct par onglet au maximum (${flux.join(', ')})`);
  for (const p of P) await p.evaluate(() => { window.__rendus = 0; new MutationObserver(() => window.__rendus++).observe(document.querySelector('#view'), { childList: true }); });
  console.log('Les robots ouvrent 57 boosters pendant que les 6 écrans sont ouverts');
  const t0 = Date.now(); await Promise.all(R.flatMap(r => [1, 2, 3].map(() => api(r, 'pack', { pack: 'saison-1' })))); await pause(1500);
  const rendus = await Promise.all(P.map(p => p.evaluate(() => window.__rendus)));
  console.log(`    en ${Date.now() - t0} ms ; redessins par écran : ${rendus.join(', ')}`);
  verifier(rendus.every((n, i) => vues[i] === 'accueil' ? n <= 40 : n <= 8), 'les boosters des autres ne font pas redessiner les pages sans raison (seul l\'Accueil suit le fil en direct)', rendus.join(','));
  /* une vente entre deux écrans : la carte doit quitter l'un et apparaître chez l'autre, sans recharger */
  console.log('Vente et échange entre deux écrans (sans jamais recharger les pages)');
  const charges = await Promise.all(P.slice(0, 2).map(p => p.evaluate(() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin)));
  const [A, Bp] = P, uidA = 'tw_ecran1', uidB = 'tw_ecran2';
  const copiesDe = async uid => Object.entries((await lireDB('copies')) || {}).filter(([, x]) => x.proprio === uid);
  const [cuid] = (await copiesDe(uidA))[0];
  const v = await api(A, 'vendre', { copie: cuid, depart: 20, duree: 0 });
  await api(Bp, 'miser', { eid: v.eid, montant: 25 });
  await patch(`public/encheres/${v.eid}`, { fin: Date.now() - 500 });
  await pause(4000);   /* une des pages ouvertes déclenche la clôture toute seule */
  const aller = (p, h) => p.evaluate(x => { location.hash = x; }, h);
  const choixVitrine = async p => { await aller(p, '#vitrine'); await pause(500); await p.click('#editerVitrine'); await pause(400); const l = await p.$$eval('#fVit input[name="vit"]', x => x.map(i => i.value)); await p.keyboard.press('Escape'); await pause(200); return l; };
  verifier((await lireDB(`public/encheres/${v.eid}/regle`)) === true, 'l\'enchère se clôture toute seule, sans que personne ne recharge la page');
  verifier(!(await choixVitrine(A)).includes(cuid), 'le chauve vendu disparaît de la collection du vendeur, en direct');
  verifier((await choixVitrine(Bp)).includes(cuid), 'il apparaît chez l\'acheteur, en direct');
  /* un échange : les deux écrans voient les chauves changer de main */
  const [ca] = (await copiesDe(uidA))[0], [cb] = (await copiesDe(uidB))[0];
  const tr = await api(A, 'echange-proposer', { a: uidB, donne: [ca], demande: [cb] });
  await aller(Bp, '#echanges'); await pause(1500);
  verifier(await Bp.$(`[data-rep="${tr.tid}"][data-ok="1"]`) !== null, 'la proposition arrive chez l\'autre joueur sans recharger');
  await Bp.click(`[data-rep="${tr.tid}"][data-ok="1"]`); await pause(1800);
  const vA = await choixVitrine(A), vB = await choixVitrine(Bp);
  verifier(vA.includes(cb) && !vA.includes(ca) && vB.includes(ca) && !vB.includes(cb), 'après l\'échange, chaque chauve est chez son nouveau propriétaire sur les deux écrans');
  await aller(A, '#echanges'); await pause(800);
  verifier((await A.textContent('#view')).includes('Accepté'), 'l\'échange s\'affiche « Accepté » chez celui qui l\'a proposé');
  /* broyage : la carte quitte la page tout de suite */
  await P[5].goto(`${U}/#broyeur`); await pause(800);
  const avantB = await P[5].$$eval('[data-broyer-g]', l => l.length);
  if (avantB){ await P[5].click('[data-broyer-g]'); await pause(300); await P[5].click('[data-q="tout"]').catch(() => {}); await pause(200); await P[5].click('#okBroie'); await pause(1500);
    verifier(await P[5].$$eval('[data-broyer-g]', l => l.length) === avantB - 1, 'un doublon broyé disparaît aussitôt de la liste'); }
  verifier((await Promise.all(P.slice(0, 2).map(p => p.evaluate(() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin)))).join() === charges.join(), 'les pages n\'ont jamais été rechargées pendant ces tests');
  for (let i = 0; i < 6; i++) await P[i].screenshot({ path: `${OUT}/ecran${i + 1}.png` });
  verifier(!errs.length, 'aucune erreur dans les navigateurs', errs.slice(0, 5).join('\n      '));
  console.log(`\n${ok} réussis, ${ko} échoués`); await b.close(); srv.kill(); process.exit(ko ? 1 : 0);
})();
