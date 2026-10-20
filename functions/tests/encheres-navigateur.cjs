/* Test visuel des enchères à plusieurs : node tests/encheres-navigateur.cjs <dossier-captures> */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const OUT = process.argv[2] || '.', U = 'http://localhost:8788', UDB = 'http://localhost:8789';
const patch = (chemin, v) => fetch(`${UDB}/db/chauvalerie/${chemin}.json?auth=dev`, { method: 'PATCH', body: JSON.stringify(v) });
(async () => {
  const srv = spawn('node', ['dev/serveur.mjs'], { env: { ...process.env, SAUVE: 'non' }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(), errs = [];
  async function joueur(login, vp = { width: 1360, height: 900 }){
    const p = await (await b.newContext({ viewport: vp })).newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', e => errs.push(`${login}: ${e.message}`));
    await p.goto(`${U}/api/dev-login?login=${login}`); await p.waitForTimeout(700); return p;
  }
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
  const a = await joueur('alveas');
  await a.evaluate(() => fetch('/api/admin-init', { method: 'POST' }));
  const pk = await a.evaluate(() => fetch('/api/pack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pack: 'saison-1' }) }).then(r => r.json()));
  await a.evaluate(c => fetch('/api/vendre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ copie: c, depart: 40, duree: 1 }) }), pk.copies[0].uid);
  await a.evaluate(c => fetch('/api/vendre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ copie: c, depart: 25, duree: 0 }) }), pk.copies[1].uid);
  const bob = await joueur('bob'), carl = await joueur('carl');
  for (const p of [bob, carl]){ await p.goto(`${U}/#marche`); await p.waitForTimeout(700); }
  await shot(bob, 'e1-marche');
  await bob.click('[data-lot] >> nth=1'); await bob.waitForTimeout(300);
  await bob.click('[data-rapide]'); await bob.waitForTimeout(800);
  await carl.click('[data-lot] >> nth=1'); await carl.waitForTimeout(300);
  await carl.fill('#mMontant', '90'); await carl.click('#fMise button[type=submit]'); await carl.waitForTimeout(800);
  await shot(bob, 'e2-bob-voit-carl');
  await bob.click('[data-rapide]'); await bob.waitForTimeout(800);
  const eid = await bob.evaluate(() => document.querySelector('#enchere').dataset.eid);
  await patch(`public/encheres/${eid}`, { fin: Date.now() + 7000 }); await carl.waitForTimeout(1500);
  await shot(carl, 'e3-carl-dernieres-secondes');
  await carl.click('[data-rapide]'); await carl.waitForTimeout(1200);
  await shot(carl, 'e4-relance');
  await shot(a, 'e5-vendeur');
  const m = await joueur('bob', { width: 390, height: 844 }); await m.goto(`${U}/#marche`); await m.waitForTimeout(700); await shot(m, 'e6-mobile-marche');
  await m.click('[data-lot] >> nth=1'); await m.waitForTimeout(500); await shot(m, 'e7-mobile-enchere');
  await m.evaluate(() => document.querySelector('.modal-in').scrollTo(0, 9999)); await m.waitForTimeout(200); await shot(m, 'e8-mobile-historique');
  console.log('erreurs', errs); await b.close(); srv.kill();
})();
