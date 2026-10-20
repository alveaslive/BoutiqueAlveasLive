/* Test visuel des cartes : node tests/cartes-navigateur.cjs <dossier-captures> */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const OUT = process.argv[2] || '.', U = 'http://localhost:8788', UDB = 'http://localhost:8789';
const base = (methode, chemin, v) => fetch(`${UDB}/db/chauvalerie/${chemin}.json?auth=dev`, { method: methode, body: JSON.stringify(v) });
(async () => {
  const srv = spawn('node', ['dev/serveur.mjs'], { env: { ...process.env, SAUVE: 'non' }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(), errs = [];
  const ctx = await b.newContext({ viewport: { width: 1360, height: 950 } }), p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', e => errs.push(e.message));
  const post = (a, c = {}) => p.evaluate(([a, c]) => fetch('/api/' + a, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }).then(r => r.json()), [a, c]);
  const shot = n => p.screenshot({ path: `${OUT}/${n}.png` });
  await p.goto(`${U}/api/dev-login?login=alveas`); await p.waitForTimeout(600);
  await post('admin-init');
  /* quelques chauves passent en rare / épique / légendaire / unique pour voir tous les cadres */
  for (const [id, rarete] of [['cranisse', 'rare'], ['massacrane', 'epique'], ['bladwall', 'legendaire'], ['barbald', 'unique']]) await base('PATCH', `public/catalogue/chauves/${id}`, { rarete });
  await base('PATCH', 'joueurs/tw_alveas', { reflets: 50000 });
  const copies = [];
  for (let i = 0; i < 6; i++) copies.push(...((await post('pack', { pack: 'saison-1' })).copies || []));
  await base('PUT', 'copies/u1', { id: 'barbald', no: 1, chrome: false, proprio: 'tw_alveas', t: Date.now() });
  await p.goto(`${U}/#chauvedex`); await p.waitForTimeout(900); await shot('c1-chauvedex');
  const de = id => copies.find(x => x.id === id);
  for (const [x, depart, duree] of [[de('bladwall'), 800, 1], [de('massacrane'), 200, 0], [{ uid: 'u1' }, 4000, 2], [de('front-de-fer'), 30, 0], [de('cranisse'), 90, 1]]) if (x) await post('vendre', { copie: x.uid, depart, duree });
  await p.goto(`${U}/#marche`); await p.waitForTimeout(600); await p.click('[data-om="ventes"]'); await p.waitForTimeout(500); await shot('c2-marche');
  await p.click('[data-lot]'); await p.waitForTimeout(500); await shot('c3-enchere'); await p.keyboard.press('Escape');
  await p.goto(`${U}/#salon`); await p.waitForTimeout(500); await p.click('[data-pack="saison-1"]'); await p.waitForTimeout(1300); await shot('c4-tonte');
  await p.waitForTimeout(4800); await shot('c5-tonte-fin'); await p.click('#tFin');
  await post('vitrine', { copies: copies.filter(x => ['tankrane', 'cranombre', 'apothicrane'].includes(x.id) ).slice(0, 4).map(x => x.uid), devise: 'Le crâne le plus lisse du chat' });
  await p.goto(`${U}/#vitrine`); await p.waitForTimeout(1300); await shot('c6-vitrine');
  const o = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); o.on('pageerror', e => errs.push('overlay ' + e.message));
  await o.goto(`${U}/overlay.html?test=1`); await o.waitForTimeout(2500); await o.screenshot({ path: `${OUT}/c7-overlay.png` });
  await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${U}/#chauvedex`); await p.waitForTimeout(900); await shot('c8-mobile');
  console.log('erreurs', errs); await b.close(); srv.kill();
})();
