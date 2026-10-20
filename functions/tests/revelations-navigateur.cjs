/* Test visuel des révélations (légendaire, unique) : node tests/revelations-navigateur.cjs <dossier> */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const OUT = process.argv[2] || '.', U = 'http://localhost:8788', UDB = 'http://localhost:8789';
const base = (methode, chemin, v) => fetch(`${UDB}/db/chauvalerie/${chemin}.json?auth=dev`, { method: methode, body: JSON.stringify(v) });
(async () => {
  const srv = spawn('node', ['dev/serveur.mjs'], { env: { ...process.env, SAUVE: 'non' }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', e => errs.push(e.message));
  const shot = n => p.screenshot({ path: `${OUT}/${n}.png` });
  await p.goto(`${U}/api/dev-login?login=alveas`); await p.waitForTimeout(600);
  await p.evaluate(() => fetch('/api/admin-init', { method: 'POST' }));
  /* un booster truqué : 2 communs, 1 épique, 1 légendaire, 1 unique */
  await base('PATCH', 'public/catalogue/chauves/massacrane', { rarete: 'epique', tirage: 1 });
  await base('PATCH', 'public/catalogue/chauves/bladwall', { rarete: 'legendaire', tirage: 1 });
  await base('PATCH', 'public/catalogue/chauves/barbald', { rarete: 'unique', tirage: 1 });
  await base('PATCH', 'public/emis', { 'front-de-fer': 498 });
  await base('PUT', 'public/catalogue/boosters/saison-1/chauves', ['front-de-fer', 'massacrane', 'bladwall', 'barbald']);
  await p.goto(`${U}/#salon`); await p.waitForTimeout(800);
  await p.click('[data-pack="saison-1"]');
  const etapes = [[3700, 'r1-dos'], [1500, 'r2-communs'], [1500, 'r3-epique'], [1500, 'r4-leg-charge'], [450, 'r5-leg-explosion'], [900, 'r6-leg'], [2300, 'r7-unique-noir'], [1300, 'r8-unique-montee'], [1450, 'r9-unique-explosion'], [900, 'r10-unique'], [2200, 'r11-unique-suite'], [4200, 'r12-fin']];
  for (const [ms, nom] of etapes){ await p.waitForTimeout(ms); await shot(nom); }
  console.log(await p.evaluate(() => [...document.querySelectorAll('.fente .nom')].map(x => x.textContent).join(', ')));
  await p.click('#tFin');
  console.log('erreurs', errs); await b.close(); srv.kill();
})();
