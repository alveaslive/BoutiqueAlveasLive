/* Test visuel à plusieurs joueurs (Playwright) : node tests/navigateur.cjs <dossier-captures> */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const OUT = process.argv[2] || '.';
const U = 'http://localhost:8788', UDB = 'http://localhost:8789';
(async () => {
  const srv = spawn('node', ['dev/serveur.mjs'], { env: { ...process.env, SAUVE: 'non' }, stdio: 'inherit' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  const errs = [];
  async function joueur(login, vp = { width: 1360, height: 900 }){
    const ctx = await b.newContext({ viewport: vp });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.on('pageerror', e => errs.push(`${login}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(`${login}: ${m.text()}`); });
    await p.goto(`${U}/api/dev-login?login=${login}`); await p.waitForTimeout(700); return p;
  }
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
  const a = await joueur('alveas');
  await a.goto(`${U}/#atelier`); await a.waitForTimeout(500); await a.click('#initCat'); await a.waitForTimeout(700);
  await a.goto(`${U}/#salon`); await a.waitForTimeout(500);
  await a.click('[data-pack="saison-1"]'); await a.waitForTimeout(1500); await shot(a, '01-tonte');
  await a.click('#tPasser'); await a.waitForTimeout(500); await a.click('#tFin'); await a.waitForTimeout(300);
  await a.goto(`${U}/#marche`); await a.waitForTimeout(400); await a.click('[data-om="vendre"]'); await a.waitForTimeout(300);
  await a.click('.catalogue [data-vendre]'); await a.waitForTimeout(300); await a.fill('#vDepart', '40'); await a.click('#fVente button[type=submit]'); await a.waitForTimeout(800);
  const bob = await joueur('bob'); await bob.goto(`${U}/#marche`); await bob.waitForTimeout(800);
  await bob.fill('[data-miser] input', '40'); await bob.click('[data-miser] button'); await bob.waitForTimeout(900);
  await shot(a, '02-vendeur-alerte'); await shot(bob, '03-bob-mene');
  const carl = await joueur('carl'); await carl.goto(`${U}/#marche`); await carl.waitForTimeout(800);
  await carl.fill('[data-miser] input', '120'); await carl.click('[data-miser] button'); await carl.waitForTimeout(1000);
  await shot(bob, '04-bob-surenchere');
  await bob.click('#cloche'); await bob.waitForTimeout(300); await shot(bob, '05-bob-alertes');
  await bob.keyboard.press('Escape');
  // bob ouvre un pack puis propose un échange à alveas
  await bob.goto(`${U}/#salon`); await bob.waitForTimeout(400); await bob.click('[data-pack="saison-1"]'); await bob.waitForTimeout(600); await bob.click('#tPasser'); await bob.waitForTimeout(400); await bob.click('#tFin');
  await bob.goto(`${U}/#echanges`); await bob.waitForTimeout(400); await bob.click('#nouveauTroc'); await bob.waitForTimeout(300);
  await bob.selectOption('#tA', 'tw_alveas'); await bob.waitForTimeout(700);
  await bob.click('#fTroc input[name="donne"] + .carte', { force: true }).catch(() => {});
  await bob.evaluate(() => { document.querySelector('#fTroc input[name="donne"]').checked = true; document.querySelector('#fTroc input[name="demande"]').checked = true; document.querySelector('#tR').value = 25; });
  await shot(bob, '06-troc'); await bob.click('#fTroc button[type=submit]'); await bob.waitForTimeout(900);
  await a.goto(`${U}/#echanges`); await a.waitForTimeout(800); await shot(a, '07-echange-recu');
  await a.click('[data-rep][data-ok="1"]'); await a.waitForTimeout(1000);
  // vitrine
  await a.goto(`${U}/#vitrine`); await a.waitForTimeout(400); await a.click('#editerVitrine'); await a.waitForTimeout(300);
  await a.evaluate(() => { document.querySelectorAll('#fVit input[name="vit"]').forEach((i, k) => { if (k < 3) i.checked = true; }); document.querySelector('#vDev').value = 'Le crâne le plus lisse du chat'; });
  await a.click('#fVit button[type=submit]'); await a.waitForTimeout(1200);
  await bob.goto(`${U}/#v-alveas`); await bob.waitForTimeout(1200); await shot(bob, '08-vitrine-publique');
  await bob.goto(`${U}/#classement`); await bob.waitForTimeout(500); await shot(bob, '09-classement');
  // overlay : bandeau + adjugé
  const o = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); o.on('pageerror', e => errs.push('overlay: ' + e.message));
  await o.goto(`${U}/overlay.html?bandeau=1&mise=50`); await o.waitForTimeout(1200);
  await fetch(`${UDB}/db/chauvalerie/public/encheres.json?auth=dev`).then(r => r.json()).then(async d => { for (const k of Object.keys(d)) await fetch(`${UDB}/db/chauvalerie/public/encheres/${k}.json?auth=dev`, { method: 'PATCH', body: JSON.stringify({ fin: Date.now() - 1 }) }); });
  await carl.waitForTimeout(2500);
  await o.waitForTimeout(1500); await shot(o, '10-overlay-adjuge');
  await carl.goto(`${U}/#accueil`); await carl.waitForTimeout(600); await shot(carl, '11-carl-accueil');
  const m = await joueur('bob', { width: 390, height: 844 }); await m.goto(`${U}/#marche`); await m.waitForTimeout(700); await m.click('[data-om="termine"]'); await m.waitForTimeout(300); await shot(m, '12-mobile-marche');
  await m.goto(`${U}/#v-alveas`); await m.waitForTimeout(900); await shot(m, '13-mobile-vitrine');
  console.log('erreurs', errs);
  await b.close(); srv.kill();
})();
