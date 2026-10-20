/* =========================================================
   La Chauverie — le site (navigateur)
   Lit tout en temps réel depuis Firebase, agit via /api/*.
   ========================================================= */
import { JEU, RARETES, ORDRE_R, GRADES, SUCCES, FAMILLES_SUCCES, tirageMax, miseMin, cote, mesures, score, gradeDe, collectionsCompletes, jourDe, estOr, tauxDe, chromeDe, chanceOr, NOTES, SOUS_NOTES, blackLabel, gratuitsDispo, horsBroyeur, broyeurDe, poussiereDe, doublons, alertesDe } from './regles.js';
import { configurer, ecouter, lire } from './temps-reel.js';
import { carteHTML, activerInclinaison } from './carte.js';

/* ---------- état local (miroir de la base) ---------- */
const E = { cat: { chauves: {}, collections: {}, boosters: {} }, emis: {}, ench: {}, fil: {}, joueurs: {}, moi: null, copies: {}, notifs: {}, echDe: {}, echA: {}, charge: new Set() };
const DEMARRAGE = Date.now();

/* ---------- outils ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Math.floor(n || 0).toLocaleString('fr-FR');
const pct = n => (+n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 4 });
const esc = t => String(t ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const mR = n => `${fmt(n)} ${n > 1 ? JEU.monnaie.nom.toLowerCase() : JEU.monnaie.un}`;
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const trier = o => Object.entries(o || {}).sort((a, b) => (a[1].ordre || 0) - (b[1].ordre || 0));
const chauves = (tous = false) => trier(E.cat.chauves).filter(([, c]) => tous || !c.retire).map(([id, c]) => ({ ...c, id }));
const boosters = (tous = false) => trier(E.cat.boosters).filter(([, b]) => tous || b.actif).map(([id, b]) => ({ ...b, id, chauves: b.chauves || [] }));
const collections = () => trier(E.cat.collections).map(([id, co]) => ({ ...co, id }));
const chauve = id => E.cat.chauves[id] ? { ...E.cat.chauves[id], id } : { id, nom: id, rarete: 'commun', img: '/img/logo.webp' };
const listeCopies = o => Object.entries(o || {}).map(([uid, x]) => ({ ...x, uid }));
const mesCopies = () => listeCopies(E.copies);
const moiJ = () => E.moi ? E.joueurs[E.moi.uid] || {} : {};
const reflets = () => moiJ().reflets || 0;
const souhaitsDe = j => Array.isArray(j?.souhaits) ? j.souhaits : [];
const tMax = c => c.illimite ? '∞' : fmt(tirageMax(c));
const joueurParLogin = login => Object.entries(E.joueurs).find(([, j]) => j.login === login);
function duree(ms){
  if (ms <= 0) return 'terminé';
  const s = Math.floor(ms / 1000), j = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mn = Math.floor(s % 3600 / 60), sec = s % 60;
  if (j) return `${j} j ${h} h`;
  return (h ? `${h}:${String(mn).padStart(2, '0')}` : `${mn}`) + `:${String(sec).padStart(2, '0')}`;
}
function ilya(t){ const s = (Date.now() - t) / 1000; return s < 60 ? 'à l\'instant' : s < 3600 ? `il y a ${Math.floor(s / 60)} min` : s < 86400 ? `il y a ${Math.floor(s / 3600)} h` : `il y a ${Math.floor(s / 86400)} j`; }

const ICO = {
  accueil: '<path d="M4 20V10l8-6 8 6v10h-5v-6H9v6z"/>',
  salon: '<rect x="3" y="9" width="14" height="7" rx="2"/><path d="M17 11h3M17 14h3M6 9V6M10 9V6M14 9V6"/>',
  pca: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  dex: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5z"/>',
  coll: '<rect x="3" y="5" width="7" height="12" rx="1.5"/><rect x="14" y="5" width="7" height="12" rx="1.5"/><path d="M8.5 20h7"/>',
  marche: '<path d="M5 20l8-8M11 6l7 7M9 8l5-5 7 7-5 5zM3 21h8"/>',
  troc: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  vitrine: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 11h18M8 21h8"/>',
  succes: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3M8 21h8M9 17h6"/>',
  classement: '<path d="M4 20V11h4v9M10 20V5h4v15M16 20v-6h4v6"/>',
  atelier: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>',
  cloche: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>',
  broyeur: '<path d="M5 4h14l-2 6H7z"/><path d="M9 10v3M15 10v3M8 13h8l-1.5 3h-5z"/><path d="M8 19.5h.01M12 21h.01M16 19.5h.01M10 18.5h.01M14 18.5h.01"/>', coeur: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  plus: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', check: '<path d="M5 12l5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', chevg: '<path d="M15 5l-7 7 7 7"/>', chevd: '<path d="M9 5l7 7-7 7"/>',
  twitch: '<path d="M5 3 3 7v12h5v3h3l3-3h4l4-4V3zm15 11-3 3h-4l-3 3v-3H6V5h14z" fill="currentColor" stroke="none"/><path d="M11 8v5M16 8v5"/>',
};
const ic = (n, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>`;
const icoReflet = `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="gRef" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb070"/><stop offset=".55" stop-color="#ff4f8b"/><stop offset="1" stop-color="#b64dff"/></linearGradient></defs><g fill="none" stroke="url(#gRef)" stroke-width="2.6" stroke-linecap="round"><path d="M6 21C5 15 9 12 7 5"/><path d="M12 21c-1-6 3-9 1-17"/><path d="M18 21c-1-5 2-8 0-14"/></g></svg>`;
const R = n => `<span class="reflet">${icoReflet}${fmt(n)}</span>`;
/* poussière de crâne (Broyeur) */
const icoPous = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#c9a2ff" d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><circle cx="18.5" cy="18" r="1.8" fill="#8fe3ff"/><circle cx="6" cy="19" r="1.3" fill="#ff9ccf"/></svg>`;
const PO = n => `<span class="pous">${icoPous}${fmt(n)}</span>`;
function tete(cheveux, taille = 64){
  const meches = [];
  for (let i = 0; i < cheveux; i++){
    const a = cheveux === 1 ? Math.PI * 1.5 : Math.PI * (1.1 + i * .8 / (cheveux - 1)), x = 32 + Math.cos(a) * 19, y = 30 + Math.sin(a) * 19;
    meches.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)}q${(Math.cos(a) * 7).toFixed(1)} ${(Math.sin(a) * 9 - 4).toFixed(1)} ${(Math.cos(a) * 3).toFixed(1)} ${(Math.sin(a) * 13).toFixed(1)}" stroke="#6b3a1f" stroke-width="3.2" stroke-linecap="round" fill="none"/>`);
  }
  const brille = cheveux <= 1 ? `<path d="M22 20q5-6 12-6" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity="${cheveux ? .6 : .95}"/>` : '';
  return `<svg viewBox="0 0 64 64" width="${taille}" height="${taille}" aria-hidden="true"><circle cx="32" cy="34" r="21" fill="#f0b98f"/><ellipse cx="11" cy="37" rx="3.5" ry="5" fill="#e0a577"/><ellipse cx="53" cy="37" rx="3.5" ry="5" fill="#e0a577"/>${meches.join('')}${brille}<circle cx="25" cy="38" r="2.2" fill="#2b1d12"/><circle cx="39" cy="38" r="2.2" fill="#2b1d12"/><path d="M27 46q5 3 10 0" stroke="#2b1d12" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800); }
function openModal(h){ $('#modalIn').innerHTML = `<button class="fermer" data-close aria-label="Fermer">${ic('x')}</button>` + h; $('#modal').classList.add('ouvert'); }
function closeModal(){ $('#modal').classList.remove('ouvert'); $('#modalIn').classList.remove('large-ench'); $('#modalIn').style.maxWidth = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ closeModal(); $('#panneau').hidden = true; } });

/* ---------- appel au serveur ---------- */
async function api(action, corps = {}){
  if (!E.moi && !['cloturer', 'regler'].includes(action)){ toast('Connecte-toi avec Twitch pour jouer'); throw new Error('non connecté'); }
  const r = await fetch(`/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  const d = await r.json().catch(() => ({ erreur: 'Réponse illisible du serveur' }));
  if (!r.ok || d.erreur){ if (action !== 'cloturer') toast(d.erreur || 'Erreur'); throw new Error(d.erreur); }
  if (!['cloturer', 'regler', 'me'].includes(action)) rafraichirPerso();
  return d;
}
/* un bouton occupé pendant l'appel */
async function occupe(bouton, fn){ if (bouton){ bouton.disabled = true; } try { return await fn(); } catch { } finally { if (bouton && bouton.isConnected) bouton.disabled = false; } }

/* =========================================================
   RENDU
   ========================================================= */
const VUES = {
  accueil: { nom: 'Accueil', ic: 'accueil' }, salon: { nom: 'Salon', ic: 'salon' }, chauvedex: { nom: 'ChauveDex', ic: 'dex' }, broyeur: { nom: 'Broyeur', ic: 'broyeur' }, pca: { nom: 'PCA', ic: 'pca' },
  marche: { nom: 'Marché', ic: 'marche' }, echanges: { nom: 'Échanges', ic: 'troc' }, vitrine: { nom: 'Ma vitrine', ic: 'vitrine' }, succes: { nom: 'Succès', ic: 'succes' },
  classement: { nom: JEU.classement, ic: 'classement' }, atelier: { nom: 'Atelier', ic: 'atelier', admin: true },
};
const PRINCIPAUX = ['accueil', 'salon', 'chauvedex', 'marche'];
let ongletA = 'cartes'; const filtreA = { q: '', rar: '', coll: '', bo: '', tri: 'recent' };
let ongletM = 'cours', troc = null, pageC = 0, sensC = 0;
const dexF = { q: '', coll: '', rar: '', voir: 'tous', gr: 'coll' };
let dexVue = 'album';   /* le ChauveDex : « album » (le classeur à tourner) ou « liste » (recherche et filtres) */
function vueCourante(){
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('v-')) return { v: 'vitrine', login: h.slice(2) };
  if (h === 'collections'){ dexVue = 'album'; history.replaceState(null, '', '#chauvedex'); return { v: 'chauvedex' }; }   /* ancien onglet Classeur */
  return { v: VUES[h] && (!VUES[h].admin || E.moi?.admin) ? h : 'accueil' };
}
const saisie = () => { const a = document.activeElement; return a && a.closest('#view, #modalIn') && a.matches('input, select, textarea'); };
/* un formulaire de la page en cours de remplissage : on ne redessine pas la page par-dessus, sinon la saisie (et le clic sur son bouton) serait perdue */
const brouillon = () => !!document.querySelector('#view form[data-brouillon]');
document.addEventListener('input', e => { const f = e.target.closest?.('#view form'); if (f) f.dataset.brouillon = '1'; });
let rendu = 0;
function planifier(){ if (rendu) return; rendu = requestAnimationFrame(() => { rendu = 0; if (saisie() || brouillon() || TONTE.actif){ majLots(); majTop(); return; } render(false); majEnchere(); }); }
document.addEventListener('click', e => { const m = $('#menuPlus'); if (m && !m.hidden && !e.target.closest('#menuPlus')){ m.hidden = true; $('#navPlus')?.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('focusout', () => setTimeout(() => { if (!saisie()) planifier(); }, 0));

/* les mises à jour en direct (render(false)) ne redessinent que si l'affichage a vraiment changé :
   à plusieurs dizaines de joueurs, les boosters des autres ne font plus clignoter ta page */
let dernierNav = '', derniereVue = { cle: '', html: '' };
function render(force = true){
  const { v, login } = vueCourante();
  const nbSuc = succesPrets(), actif = k => k === v && !(k === 'vitrine' && login);
  const liens = Object.entries(VUES).filter(([, x]) => !x.admin || E.moi?.admin);
  const badge = k => k === 'succes' && nbSuc ? `<em class="pastille-n">${nbSuc}</em>` : '';
  /* sur téléphone, seuls les onglets principaux restent dans la barre ; les autres passent dans « Plus » */
  const nav = liens.map(([k, x]) => `<a href="#${k}" class="${k === 'atelier' ? 'atelier' : ''} ${PRINCIPAUX.includes(k) ? '' : 'sec'}" ${actif(k) ? 'aria-current="page"' : ''}>${ic(x.ic)}<span>${x.nom}</span>${badge(k)}</a>`).join('')
    + `<button class="plus ${liens.some(([k]) => !PRINCIPAUX.includes(k) && actif(k)) ? 'actif' : ''}" id="navPlus" aria-expanded="false" aria-controls="menuPlus">${ic('plus')}<span>Plus</span>${nbSuc ? `<em class="pastille-n">${nbSuc}</em>` : ''}</button>`;
  if (nav !== dernierNav){
    dernierNav = nav; $('#nav').innerHTML = nav;
    $('#menuPlus').innerHTML = liens.filter(([k]) => !PRINCIPAUX.includes(k)).map(([k, x]) => `<a href="#${k}" ${actif(k) ? 'aria-current="page"' : ''}>${ic(x.ic)}<span>${x.nom}</span>${badge(k)}</a>`).join('');
  }
  if (force) $('#menuPlus').hidden = true;
  $('#navPlus').onclick = e => { e.stopPropagation(); const m = $('#menuPlus'); m.hidden = !m.hidden; $('#navPlus').setAttribute('aria-expanded', !m.hidden); };
  const vues = { accueil: vueAccueil, salon: vueSalon, chauvedex: vueChauvedex, broyeur: vueBroyeur, pca: vuePCA, marche: vueMarche, echanges: vueEchanges, vitrine: () => vueVitrine(login), succes: vueSucces, classement: vueClassement, atelier: vueAtelier };
  /* mode maintenance : tout le monde voit l'écran d'attente, sauf l'admin qui voit le site avec un bandeau */
  const ferme = E.maintenance?.actif && !E.moi?.admin;
  document.body.classList.toggle('maintenance', !!ferme);
  const bandeau = E.maintenance?.actif && E.moi?.admin ? `<div class="bandeau-maint">${ic('atelier')}<span><b>Mode maintenance actif</b> : toi seul vois le site, les joueurs voient l'écran d'attente.</span><button class="btn petit" id="finMaint">Rouvrir le Salon</button></div>` : '';
  const html = ferme ? ecranMaintenance() : bandeau + vues[v](), cle = ferme ? 'maintenance' : `${v}|${login || ''}`;
  if (!force && cle === derniereVue.cle && html === derniereVue.html){ majTop(); return; }
  derniereVue = { cle, html };
  $('#view').innerHTML = html;
  brancher(); majTop();
  const fm = $('#finMaint'); if (fm) fm.onclick = () => occupe(fm, async () => { const r = await api('admin-maintenance', { actif: false }); toast(`Le Salon est rouvert${r.prolongees ? ` : ${r.prolongees} enchère${r.prolongees > 1 ? 's' : ''} prolongée${r.prolongees > 1 ? 's' : ''}` : ''}`); });
  $$('#view .onglets [aria-pressed="true"]').forEach(b => { b.parentElement.scrollLeft = b.offsetLeft - b.parentElement.offsetLeft - 16; });
}
let dernierTop = '';
function majTop(){
  const j = moiJ(), nonLus = Object.values(E.notifs).filter(n => !n.lu).length;
  const html = `<a class="logo-m" href="#accueil"><img src="/img/logo.webp" alt=""><span>Chauverie</span></a>
    <div class="row" style="gap:10px;flex-wrap:nowrap">${E.moi
      ? `<span class="solde" title="${JEU.monnaie.nom}">${icoReflet}${fmt(j.reflets)}</span><a class="solde pous-solde" href="#broyeur" title="Poussière de crâne">${icoPous}${fmt(j.poussiere || 0)}</a>
         <button class="cloche" id="cloche" aria-label="Alertes${nonLus ? ` : ${nonLus} non lues` : ''}">${ic('cloche')}${nonLus ? `<span class="n">${nonLus}</span>` : ''}</button>
         <a class="qui" href="#vitrine" title="Ma vitrine">${j.avatar ? `<img src="${esc(j.avatar)}" alt="">` : `<i>${tete(gradeDe(j.score || 0).cheveux, 20)}</i>`}<span class="pseudo">${esc(E.moi.nom)}</span></a>`
      : `<a class="connexion" href="/api/login">${ic('twitch')}Se connecter avec Twitch</a>`}</div>`;
  if (html === dernierTop) return;
  dernierTop = html; $('#top').innerHTML = html;
  const c = $('#cloche'); if (c) c.onclick = basculerPanneau;
}

/* ---------- carte de chauve ---------- */
/* la carte d'un exemplaire (x : copie ou enchère, avec id, no, chrome) */
const carteCopie = x => { const c = chauve(x.id), base = carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: E.cat.collections[c.coll]?.nom, droite: '', chrome: x.chrome, etat: x.note?.n }); return x.note ? slab(x, base) : base; };
function carte(c, o = {}){
  const copies = mesCopies().filter(x => x.id === c.id), connu = copies.length > 0 || o.forcer;
  const visuel = o.copie ? carteCopie(o.copie) : carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: E.cat.collections[c.coll]?.nom, droite: '', chrome: copies.some(x => x.chrome), inconnu: !connu });
  return `<button class="carte" ${o.copie ? `data-copie="${o.copie.uid}"` : `data-fiche="${c.id}"`} ${o.tabindex !== undefined ? `tabindex="${o.tabindex}"` : ''}>${visuel}</button>`;
}
/* le plus bel exemplaire d'un chauve : la meilleure note PCA d'abord (Chromé en cas d'égalité), sinon un Chromé */
function meilleurExemplaire(id){
  const l = mesCopies().filter(x => x.id === id), score = x => (x.note ? 100 + x.note.n * 2 : 0) + (x.chrome ? 1 : 0);
  return l.sort((a, b) => score(b) - score(a))[0];
}
const miniCopie = x => `<span class="mini" title="${esc(chauve(x.id).nom)}">${carteCopie(x)}</span>`;

/* ---------- sélecteur de chauves : recherche, filtre de rareté, doublons regroupés ---------- */
const selF = {};
const sansAccent = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/* item(g) dessine un groupe : g.x est le premier exemplaire, g.n leur nombre */
function selecteur(nom, copies, item, o = {}){
  const f = selF[nom] ||= { q: '', r: '' };
  const m = new Map();
  for (const x of copies){ const k = o.grouper ? `${x.id}|${x.chrome ? 1 : 0}|${x.note?.n || ''}` : x.uid; if (!m.has(k)) m.set(k, { x, n: 0 }); m.get(k).n++; }
  const rang = c => ORDRE_R.indexOf(c.rarete);
  const groupes = [...m.values()].sort((a, b) => { const ca = chauve(a.x.id), cb = chauve(b.x.id); return rang(cb) - rang(ca) || ca.nom.localeCompare(cb.nom) || (b.x.chrome ? 1 : 0) - (a.x.chrome ? 1 : 0); });
  const rars = ORDRE_R.filter(r => groupes.some(g => chauve(g.x.id).rarete === r));
  const vis = c => (!f.r || c.rarete === f.r) && (!f.q || sansAccent(c.nom).includes(sansAccent(f.q)));
  const nbVis = groupes.filter(g => vis(chauve(g.x.id))).length;
  return `<div class="selecteur" data-sel="${nom}">
    ${groupes.length > 6 ? `<div class="sel-barre"><input type="search" data-selq placeholder="Chercher un chauve…" value="${esc(f.q)}" aria-label="Chercher un chauve">
      <div class="rars">${rars.map(r => `<button type="button" class="rar-f ${f.r === r ? 'on' : ''}" data-selr="${r}" style="--rc:${RARETES[r].couleur}"><i></i>${RARETES[r].nom}</button>`).join('')}</div></div>` : ''}
    <div class="${o.classe || 'cartes petites'}">${groupes.map(g => { const c = chauve(g.x.id);
      return `<div class="sel-i" data-n="${esc(sansAccent(c.nom))}" data-r="${c.rarete}" ${vis(c) ? '' : 'hidden'}>${item(g)}${o.grouper && g.n > 1 ? `<span class="sel-n">×${g.n}</span>` : ''}</div>`; }).join('')}</div>
    <div class="vide sel-vide" ${nbVis ? 'hidden' : ''}>Aucun chauve ne correspond.</div></div>`;
}
function filtrerSel(boite){
  const f = selF[boite.dataset.sel], q = sansAccent(f.q.trim()); let n = 0;
  boite.querySelectorAll('.sel-i').forEach(i => { const ok = (!f.r || i.dataset.r === f.r) && (!q || i.dataset.n.includes(q)); i.hidden = !ok; n += ok; });
  boite.querySelector('.sel-vide').hidden = !!n;
}
document.addEventListener('input', e => { const q = e.target.closest?.('[data-selq]'); if (!q) return; const b = q.closest('[data-sel]'); selF[b.dataset.sel].q = q.value; filtrerSel(b); });
document.addEventListener('click', e => { const r = e.target.closest?.('[data-selr]'); if (!r) return; const b = r.closest('[data-sel]'), f = selF[b.dataset.sel];
  f.r = f.r === r.dataset.selr ? '' : r.dataset.selr; b.querySelectorAll('[data-selr]').forEach(x => x.classList.toggle('on', x.dataset.selr === f.r)); filtrerSel(b); });

/* ---------- présence sur le stream ---------- */
function panneauPresence(j){
  const P = JEU.presence, n = gratuitsDispo(j), reste = P.boosterToutes - (j.presenceMin || 0) % P.boosterToutes, plein = n >= P.stockMax;
  const gratuit = boosters().find(b => b.gratuit);
  return `<section class="pan presence"><div class="row" style="justify-content:space-between;gap:14px"><div><h3>Regarde le stream, gagne des cheveux</h3>
    <div class="mut">Connecté au chat pendant le live : ${R(P.parHeure)} par heure et un booster gratuit toutes les ${P.boosterToutes} minutes.</div>
    <div class="mut" style="margin-top:6px;font-size:14px">${fmt((j.presenceMin || 0) / 60)} h de stream · ${plein ? `stock plein (${P.stockMax} boosters max)` : `prochain booster dans ${reste} min de stream`}</div></div>
    ${gratuit ? `<a class="btn ${n ? 'neon' : ''}" href="#salon">${n ? `${n} booster${n > 1 ? 's' : ''} gratuit${n > 1 ? 's' : ''}` : 'Aucun booster gratuit'}</a>` : ''}</div></section>`;
}

/* ---------- ACCUEIL ---------- */
function vueAccueil(){
  const j = moiJ(), sc = j.score || 0, gr = gradeDe(sc), suivant = GRADES[GRADES.indexOf(gr) + 1];
  const bientot = Object.entries(E.ench).filter(([, e]) => !e.fini).sort((a, b) => a[1].fin - b[1].fin).slice(0, 3);
  const trio = chauves().slice(0, 3), fil = Object.values(E.fil).sort((a, b) => b.t - a.t).slice(0, 8);
  return `
  <section class="hero">
    <div>
      <h1>${E.moi ? `Bienvenue au Salon, ${esc(E.moi.nom)}` : 'Bienvenue au Salon'}</h1>
      <p>Déchire des boosters et découvre tes chauves. Complète les collections, enchéris en direct au Marché, échange avec le chat et grimpe chez ${JEU.classement}.</p>
      <div class="row">${E.moi ? `<a class="btn neon" href="#salon">${ic('salon')}Ouvrir un pack</a><a class="btn" href="#marche">${ic('marche')}Voir le Marché</a>` : `<a class="connexion" href="/api/login">${ic('twitch')}Se connecter avec Twitch</a><a class="btn" href="#marche">Regarder le Marché</a>`}</div>
    </div>
    <div class="trio">${trio.map(c => `<img src="${esc(c.img)}" alt="">`).join('')}</div>
  </section>
  <div class="grille2" style="margin-top:20px">
    <div class="pile">
      ${E.moi ? panneauPresence(j) : ''}
      <section class="pan">
        <div class="row" style="justify-content:space-between;margin-bottom:12px"><h3>Enchères qui se terminent <span class="en-direct" style="margin-left:6px">en direct</span></h3><a class="mut" href="#marche">Tout voir</a></div>
        ${bientot.length ? `<div class="lots">${bientot.map(([k, e]) => lotHTML(k, e)).join('')}</div>` : '<div class="vide">Aucune enchère en cours.</div>'}
      </section>
    </div>
    <div class="pile">
      ${E.moi ? `<section class="pan"><div class="etiq" style="margin-bottom:10px">Ta calvitie</div>
        <div class="grade">${tete(gr.cheveux, 78)}<div><b>${gr.nom}</b><span class="mono mut">${fmt(sc)} pts</span></div></div>
        ${suivant ? `<div class="jauge" style="margin:14px 0 6px"><i style="width:${Math.min(100, (sc - gr.min) / (suivant.min - gr.min) * 100)}%"></i></div><div class="mut" style="font-size:14px">Encore ${fmt(suivant.min - sc)} pts pour « ${suivant.nom} »</div>` : '<div class="mut" style="margin-top:10px">Grade maximum. Ton crâne aveugle le chat.</div>'}</section>` : ''}
      <section class="pan"><h3 style="margin-bottom:12px">En direct du Salon</h3>
        ${fil.length ? `<ul class="fil">${fil.map(f => `<li style="--rc:${RARETES[f.rar]?.couleur || 'var(--mut2)'}"><span class="pt"></span><span><b>${esc(f.qui)}</b> ${esc(f.texte)}</span><span class="t">${ilya(f.t)}</span></li>`).join('')}</ul>` : '<div class="vide">Rien pour l\'instant.</div>'}
      </section>
    </div>
  </div>`;
}

/* ---------- SALON ---------- */
function vueSalon(){
  const liste = boosters();
  return `<h1>Le Salon</h1><p class="sub">Choisis un booster, déchire-le et retourne tes cartes.</p>
  ${liste.length ? `<div class="rayon">${liste.map(b => { const dispo = b.chauves.filter(id => E.cat.chauves[id] && !E.cat.chauves[id].retire && (E.emis[id] || 0) < tirageMax(E.cat.chauves[id])).length;
    return `<article class="booster">
      <button class="bo-img" data-contenu="${b.id}" aria-label="Voir les cartes du booster ${esc(b.nom)}"><img src="${esc(b.img)}" alt=""></button>
      <h2>${esc(b.nom)}</h2>
      <div class="mut">${b.gratuit ? `1 offert toutes les ${JEU.presence.boosterToutes} min de stream · ` : ''}${b.nb} carte${b.nb > 1 ? 's' : ''} par booster · ${b.chauves.length} à collectionner${b.garantie ? ` · 1 ${RARETES[b.garantie].nom.toLowerCase()} ou mieux garanti` : ''}</div>
      <div class="row" style="justify-content:center;margin-top:6px">${b.gratuit ? `<span class="prix gratuit">Gratuit · ${gratuitsDispo(moiJ())} dispo</span>` : `<span class="prix">${R(b.prix)}</span>`}
        <button class="btn neon" data-pack="${b.id}" ${!dispo || (E.moi && (b.gratuit ? !gratuitsDispo(moiJ()) : reflets() < b.prix)) ? 'disabled' : ''}>${dispo ? 'Ouvrir' : 'Épuisé'}</button>
        <button class="btn" data-contenu="${b.id}">Voir les cartes</button></div>
    </article>`; }).join('')}</div>` : '<div class="vide">Aucun booster en vente pour l\'instant.</div>'}
  <p class="mut" style="margin-top:26px;font-size:14px">Chaque carte a ${pct(chromeDe(E.cat.reglages) * 100)} % de chances d'être <b>Chromée</b>. Quand un chauve a atteint son tirage maximum, il ne sort plus des boosters : il ne reste que le Marché.</p>`;
}
/* ce qu'un booster peut contenir, avec les chances par rareté */
function contenuBooster(id){
  const b = boosters(true).find(x => x.id === id); if (!b) return;
  const cartes = b.chauves.map(chauve).filter(c => E.cat.chauves[c.id] && !c.retire).sort((x, y) => ORDRE_R.indexOf(y.rarete) - ORDRE_R.indexOf(x.rarete));
  const tb = tauxDe(b.taux ? { taux: b.taux } : E.cat.reglages), presentes = ORDRE_R.filter(k => cartes.some(c => c.rarete === k) && tb[k] > 0);
  openModal(`<h2>${esc(b.nom)}</h2><p class="mut">${b.nb} carte${b.nb > 1 ? 's' : ''} par booster, tirées parmi ces ${cartes.length} chauves.</p>
    ${orsDispo(b).length ? `<div class="or-chance"><b>Crâne d'or</b> ${pct(Math.max(...orsDispo(b).map(c => chanceOr(c) * 100)))} % de chances par carte tirée. Celui qui le trouve aura sa propre carte la saison prochaine. Un seul par joueur et par saison.</div>` : ''}
    <div class="taux" style="margin-bottom:18px">${presentes.map(k => `<div><span class="puce" style="color:${RARETES[k].couleur}">${RARETES[k].nom}</span><b>${pct(tb[k] * 100)} %</b><span class="mut" style="font-size:13px">${cartes.filter(c => c.rarete === k).length} dans ce booster</span></div>`).join('')}</div>
    <div class="cartes petites">${cartes.map(c => carte(c)).join('') || '<div class="vide">Ce booster est encore vide.</div>'}</div>`);
  $('#modalIn').style.maxWidth = '980px';
  $$('#modalIn [data-fiche]').forEach(x => x.onclick = () => fiche(x.dataset.fiche));
}

/* ---------- CHAUVEDEX ---------- */
/* numéro de Chauvedex : collections dans leur ordre, puis rareté, puis date d'ajout */
/* Crâne d'or : qui l'a gagné, et lesquels sont encore à trouver dans un booster */
/* les Crânes d'or d'un joueur, une entrée par saison (l'ancien format n'en avait qu'une) */
const orsDe = j => { const v = j?.craneOr; if (!v) return []; return typeof v.id === 'string' ? [v] : Object.values(v).filter(x => x?.id); };
const gagnantsOr = id => Object.entries(E.joueurs || {}).flatMap(([uid, j]) => orsDe(j).filter(x => x.id === id).map(x => ({ uid, ...j, craneOr: x }))).sort((a, b) => a.craneOr.t - b.craneOr.t);
const orsDispo = b => b.chauves.map(id => E.cat.chauves[id] && { ...E.cat.chauves[id], id }).filter(c => c && estOr(c) && !c.retire && (E.emis[c.id] || 0) < tirageMax(c));
const parRarete = (a, b) => ORDRE_R.indexOf(a.rarete) - ORDRE_R.indexOf(b.rarete) || (a.ordre || 0) - (b.ordre || 0);
function numerosDex(){
  const n = {}; let k = 0;
  for (const co of collections()) for (const c of chauves().filter(x => x.coll === co.id).sort(parRarete)) n[c.id] = ++k;
  for (const c of chauves().filter(x => !n[x.id]).sort(parRarete)) n[c.id] = ++k;
  return n;
}
const nbDe = id => mesCopies().filter(x => x.id === id).length;

function vueChauvedex(){
  const bascule = `<div class="dex-titre"><h1>ChauveDex</h1><div class="segment grand" role="group" aria-label="Affichage">${[['album', 'Album'], ['liste', 'Liste']].map(([k, t]) => `<button data-dexvue="${k}" aria-pressed="${dexVue === k}">${t}</button>`).join('')}</div></div>`;
  if (dexVue === 'album') return bascule + vueCollections();
  const tous = chauves().filter(c => !estOr(c)), connus = tous.filter(c => nbDe(c.id)).length, ratio = tous.length ? connus / tous.length : 0, Cc = 2 * Math.PI * 38;
  const parR = ORDRE_R.map(r => [r, tous.filter(c => c.rarete === r)]).filter(([, l]) => l.length);
  return `${bascule}
  <div class="dexhead"><div class="anneau"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="#2d2240" stroke-width="9"/><circle cx="50" cy="50" r="38" fill="none" stroke="url(#gRef)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(Cc * ratio).toFixed(1)} ${Cc.toFixed(1)}"/></svg><b>${Math.round(ratio * 100)}%</b></div>
    <div class="pile" style="gap:10px"><div style="font-weight:800;font-size:19px">${connus} chauves découverts sur ${tous.length}</div>
      <div class="rars">${parR.map(([r, l]) => `<button class="rar-f ${dexF.rar === r ? 'on' : ''}" data-dexr="${r}" style="--rc:${RARETES[r].couleur}"><i></i>${RARETES[r].nom} <b class="mono">${l.filter(c => nbDe(c.id)).length}/${l.length}</b></button>`).join('')}</div></div></div>
  <div class="filtres">
    <input id="dxQ" type="search" placeholder="Chercher un chauve…" value="${esc(dexF.q)}" aria-label="Chercher">
    <select id="dxColl" aria-label="Collection"><option value="">Toutes les collections</option>${collections().map(co => `<option value="${co.id}" ${dexF.coll === co.id ? 'selected' : ''}>${esc(co.nom)}</option>`).join('')}</select>
    <div class="segment" role="group" aria-label="Afficher">${[['tous', 'Tous'], ['eus', 'Possédés'], ['manque', 'Manquants']].map(([k, t]) => `<button data-dexv="${k}" aria-pressed="${dexF.voir === k}">${t}</button>`).join('')}</div>
    <select id="dxGr" aria-label="Regrouper"><option value="coll" ${dexF.gr === 'coll' ? 'selected' : ''}>Par collection</option><option value="rar" ${dexF.gr === 'rar' ? 'selected' : ''}>Par rareté</option><option value="num" ${dexF.gr === 'num' ? 'selected' : ''}>Sans regrouper</option></select>
  </div>
  <div id="dxListe"></div>`;
}
/* la liste du Chauvedex : redessinée seule quand on filtre, pour garder le curseur dans la recherche */
function listeDex(){
  const el = $('#dxListe'); if (!el) return;
  const nums = numerosDex(), q = dexF.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const garde = c => { const n = nbDe(c.id);
    return (!dexF.coll || c.coll === dexF.coll) && (!dexF.rar || c.rarete === dexF.rar) && (dexF.voir === 'tous' || (dexF.voir === 'eus' ? n : !n))
      && (!q || (n && c.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))); };
  const vignette = c => { const n = nbDe(c.id);
    return `<div class="dx ${n ? '' : 'manque'}"><button class="carte" data-fiche="${c.id}">${carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: E.cat.collections[c.coll]?.nom, droite: '', chrome: mesCopies().some(x => x.id === c.id && x.chrome), inconnu: !n })}</button>
      <div class="dx-l"><b>${n ? esc(c.nom) : '???'}</b>${n > 1 ? `<span class="nb">×${n}</span>` : ''}</div></div>`; };
  const tous = chauves().filter(garde).sort((a, b) => nums[a.id] - nums[b.id]);
  const groupes = dexF.gr === 'num' ? [[null, tous]]
    : dexF.gr === 'rar' ? ORDRE_R.map(r => [{ nom: RARETES[r].nom, couleur: RARETES[r].couleur, total: chauves().filter(c => c.rarete === r) }, tous.filter(c => c.rarete === r)])
    : [[{ nom: 'Crânes d\'or', couleur: RARETES.or.couleur, total: chauves().filter(estOr) }, tous.filter(estOr)], ...collections().map(co => [{ nom: co.nom, total: chauves().filter(c => c.coll === co.id && !estOr(c)) }, tous.filter(c => c.coll === co.id && !estOr(c))]), [{ nom: 'Sans collection', total: [] }, tous.filter(c => !E.cat.collections[c.coll] && !estOr(c))]];
  const html = groupes.filter(([, l]) => l.length).map(([g, l]) => `<section class="dx-groupe">${g ? `<h2 style="${g.couleur ? `--rc:${g.couleur}` : ''}">${g.couleur ? '<i class="pastille"></i>' : ''}${esc(g.nom)}${g.total.length ? ` <span class="mono mut">${g.total.filter(c => nbDe(c.id)).length}/${g.total.length}</span>` : ''}</h2>` : ''}<div class="cartes dx-grille">${l.map(vignette).join('')}</div></section>`).join('');
  el.innerHTML = html || '<div class="vide">Aucun chauve ne correspond.</div>';
  $$('#dxListe [data-fiche]').forEach(b => b.onclick = () => fiche(b.dataset.fiche));
}
async function fiche(id){
  const c = chauve(id), copies = mesCopies().filter(x => x.id === id).sort((a, b) => a.no - b.no), connu = copies.length > 0;
  const co = E.cat.collections[c.coll];
  openModal(`<div class="fiche r-${c.rarete}">
    <div class="grand">${carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: co?.nom, droite: '', chrome: copies.some(x => x.chrome), inconnu: !connu })}</div>
    <div>
      <span class="puce" style="color:${RARETES[c.rarete].couleur}">${RARETES[c.rarete].nom}</span>
      <h2 style="margin:10px 0 4px;font-size:34px">${connu ? esc(c.nom) : 'Chauve inconnu'}</h2>
      <p class="mut" style="margin:0">${connu ? esc(c.desc || '') : 'Ouvre des packs ou fouille le Marché pour le découvrir.'}</p>
      <div class="faits">
        <div class="fait"><span>Collection</span><b>${esc(co?.nom || '—')}</b></div>
        <div class="fait"><span>Exemplaires émis</span><b class="mono">${fmt(E.emis[id])} / ${tMax(c)}</b></div>
        ${E.pop?.[id] ? `<div class="fait"><span>Population PCA</span><b class="mono">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].filter(n => E.pop[id][n]).map(n => `${n}×${E.pop[id][n]}`).join(' · ')}</b></div>` : ''}
        ${estOr(c) ? `<div class="fait"><span>Gagnant${E.cat.chauves[id] && tirageMax(c) > 1 ? 's' : ''}</span><b>${gagnantsOr(id).map(j => esc(j.nom)).join(', ') || 'Pas encore trouvé'}</b></div>` : `<div class="fait"><span>Cote</span><b>${R(RARETES[c.rarete].cote)}</b></div>`}
      </div>
      <div class="etiq" style="margin-bottom:8px">Tes exemplaires</div>
      ${copies.length ? `<div class="exemplaires">${copies.map((x, k) => `<div class="ex"><span class="mono">Exemplaire ${k + 1}</span>${x.chrome ? '<span class="puce badge-chrome">Chromé</span>' : ''}
        <div class="row">${x.vente ? `<span class="puce" style="color:var(--orange-c)">${x.vente === 'pca' ? 'Au labo PCA' : String(x.vente).startsWith('echange') ? 'Dans un échange' : 'Aux enchères'}</span>` : `${x.note ? `<span class="puce note-p ${x.note.n === 10 ? 'gem' : ''}">PCA ${x.note.n}</span>` : `<button class="btn petit" data-pca-envoi="${x.uid}">Expertiser</button>`}${x.lie ? '<span class="puce or-lie">Lié à ton compte</span>' : `<button class="btn petit" data-vendre="${x.uid}">Mettre aux enchères</button>`}`}</div></div>`).join('')}</div>` : '<div class="vide">Tu n\'en possèdes aucun.</div>'}
      ${E.moi && !estOr(c) ? `<div class="row" style="margin-top:14px">${(() => { const s = souhaitsDe(moiJ()).includes(id); return `<button class="btn petit ${s ? 'souhaite' : ''}" data-souhait="${id}" data-garder="${s ? 0 : 1}">${ic('coeur')}${s ? 'Dans tes souhaits' : 'Ajouter à mes souhaits'}</button>`; })()}
        ${(() => { const pr = broyeurDe(E.cat.reglages).prix[c.rarete]; return pr && (E.emis[id] || 0) < tirageMax(c) ? `<button class="btn petit" data-fab="${id}">${ic('broyeur')}Fabriquer · ${PO(pr)}</button>` : ''; })()}</div>` : ''}
      ${(() => { const l = Object.entries(E.joueurs).filter(([u, j]) => u !== E.moi?.uid && souhaitsDe(j).includes(id)); return l.length ? `<div class="etiq" style="margin:18px 0 8px">Recherché par</div><div class="row" style="gap:6px">${l.slice(0, 12).map(([, j]) => `<a class="puce joueur-lien" href="#v-${esc(j.login)}">${ic('coeur')}${esc(j.nom)}</a>`).join('')}</div>${copies.filter(x => !x.vente && !x.lie).length > 1 ? '<p class="mut" style="font-size:13px;margin:6px 0 0">Tu en as en double : propose-leur un échange depuis leur vitrine.</p>' : ''}` : ''; })()}
      <div class="etiq" style="margin:18px 0 8px">Qui le possède ?</div><div id="proprios" class="mut">Recherche…</div>
    </div></div>`);
  $$('#modalIn [data-souhait]').forEach(b => b.onclick = () => occupe(b, async () => { const garder = b.dataset.garder === '1', r = await api('souhait', { id, garder }); if (E.joueurs[E.moi.uid]) E.joueurs[E.moi.uid].souhaits = r.souhaits; toast(garder ? 'Ajouté à tes souhaits : il s\'affiche sur ta vitrine' : 'Retiré de tes souhaits'); fiche(id); }));
  $$('#modalIn [data-fab]').forEach(b => b.onclick = () => confirmerFabrication(id));
  $$('#modalIn [data-vendre]').forEach(b => b.onclick = () => formVente(b.dataset.vendre));
  $$('#modalIn [data-pca-envoi]').forEach(b => b.onclick = () => confirmerPCA(b.dataset.pcaEnvoi));
  /* propriétaires : lecture ponctuelle des exemplaires de ce chauve */
  const toutes = listeCopies(await lire('copies', { orderBy: 'id', equalTo: id })).filter(x => E.joueurs[x.proprio]);
  const par = {}; for (const x of toutes) (par[x.proprio] ||= []).push(x);
  const el = $('#proprios'); if (!el) return;
  /* d'abord ceux qui l'ont en double (et donc prêts à échanger), puis les autres */
  const libresDe = xs => xs.filter(x => !x.vente && !x.lie);
  const liste = Object.entries(par).filter(([u]) => u !== E.moi?.uid).sort((a, b) => (libresDe(b[1]).length > 1) - (libresDe(a[1]).length > 1) || b[1].length - a[1].length).slice(0, 15);
  el.innerHTML = liste.length ? `<div class="catalogue">${liste.map(([u, xs]) => { const dbl = libresDe(xs).length > 1, lib = libresDe(xs);
    return `<div class="cat proprio" style="grid-template-columns:minmax(0,1fr) auto"><div><a class="joueur-lien" href="#v-${esc(E.joueurs[u].login)}">${esc(E.joueurs[u].nom)}</a>${dbl ? ' <span class="puce dbl">en double</span>' : ''}
      <div class="mono mut" style="font-size:12.5px">${xs.length} exemplaire${xs.length > 1 ? 's' : ''}${xs.some(x => x.chrome) ? ' · dont Chromé' : ''}</div></div>
      ${E.moi && lib.length ? `<button class="btn petit ${dbl ? 'neon' : ''}" data-troc-vers="${u}" data-troc-carte="${lib.sort((a, b) => (a.chrome ? 1 : 0) - (b.chrome ? 1 : 0))[0].uid}">${ic('troc')}Échanger</button>` : ''}</div>`; }).join('')}</div>` : (par[E.moi?.uid] ? 'Tu es le seul à le posséder.' : 'Personne pour l\'instant.');
  $$('#proprios a').forEach(a => a.onclick = closeModal);
  $$('#proprios [data-troc-vers]').forEach(b => b.onclick = () => { closeModal(); ouvrirTroc(b.dataset.trocVers, { demande: b.dataset.trocCarte }); });
}
function formVente(cu){
  const x = E.copies[cu], c = chauve(x.id), v = cote(x, c);
  openModal(`<h2>Mettre aux enchères</h2>
    <div class="row" style="gap:16px;align-items:flex-start;margin-bottom:18px"><img src="${esc(c.img)}" alt="" style="width:80px;aspect-ratio:600/1066;object-fit:cover;border-radius:10px">
      <div><b style="font-size:18px">${esc(c.nom)}</b><div class="mono mut">${RARETES[c.rarete].nom}${x.chrome ? ' · Chromé' : ''}</div><div class="mut" style="margin-top:6px">Cote estimée : ${R(v)}</div></div></div>
    <form id="fVente" class="form">
      <label class="champ" for="vDepart">Prix de départ<input id="vDepart" type="number" min="1" step="1" value="${Math.round(v * .6)}"></label>
      <label class="champ" for="vDuree">Durée<select id="vDuree">${JEU.durees.map((d, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${d.nom}</option>`).join('')}</select></label>
      <p class="mut plein" style="margin:0;font-size:14px">Le Marché prélève ${JEU.taxe * 100} % du prix final. Sans offre, ton chauve te revient.</p>
      <div class="row plein"><button class="btn neon" type="submit">Lancer l'enchère</button><button class="btn" type="button" data-close>Annuler</button></div>
    </form>`);
  $('#fVente').onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => { await api('vendre', { copie: cu, depart: +$('#vDepart').value, duree: +$('#vDuree').value }); closeModal(); toast(`${c.nom} est aux enchères`); ongletM = 'ventes'; location.hash = '#marche'; planifier(); }); };
}

/* ---------- COLLECTIONS ---------- */
/* ---------- CLASSEUR : une collection par page, qu'on tourne ---------- */
/* Atelier : qui a gagné un Crâne d'or (et attend donc sa carte) */
function panneauGagnants(){
  const ors = chauves(true).filter(estOr); if (!ors.length) return '';
  const g = ors.flatMap(c => gagnantsOr(c.id).map(j => ({ ...j, carte: c })));
  return `<section class="pan gagnants-or"><h2>Gagnants du Crâne d'or</h2>${g.length ? `<div class="catalogue">${g.map(j => `<div class="cat" style="grid-template-columns:40px minmax(0,1fr)"><img src="${esc(j.carte.img)}" alt=""><div><b>${esc(j.nom)}</b> <span class="mut">(${esc(j.login)})</span><div class="mut" style="font-size:13px">${esc(j.carte.nom)} · le ${new Date(j.craneOr.t).toLocaleDateString('fr-FR')} · sa carte est à créer pour la saison suivante</div></div></div>`).join('')}</div>` : '<p class="mut" style="margin:0">Personne n\'a encore trouvé de Crâne d\'or.</p>'}</section>`;
}
/* les pages du classeur : une par collection, puis le Panthéon des Crânes d'or s'il y en a */
function pagesClasseur(){
  const cols = collections();
  return chauves().some(estOr) ? [...cols, { id: '__or', or: true, nom: 'Panthéon du Crâne d\'or', desc: 'Un Crâne d\'or par saison. Celui qui le trouve aura sa propre carte la saison suivante.' }] : cols;
}
function nav(cols, completes){
  return `<nav class="pagin" aria-label="Pages du classeur">${cols.map((x, k) => `<button data-page="${k}" class="${x.or ? 'pg-or' : completes.includes(x.id) ? 'ok' : ''}" aria-current="${k === pageC ? 'page' : 'false'}" title="${esc(x.nom)}"><span class="sr">${esc(x.nom)}</span></button>`).join('')}</nav>`;
}
function pageOr(cols){
  const ors = chauves().filter(estOr).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)), trouves = ors.filter(c => gagnantsOr(c.id).length), miens = orsDe(moiJ());
  const sens = sensC; sensC = 0; const Cc = 2 * Math.PI * 44, ratio = ors.length ? trouves.length / ors.length : 0;
  const poche = c => { const g = gagnantsOr(c.id);
    if (!g.length) return `<div class="poche vide-p or-p" style="--rc:${RARETES.or.couleur}"><span class="creux"><span>?</span><i>À trouver</i></span></div>`;
    return `<div class="poche or-p"><button class="carte" data-fiche="${c.id}" aria-label="${esc(c.nom)}">${carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: '', droite: '' })}</button><span class="gagnant">${g.map(j => esc(j.nom)).join(', ')}</span></div>`; };
  return `  <div class="classeur pantheon">
    <button class="tourne g" data-tourne="-1" ${pageC ? '' : 'disabled'} aria-label="Page précédente">${ic('chevg', 2.2)}</button>
    <div class="couverture">
      <div class="feuilles ${sens > 0 ? 'entre-d' : sens < 0 ? 'entre-g' : ''}">
        <section class="feuille gauche">
          <div class="etiq">Page ${pageC + 1} sur ${cols.length}</div>
          <h2 class="titre-c">Panthéon du Crâne d'or</h2>
          <p class="desc-c">Un Crâne d'or par saison. Celui qui le trouve aura sa propre carte la saison suivante.</p>
          <div class="medaille"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#2a2036" stroke-width="7"/><circle cx="50" cy="50" r="44" fill="none" stroke="#ffcf3f" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(Cc * ratio).toFixed(1)} ${Cc.toFixed(1)}"/></svg>
            <div><b>${trouves.length}<small>/${ors.length}</small></b><span>trouvés</span></div></div>
          <div class="sceau ${miens.length ? 'pret' : ''}">
            ${miens.length ? `<div><div class="etiq">Ton${miens.length > 1 ? 's' : ''} Crâne${miens.length > 1 ? 's' : ''} d'or</div><div class="prime-m">${miens.map(x => esc(chauve(x.id).nom)).join('<br>')}</div></div><span class="puce" style="color:#ffcf3f">Ta carte arrive</span>` : `<div><div class="etiq">La règle</div><div style="margin-top:4px">Un seul Crâne d'or par joueur et par saison. Il ne se vend pas et ne s'échange pas.</div></div>`}
          </div>
        </section>
        <div class="anneaux" aria-hidden="true"><i></i><i></i><i></i></div>
        <section class="feuille droite"><div class="poches">${ors.map(poche).join('')}</div></section>
      </div>
    </div>
    <button class="tourne d" data-tourne="1" ${pageC < cols.length - 1 ? '' : 'disabled'} aria-label="Page suivante">${ic('chevd', 2.2)}</button>
  </div>
  ${nav(cols, [])}`;
}
function vueCollections(){
  const cols = pagesClasseur(); if (!cols.length) return '<div class="vide">Aucune collection pour l\'instant.</div>';
  pageC = Math.min(Math.max(0, pageC), cols.length - 1);
  const co = cols[pageC];
  if (co.or) return pageOr(cols);
  const completes = collectionsCompletes(mesCopies(), E.cat), recup = moiJ().collRecup || {};
  const membres = chauves().filter(c => c.coll === co.id && !estOr(c)).sort(parRarete), eus = membres.filter(c => nbDe(c.id)), complet = completes.includes(co.id);
  const sens = sensC, Cc = 2 * Math.PI * 44, ratio = membres.length ? eus.length / membres.length : 0; sensC = 0;
  const poche = c => { const n = nbDe(c.id);
    if (!n) return `<div class="poche vide-p" style="--rc:${RARETES[c.rarete].couleur}" title="${RARETES[c.rarete].nom} à trouver"><span class="creux"><span>?</span><i>${RARETES[c.rarete].nom}</i></span></div>`;
    /* la pochette montre ton plus bel exemplaire : sous coque PCA s'il a été expertisé */
    const m = meilleurExemplaire(c.id);
    return `<div class="poche ${m.note ? 'sous-coque' : ''}"><button class="carte" data-loupe="${c.id}" aria-label="Voir ${esc(c.nom)} en grand">${carteCopie(m)}</button>${n > 1 ? `<span class="nb-p">×${n}</span>` : ''}</div>`; };
  const parR = ORDRE_R.map(r => [r, membres.filter(c => c.rarete === r)]).filter(([, l]) => l.length);
  return `  <div class="classeur ${complet ? 'complete' : ''}">
    <button class="tourne g" data-tourne="-1" ${pageC ? '' : 'disabled'} aria-label="Page précédente">${ic('chevg', 2.2)}</button>
    <div class="couverture">
      <div class="feuilles ${sens > 0 ? 'entre-d' : sens < 0 ? 'entre-g' : ''}">
        <section class="feuille gauche">
          <div class="etiq">Page ${pageC + 1} sur ${cols.length}</div>
          <h2 class="titre-c">${esc(co.nom)}</h2>
          ${co.desc ? `<p class="desc-c">${esc(co.desc)}</p>` : ''}
          <div class="medaille"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#2a2036" stroke-width="7"/><circle cx="50" cy="50" r="44" fill="none" stroke="url(#gRef)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(Cc * ratio).toFixed(1)} ${Cc.toFixed(1)}"/></svg>
            <div><b>${eus.length}<small>/${membres.length}</small></b><span>${complet ? 'Complète' : 'trouvés'}</span></div></div>
          <ul class="detail-r">${parR.map(([r, l]) => `<li style="--rc:${RARETES[r].couleur}"><i class="pastille"></i>${RARETES[r].nom}<b class="mono">${l.filter(c => nbDe(c.id)).length}/${l.length}</b></li>`).join('')}</ul>
          <div class="sceau ${recup[co.id] ? 'pris' : complet ? 'pret' : ''}">
            <div><div class="etiq">Récompense</div><div class="prime-m">${R(co.gain || 0)}</div></div>
            ${recup[co.id] ? `<span class="puce" style="color:var(--ok)">${ic('check', 2.4)} Récupérée</span>` : complet ? `<button class="btn neon" data-coll="${co.id}">Récupérer</button>` : `<span class="mut">Encore ${membres.length - eus.length} à trouver</span>`}
          </div>
        </section>
        <div class="anneaux" aria-hidden="true"><i></i><i></i><i></i></div>
        <section class="feuille droite"><div class="poches">${membres.map(poche).join('') || '<div class="vide">Cette collection est encore vide.</div>'}</div></section>
      </div>
    </div>
    <button class="tourne d" data-tourne="1" ${pageC < cols.length - 1 ? '' : 'disabled'} aria-label="Page suivante">${ic('chevd', 2.2)}</button>
  </div>
  <nav class="pagin" aria-label="Pages du classeur">${cols.map((x, k) => `<button data-page="${k}" class="${completes.includes(x.id) ? 'ok' : ''}" aria-current="${k === pageC ? 'page' : 'false'}" title="${esc(x.nom)}"><span class="sr">${esc(x.nom)}</span></button>`).join('')}</nav>`;
}
function tournerPage(d){
  const n = pagesClasseur().length, p = pageC + d; if (p < 0 || p >= n) return;
  const page = $('.classeur .feuilles');
  if (page && !matchMedia('(prefers-reduced-motion: reduce)').matches){ page.classList.add(d > 0 ? 'sort-g' : 'sort-d'); setTimeout(() => { pageC = p; sensC = d; render(); }, 230); }
  else { pageC = p; render(); }
}
function brancherClasseur(){
  const cl = $('.classeur'); if (!cl) return;
  $$('[data-tourne]').forEach(b => b.onclick = () => tournerPage(+b.dataset.tourne));
  $$('[data-page]').forEach(b => b.onclick = () => { const k = +b.dataset.page; if (k !== pageC){ sensC = k > pageC ? 1 : -1; pageC = k; render(); } });
  $$('[data-loupe]').forEach(b => b.onclick = () => loupe(b.dataset.loupe));
  /* glisser du doigt pour tourner */
  let x0 = null; const page = $('.classeur .feuilles');
  page.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
  page.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) tournerPage(dx < 0 ? 1 : -1); });
}
/* flèches du clavier dans le classeur */
document.addEventListener('keydown', e => {
  if (vueCourante().v !== 'chauvedex' || dexVue !== 'album' || $('#modal').classList.contains('ouvert') || $('.loupe') || saisie()) return;
  if (e.key === 'ArrowRight') tournerPage(1); if (e.key === 'ArrowLeft') tournerPage(-1);
});

/* ---------- LOUPE : la carte en grand, on passe d'une carte possédée à l'autre ---------- */
function loupe(id){
  $('.loupe')?.remove();
  const c0 = chauve(id), liste = chauves().filter(c => c.coll === c0.coll && nbDe(c.id)).sort(parRarete);
  let k = Math.max(0, liste.findIndex(c => c.id === id));
  const fen = document.createElement('div'); fen.className = 'loupe'; document.body.append(fen);
  const fermer = () => { fen.remove(); removeEventListener('keydown', clavier, true); };
  const montrer = () => {
    const c = liste[k], copies = mesCopies().filter(x => x.id === c.id), meilleur = meilleurExemplaire(c.id);
    fen.innerHTML = `<button class="fermer" data-fermer aria-label="Fermer">${ic('x')}</button>
      <button class="tourne g" data-l="-1" ${k ? '' : 'disabled'} aria-label="Carte précédente">${ic('chevg', 2.2)}</button>
      <div class="loupe-c"><div class="loupe-carte">${carteCopie(meilleur)}</div>
        <div class="loupe-i"><b>${esc(c.nom)}</b><span class="mut">${RARETES[c.rarete].nom} · ${copies.length} exemplaire${copies.length > 1 ? 's' : ''}${copies.some(x => x.chrome) ? ` dont ${copies.filter(x => x.chrome).length} chromé${copies.filter(x => x.chrome).length > 1 ? 's' : ''}` : ''}</span>
          <button class="btn petit" data-details>Détails, vente, échange</button></div></div>
      <button class="tourne d" data-l="1" ${k < liste.length - 1 ? '' : 'disabled'} aria-label="Carte suivante">${ic('chevd', 2.2)}</button>`;
    fen.querySelector('[data-fermer]').onclick = fermer;
    fen.querySelectorAll('[data-l]').forEach(b => b.onclick = () => aller(+b.dataset.l));
    fen.querySelector('[data-details]').onclick = () => { fermer(); fiche(c.id); };
  };
  const aller = d => { if (k + d < 0 || k + d >= liste.length) return; k += d; montrer(); };
  const clavier = e => { if (e.key === 'Escape'){ e.stopImmediatePropagation(); fermer(); } if (e.key === 'ArrowRight'){ e.stopImmediatePropagation(); aller(1); } if (e.key === 'ArrowLeft'){ e.stopImmediatePropagation(); aller(-1); } };
  addEventListener('keydown', clavier, true);
  fen.onclick = e => { if (e.target === fen || e.target.classList.contains('loupe-c')) fermer(); };
  montrer();
}

/* ---------- MARCHÉ (temps réel) ---------- */
const aMise = e => E.moi && (e.mises || []).some(m => m.uid ? m.uid === E.moi.uid : m.nom === E.moi.nom);
function etatLot(e){
  if (e.fini) return e.annulee ? ['Retirée de la vente', ''] : e.meneur ? [`Adjugé à ${e.meneur === E.moi?.uid ? 'toi' : e.meneurNom}`, e.meneur === E.moi?.uid ? 'ok' : ''] : ['Sans offre', ''];
  if (!E.moi) return ['', ''];
  if (e.meneur === E.moi.uid) return ['Tu mènes', 'ok'];
  if (aMise(e)) return ['Tu as été surenchéri', 'ko'];
  return ['', ''];
}
const libelle = e => e.fini && e.meneur ? 'Prix final' : e.offre ? 'Offre actuelle' : 'Prix de départ';
const texteMeneur = e => e.meneur ? `par ${e.meneurNom} · ${e.nb || 1} mise${(e.nb || 1) > 1 ? 's' : ''}` : 'Aucune mise';
function lotHTML(eid, e){
  const c = chauve(e.id), reste = e.fin - Date.now(), moiV = E.moi && e.vendeur === E.moi.uid, [etat, cls] = etatLot(e);
  return `<button class="lot ${moiV ? 'moi' : ''} ${cls === 'ok' && !e.fini ? 'tete' : ''}" data-lot="${eid}" data-offre-vue="${e.offre}" aria-label="Voir l'enchère ${esc(c.nom)}">
    ${carteCopie(e)}
    <span class="corps">
      <span class="chrono ${reste <= JEU.relance && !e.fini ? 'urgent' : ''}" data-fin="${e.fini ? 0 : e.fin}">${e.fini ? 'Terminée' : duree(reste)}</span>
      <span class="etiq" data-l="libelle">${libelle(e)}</span>
      <span class="offre-a" data-l="offre">${R(e.offre || e.depart)}</span>
      <span class="mut" style="font-size:12.5px" data-l="meneur">${esc(texteMeneur(e))}</span>
      <span class="etat ${cls}" data-l="etat">${etat}</span>
    </span></button>`;
}
/* mise à jour en place des cartes (sans tout redessiner) */
function majLots(){
  for (const el of $$('[data-lot]')){
    const e = E.ench[el.dataset.lot]; if (!e) continue;
    if (+el.dataset.offreVue !== e.offre){ el.dataset.offreVue = e.offre; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    const [etat, cls] = etatLot(e);
    el.querySelector('[data-l="offre"]').innerHTML = R(e.offre || e.depart);
    el.querySelector('[data-l="libelle"]').textContent = libelle(e);
    el.querySelector('[data-l="meneur"]').textContent = texteMeneur(e);
    const et = el.querySelector('[data-l="etat"]'); et.textContent = etat; et.className = `etat ${cls}`;
    el.classList.toggle('tete', cls === 'ok' && !e.fini);
    el.querySelector('[data-fin]').dataset.fin = e.fini ? 0 : e.fin;
  }
  majEnchere();
}

/* ---------- la fenêtre d'une enchère : historique en direct + mise ---------- */
let enchereOuverte = null;
function ouvrirEnchere(eid){
  const e = E.ench[eid]; if (!e) return;
  const c = chauve(e.id);
  enchereOuverte = eid;
  openModal(`<div class="enchere r-${c.rarete}" id="enchere" data-eid="${eid}">
    <div class="ench-art">${carteCopie(e)}</div>
    <div class="ench-info">
      <span class="puce" style="color:${RARETES[c.rarete].couleur}">${RARETES[c.rarete].nom}${e.chrome ? ' · Chromé' : ''}</span>
      <h2 style="margin:8px 0 2px;font-size:34px">${esc(c.nom)}</h2>
      <div class="mono mut">${RARETES[c.rarete].nom}${e.chrome ? ' · Chromé' : ''} · vendu par ${E.moi && e.vendeur === E.moi.uid ? 'toi' : `<a class="joueur-lien" href="#v-${esc(E.joueurs[e.vendeur]?.login || '')}">${esc(e.vendeurNom)}</a>`}</div>
      <div class="ench-chiffres">
        <div><span class="etiq" data-d="libelle"></span><b class="gros" data-d="offre"></b><span class="mut" data-d="meneur"></span></div>
        <div><span class="etiq">Temps restant</span><b class="gros chrono" data-d="chrono" data-fin="0"></b><span class="mut" data-d="relances"></span></div>
      </div>
      <div class="etat" data-d="etat"></div>
      <div data-d="action"></div>
      <p class="mut regle">Une mise dans les 10 dernières secondes relance le chrono à 1 minute. Ta mise bloque tes cheveux ; si quelqu'un surenchérit, ils te sont rendus.</p>
      <div class="etiq" style="margin:18px 0 8px">Historique des mises <span class="mono" data-d="nb"></span></div>
      <ol class="histo" data-d="hist"></ol>
    </div></div>`);
  $('#modalIn').classList.add('large-ench');
  majEnchere(true);
}
function majEnchere(complet){
  const box = $('#enchere'); if (!box || !$('#modal').classList.contains('ouvert')){ enchereOuverte = null; return; }
  const eid = box.dataset.eid, e = E.ench[eid]; if (!e) return;
  const d = k => box.querySelector(`[data-d="${k}"]`), moiV = E.moi && e.vendeur === E.moi.uid, [etat, cls] = etatLot(e);
  const offreAvant = d('offre').dataset.v;
  d('libelle').textContent = libelle(e);
  d('offre').innerHTML = R(e.offre || e.depart); d('offre').dataset.v = e.offre;
  if (offreAvant !== undefined && +offreAvant !== e.offre){ box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
  d('meneur').textContent = e.meneur ? `par ${e.meneurNom}` : 'Aucune mise pour l\'instant';
  d('chrono').dataset.fin = e.fini ? 0 : e.fin; d('chrono').textContent = e.fini ? 'Terminée' : duree(e.fin - Date.now());
  d('relances').textContent = e.relances ? `relancée ${e.relances} fois` : '';
  d('etat').textContent = etat; d('etat').className = `etat ${cls}`;
  const mises = [...(e.mises || [])].reverse();
  d('nb').textContent = e.nb ? `(${e.nb})` : '';
  d('hist').innerHTML = mises.length ? mises.map((m, i) => { const moi = E.moi && (m.uid ? m.uid === E.moi.uid : m.nom === E.moi.nom);
    return `<li class="${i === 0 ? 'meneur' : ''} ${moi ? 'moi' : ''}"><span class="qui">${i === 0 ? (e.fini ? '🏆 ' : '👑 ') : ''}${esc(m.nom)}${moi ? ' <span class="puce" style="color:var(--orange-c)">toi</span>' : ''}</span><b class="mono">${fmt(m.m)}</b><span class="t">${new Date(m.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></li>`; }).join('')
    : `<li class="vide-h">Personne n'a encore misé. Prix de départ : ${fmt(e.depart)}.</li>`;
  /* zone d'action : on ne la redessine que si son état change, pour ne pas casser la saisie */
  const min = miseMin(e), mode = e.fini ? 'fini' : !E.moi ? 'anonyme' : moiV ? (e.meneur ? 'vendeur' : 'vendeur-libre') : e.meneur === E.moi.uid ? 'meneur' : 'miser';
  const act = d('action');
  if (complet || act.dataset.mode !== mode){
    act.dataset.mode = mode;
    act.innerHTML = {
      fini: '',
      anonyme: `<a class="connexion" href="/api/login">${ic('twitch')}Se connecter avec Twitch pour miser</a>`,
      vendeur: '<p class="mut">C\'est ta vente : tu ne peux pas miser dessus. Tu seras prévenu à chaque mise.</p>',
      'vendeur-libre': '<p class="mut">C\'est ta vente. Personne n\'a encore misé.</p><button class="btn petit" id="retirerVente">Retirer de la vente</button>',
      meneur: `<form class="miser" id="fMise"><button class="btn neon big" type="button" data-rapide>Monter à ${fmt(min)}</button><div class="perso"><input id="mMontant" type="number" min="${min}" step="1" value="${min}" inputmode="numeric" aria-label="Montant de ta mise"><button class="btn" type="submit">Miser ce montant</button></div></form>`,
      miser: `<form class="miser" id="fMise"><button class="btn neon big" type="button" data-rapide>Miser ${fmt(min)}</button><div class="perso"><input id="mMontant" type="number" min="${min}" step="1" value="${min}" inputmode="numeric" aria-label="Montant de ta mise"><button class="btn" type="submit">Miser ce montant</button></div></form>`,
    }[mode];
    const f = $('#fMise');
    if (f){
      const envoyer = (montant, b) => occupe(b, async () => { await api('miser', { eid, montant }); toast(`Tu mènes à ${mR(montant)}`); });
      f.querySelector('[data-rapide]').onclick = ev => envoyer(miseMin(E.ench[eid]), ev.currentTarget);
      f.onsubmit = ev => { ev.preventDefault(); envoyer(+$('#mMontant').value, ev.submitter); };
    }
    const rv = $('#retirerVente'); if (rv) rv.onclick = () => occupe(rv, async () => { await api('annuler-vente', { eid }); toast('Chauve retiré de la vente'); });
  } else {
    const rapide = act.querySelector('[data-rapide]'); if (rapide) rapide.textContent = `${mode === 'meneur' ? 'Monter à' : 'Miser'} ${fmt(min)}`;
    const inp = $('#mMontant'); if (inp){ inp.min = min; if (document.activeElement !== inp && +inp.value < min) inp.value = min; }
  }
}
function vueMarche(){
  const toutes = Object.entries(E.ench), uid = E.moi?.uid;
  const listes = {
    cours: toutes.filter(([, e]) => !e.fini && e.vendeur !== uid).sort((a, b) => a[1].fin - b[1].fin),
    miennes: toutes.filter(([, e]) => aMise(e)).sort((a, b) => (a[1].fini - b[1].fini) || a[1].fin - b[1].fin),
    ventes: toutes.filter(([, e]) => uid && e.vendeur === uid).sort((a, b) => (a[1].fini - b[1].fini) || b[1].fin - a[1].fin),
    termine: toutes.filter(([, e]) => e.fini && !e.annulee).sort((a, b) => b[1].fin - a[1].fin).slice(0, 24),
  };
  const libres = mesCopies().filter(x => !x.vente && !x.lie && !x.pca);
  const onglets = [['cours', 'En cours', listes.cours.length], ...(uid ? [['miennes', 'Mes mises', listes.miennes.filter(([, e]) => !e.fini).length], ['ventes', 'Mes ventes', listes.ventes.filter(([, e]) => !e.fini).length], ['vendre', 'Vendre', libres.length]] : []), ['termine', 'Adjugés', listes.termine.length]];
  if (!onglets.some(o => o[0] === ongletM)) ongletM = 'cours';
  const corps = ongletM === 'vendre'
    ? (libres.length ? selecteur('vendre', libres, ({ x, n }) => { const c = chauve(x.id); return `<div class="cat"><img src="${esc(c.img)}" alt="" loading="lazy"><div><b>${esc(c.nom)}</b> ${x.chrome ? '<span class="puce badge-chrome">Chromé</span>' : ''}${x.note ? ` <span class="puce">PCA ${x.note.n}</span>` : ''}
        <div class="mono mut" style="font-size:12.5px"><span style="color:${RARETES[c.rarete].couleur}">${RARETES[c.rarete].nom}</span> · cote ${fmt(cote(x, c))}${n > 1 ? ` · ${n} exemplaires` : ''}</div></div>
        <div class="row"><button class="btn petit neon" data-vendre="${x.uid}">Mettre en vente</button></div></div>`; }, { grouper: true, classe: 'catalogue' }) : '<div class="vide">Tu n\'as aucun chauve à vendre. Passe au Salon !</div>')
    : (listes[ongletM].length ? `<div class="lots">${listes[ongletM].map(([k, e]) => lotHTML(k, e)).join('')}</div>` : `<div class="vide">${{ cours: 'Aucune enchère en cours.', miennes: 'Tu n\'as encore misé sur rien.', ventes: 'Tu n\'as rien mis en vente.', termine: 'Rien d\'adjugé pour l\'instant.' }[ongletM]}</div>`);
  return `<div class="row" style="justify-content:space-between;align-items:flex-end"><h1>Le Marché</h1><span class="en-direct" style="margin-bottom:14px">en direct</span></div>
  <p class="sub">Clique sur un chauve pour voir qui enchérit, combien, et miser à ton tour. Une mise dans les 10 dernières secondes relance le chrono à 1 minute.</p>
  <div class="onglets">${onglets.map(([k, l, n]) => `<button class="onglet" data-om="${k}" aria-pressed="${ongletM === k}">${l} <span class="mono" style="font-size:12px;opacity:.75">${n}</span></button>`).join('')}</div>${corps}`;
}

/* ---------- ÉCHANGES ---------- */
function vueEchanges(){
  if (!E.moi) return `<h1>Échanges</h1><div class="vide">Connecte-toi avec Twitch pour échanger des chauves avec le chat.</div>`;
  const recus = Object.entries(E.echA).sort((a, b) => b[1].t - a[1].t), envoyes = Object.entries(E.echDe).sort((a, b) => b[1].t - a[1].t);
  const bloc = ([tid, e], sens) => {
    const statut = { attente: 'En attente', 'en-cours': 'En cours', accepte: 'Accepté', refuse: 'Refusé', annule: 'Annulé', caduc: 'Annulé (chauve indisponible)' }[e.statut];
    return `<article class="ech"><div class="row" style="justify-content:space-between"><b>${sens === 'recu' ? `${esc(e.deNom)} te propose` : `Proposé à ${esc(e.aNom)}`}</b><span class="puce" style="color:${e.statut === 'accepte' ? 'var(--ok)' : e.statut === 'attente' ? 'var(--orange-c)' : 'var(--mut)'}">${statut}</span></div>
      <div class="cotes"><div><div class="etiq" style="margin-bottom:6px">${sens === 'recu' ? 'Tu reçois' : 'Tu donnes'}</div><div class="mini-liste">${(e.donne || []).map(miniCopie).join('') || '<span class="mut">Aucun chauve</span>'}</div>${e.reflets ? `<div style="margin-top:6px">+ ${R(e.reflets)}</div>` : ''}</div>
        <span class="fleche">⇄</span>
        <div><div class="etiq" style="margin-bottom:6px">${sens === 'recu' ? 'Tu donnes' : 'Tu reçois'}</div><div class="mini-liste">${(e.demande || []).map(miniCopie).join('') || '<span class="mut">Aucun chauve</span>'}</div></div></div>
      ${e.statut === 'attente' ? `<div class="row">${sens === 'recu' ? `<button class="btn neon petit" data-rep="${tid}" data-ok="1">Accepter</button><button class="btn petit" data-rep="${tid}" data-ok="0">Refuser</button>` : `<button class="btn petit" data-annuler-ech="${tid}">Annuler</button>`}</div>` : ''}
      <span class="t mut" style="font-size:12px">${ilya(e.t)}</span></article>`;
  };
  return `<h1>Échanges</h1><p class="sub">Propose un troc à un autre collectionneur : des chauves contre des chauves, avec des cheveux en plus si tu veux. Rien ne bouge tant qu'il n'a pas accepté.</p>
  <div class="row" style="margin-bottom:22px"><button class="btn neon" id="nouveauTroc">${ic('troc')}Proposer un échange</button></div>
  <div class="grille2"><section><h2>Reçus</h2><div class="pile">${recus.map(x => bloc(x, 'recu')).join('') || '<div class="vide">Aucune proposition reçue.</div>'}</div></section>
  <section><h2>Envoyés</h2><div class="pile">${envoyes.map(x => bloc(x, 'envoye')).join('') || '<div class="vide">Tu n\'as rien proposé.</div>'}</div></section></div>`;
}
async function ouvrirTroc(cible, pre = {}){
  if (!E.moi) return toast('Connecte-toi avec Twitch pour échanger');
  troc = { a: cible || '', donne: new Set(), demande: new Set(), leurs: [] };
  const autres = Object.entries(E.joueurs).filter(([u]) => u !== E.moi.uid).sort((a, b) => a[1].nom.localeCompare(b[1].nom));
  const libres = mesCopies().filter(x => !x.vente && !x.lie && !x.pca);
  openModal(`<h2>Proposer un échange</h2>
    <form id="fTroc" class="pile" style="gap:16px">
      <label class="champ" for="tA">Avec qui ?<select id="tA"><option value="">Choisis un collectionneur</option>${autres.map(([u, j]) => `<option value="${u}" ${u === cible ? 'selected' : ''}>${esc(j.nom)}</option>`).join('')}</select></label>
      <div class="troc">
        <div><div class="etiq" style="margin-bottom:8px">Tu donnes (${JEU.echangeMaxChauves} max)</div>${libres.length ? selecteur('trocD', libres, ({ x }) => `<label class="choix"><input type="checkbox" name="donne" value="${x.uid}">${carte(chauve(x.id), { copie: x, tabindex: -1 })}</label>`) : '<div class="vide">Aucun chauve disponible.</div>'}</div>
        <div><div class="etiq" style="margin-bottom:8px">Tu demandes</div><div id="tLeurs"><div class="vide">Choisis d'abord un collectionneur.</div></div></div>
      </div>
      <label class="champ" for="tR" style="max-width:260px">Cheveux en plus de ta part<input id="tR" type="number" min="0" step="1" value="0"></label>
      <div class="row"><button class="btn neon" type="submit">Envoyer la proposition</button><button class="btn" type="button" data-close>Annuler</button></div>
    </form>`);
  $('#modalIn').style.maxWidth = '980px';
  const charger = async u => {
    const el = $('#tLeurs'); if (!u){ el.innerHTML = '<div class="vide">Choisis d\'abord un collectionneur.</div>'; return; }
    el.innerHTML = '<div class="vide">Chargement…</div>';
    const leurs = listeCopies(await lire('copies', { orderBy: 'proprio', equalTo: u })).filter(x => !x.vente && !x.lie);
    selF.trocL = { q: '', r: '' };
    el.innerHTML = leurs.length ? selecteur('trocL', leurs, ({ x }) => `<label class="choix"><input type="checkbox" name="demande" value="${x.uid}">${carte(chauve(x.id), { copie: x, forcer: true, tabindex: -1 })}</label>`) : '<div class="vide">Ce joueur n\'a aucun chauve disponible.</div>';
  };
  $('#tA').onchange = e => charger(e.target.value);
  if (cible) charger(cible).then(() => { const i = pre.demande && $(`#fTroc input[name="demande"][value="${pre.demande}"]`); if (i){ i.checked = true; i.closest('.sel-i')?.scrollIntoView({ block: 'nearest' }); } });
  if (pre.donne){ const i = $(`#fTroc input[name="donne"][value="${pre.donne}"]`); if (i) i.checked = true; }
  $('#fTroc').onsubmit = e => {
    e.preventDefault();
    const donne = $$('#fTroc input[name="donne"]:checked').map(i => i.value), demande = $$('#fTroc input[name="demande"]:checked').map(i => i.value);
    occupe(e.submitter, async () => { await api('echange-proposer', { a: $('#tA').value, donne, demande, reflets: +$('#tR').value || 0 }); closeModal(); $('#modalIn').style.maxWidth = ''; toast('Proposition envoyée'); location.hash = '#echanges'; });
  };
}

/* ---------- VITRINE ---------- */
function vueVitrine(login){
  const entree = login ? joueurParLogin(login) : E.moi ? [E.moi.uid, moiJ()] : null;
  if (!entree) return login ? `<h1>Vitrine</h1><div class="vide">Aucun collectionneur « ${esc(login)} » pour l'instant.</div>` : `<h1>Ma vitrine</h1><div class="vide">Connecte-toi avec Twitch pour composer ta vitrine.</div>`;
  const [uid, j] = entree, estMoi = E.moi?.uid === uid, gr = gradeDe(j.score || 0), rang = Object.values(E.joueurs).filter(x => (x.score || 0) > (j.score || 0)).length + 1;
  const pieces = (j.vitrine || []).map(cu => E.vitrines?.[cu]).filter(Boolean);
  chargerVitrine(j.vitrine || []);
  return `<div class="vitrine-tete">${j.avatar ? `<img class="av" src="${esc(j.avatar)}" alt="">` : `<span class="av" style="display:grid;place-items:center">${tete(gr.cheveux, 60)}</span>`}
    <div><h1 style="margin:0">${estMoi ? 'Ma vitrine' : `La vitrine de ${esc(j.nom)}`}</h1>${j.devise ? `<div class="devise">« ${esc(j.devise)} »</div>` : ''}
      <div class="chiffres"><div><b>#${rang}</b><span>${JEU.classement}</span></div><div><b>${esc(gr.nom)}</b><span>calvitie ${fmt(j.score || 0)} pts</span></div><div><b>${Object.keys(j.succes || {}).length}</b><span>succès</span></div></div></div>
    <div class="row">${estMoi ? `<button class="btn neon" id="editerVitrine">Composer ma vitrine</button><button class="btn" id="copierLien">Copier le lien</button>` : E.moi ? `<button class="btn neon" data-troc="${uid}">${ic('troc')}Proposer un échange</button>` : ''}</div></div>
  <div class="etagere">${pieces.length ? pieces.map(x => carte(chauve(x.id), { copie: x, forcer: true })).join('') : `<div class="vide" style="grid-column:1/-1">${estMoi ? 'Ta vitrine est vide. Choisis jusqu\'à 6 chauves à exposer.' : 'Cette vitrine est encore vide.'}</div>`}</div>
  ${blocSouhaits(uid, j, estMoi)}`;
}
/* la liste de souhaits d'un joueur, sur sa vitrine ; chez un autre, on signale ceux qu'on a en double */
function blocSouhaits(uid, j, estMoi){
  const l = souhaitsDe(j).filter(id => E.cat.chauves[id]);
  if (!l.length && !estMoi) return '';
  const mesLibres = id => mesCopies().filter(x => x.id === id && !x.vente && !x.lie && !x.pca);
  return `<section class="souhaits"><h2>${ic('coeur')}${estMoi ? 'Je recherche' : `${esc(j.nom)} recherche`}<small class="mono">${l.length}/${JEU.souhaitsMax}</small></h2>
    ${l.length ? `<div class="cartes petites">${l.map(id => { const c = chauve(id), mien = mesLibres(id), dbl = !estMoi && mien.length > 1;
      return `<div class="sel-i">${carte(c, { forcer: true })}${dbl ? `<button class="btn petit neon" style="width:100%;margin-top:8px" data-troc-vers="${uid}" data-troc-donne="${mien.sort((a, b) => (a.chrome ? 1 : 0) - (b.chrome ? 1 : 0))[0].uid}">Tu l'as en double</button>` : ''}</div>`; }).join('')}</div>`
      : '<div class="vide">Ouvre la fiche d\'un chauve et touche « Ajouter à mes souhaits » : il s\'affichera ici pour que le chat sache quoi te proposer.</div>'}</section>`;
}
/* les exemplaires exposés peuvent appartenir à d'autres : on les lit un par un */
function chargerVitrine(liste){
  E.vitrines ||= {};
  const manquants = liste.filter(cu => !E.vitrines[cu] && !E.charge.has('v' + cu));
  if (!manquants.length) return;
  manquants.forEach(cu => E.charge.add('v' + cu));
  Promise.all(manquants.map(async cu => { const x = await lire(`copies/${cu}`); if (x && x.id) E.vitrines[cu] = { ...x, uid: cu }; })).then(planifier);
}
function editerVitrine(){
  const j = moiJ(), choisis = new Set(j.vitrine || []);
  openModal(`<h2>Composer ma vitrine</h2><p class="mut">Choisis jusqu'à ${JEU.vitrineMax} chauves à exposer. Tout le chat pourra voir ta vitrine.</p>
    <form id="fVit" class="pile" style="gap:16px"><label class="champ" for="vDev">Ta devise<input id="vDev" maxlength="80" value="${esc(j.devise || '')}" placeholder="Le crâne le plus lisse du chat"></label>
    ${mesCopies().length ? selecteur('vit', mesCopies(), ({ x }) => `<label class="choix"><input type="checkbox" name="vit" value="${x.uid}" ${choisis.has(x.uid) ? 'checked' : ''}>${carte(chauve(x.id), { copie: x, tabindex: -1 })}</label>`) : '<div class="vide">Tu n\'as pas encore de chauve.</div>'}
    <div class="row"><button class="btn neon" type="submit">Enregistrer</button><button class="btn" type="button" data-close>Annuler</button></div></form>`);
  $('#modalIn').style.maxWidth = '980px';
  $('#fVit').onchange = () => { const c = $$('#fVit input[name="vit"]:checked'); if (c.length > JEU.vitrineMax){ c.at(-1).checked = false; toast(`${JEU.vitrineMax} chauves au maximum`); } };
  $('#fVit').onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => { await api('vitrine', { copies: $$('#fVit input[name="vit"]:checked').map(i => i.value), devise: $('#vDev').value }); E.vitrines = {}; closeModal(); $('#modalIn').style.maxWidth = ''; toast('Vitrine enregistrée'); }); };
}

/* ---------- BROYEUR ---------- */
let fabTous = false;
const cleGroupe = x => `${x.id}|${x.chrome ? 1 : 0}|${x.note?.n || ''}`;
const mesDoublons = () => doublons(mesCopies().filter(x => !horsBroyeur(chauve(x.id))));
function vueBroyeur(){
  if (!E.moi) return `<h1>Broyeur</h1><div class="vide">Connecte-toi avec Twitch pour broyer tes doublons.</div>`;
  const j = moiJ(), B = broyeurDe(E.cat.reglages), d = mesDoublons(), gain = x => poussiereDe(x, chauve(x.id), E.cat.reglages);
  const total = d.reduce((t, x) => t + gain(x), 0), possede = new Set(mesCopies().map(x => x.id));
  /* broyage rapide par rareté : sans les Chromés ni les cartes sous coque, qu'on broie un par un */
  const rapides = ORDRE_R.map(r => [r, d.filter(x => chauve(x.id).rarete === r && !x.chrome && !x.note)]).filter(([, l]) => l.length);
  const fab = chauves().filter(c => !estOr(c) && B.prix[c.rarete] && (fabTous || !possede.has(c.id)) && (E.emis[c.id] || 0) < tirageMax(c));
  const raretes = ORDRE_R.filter(k => k !== 'or');
  return `<h1>Broyeur</h1><p class="sub">Broie tes doublons pour récupérer de la poussière de crâne, puis fabrique le chauve qui te manque. Tu gardes toujours au moins un exemplaire de chaque chauve.</p>
  <section class="pan br-tete"><div><div class="etiq">Ta poussière de crâne</div><div class="br-solde">${PO(j.poussiere || 0)}</div>
      <div class="mut" style="font-size:14px">${d.length ? `Tes ${d.length} doublon${d.length > 1 ? 's' : ''} valent ${PO(total)}` : 'Aucun doublon pour l\'instant.'}</div></div>
    <div class="br-tarifs">${raretes.map(k => `<div style="--rc:${RARETES[k].couleur}"><b>${RARETES[k].nom}</b>${k === 'unique' ? '<span>jamais broyé</span><span>jamais fabriqué</span>' : `<span>broyé ${PO(B.gain[k] || 0)}</span><span>${B.prix[k] ? `fabriqué ${PO(B.prix[k])}` : 'ne se fabrique pas'}</span>`}</div>`).join('')}
      <div style="--rc:#8fe3ff"><b>Chromé</b><span>broyé ×${B.chrome}</span><span>jamais fabriqué</span></div></div></section>
  <section class="pan pca-sec"><h2>Broyer mes doublons</h2>
    ${d.length ? `${rapides.length ? `<div class="row br-rapide">${rapides.map(([r, l]) => `<button class="btn" data-broyer-rar="${r}" style="--rc:${RARETES[r].couleur}"><span class="pastille"></span>Tous les ${RARETES[r].nom.toLowerCase()}s en trop · ${l.length} <span class="mut">→</span> ${PO(l.reduce((t, x) => t + gain(x), 0))}</button>`).join('')}</div>` : ''}
      ${selecteur('broyer', d, ({ x, n }) => `<button class="carte" data-fiche="${x.id}">${carteCopie(x)}</button>
        <div class="br-act"><span>${PO(gain(x))}${n > 1 ? '<small> /u</small>' : ''}</span><button class="btn petit" data-broyer-g="${cleGroupe(x)}">Broyer</button></div>`, { grouper: true })}`
      : '<div class="vide">Pas de doublon à broyer. Ouvre des boosters au Salon !</div>'}</section>
  <section class="pan pca-sec"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px"><h2 style="margin:0">Fabriquer un chauve</h2>
      <div class="segment" role="group" aria-label="Fabriquer"><button data-fabt="0" aria-pressed="${!fabTous}">Ceux qui me manquent</button><button data-fabt="1" aria-pressed="${fabTous}">Tous</button></div></div>
    ${fab.length ? selecteur('fab', fab.map(c => ({ id: c.id, uid: 'f-' + c.id })), ({ x }) => { const c = chauve(x.id), prix = B.prix[c.rarete], assez = (j.poussiere || 0) >= prix;
      return `<button class="carte" data-fiche="${c.id}">${carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: E.cat.collections[c.coll]?.nom, droite: '' })}</button>
        <div class="br-act"><span class="${assez ? '' : 'mut'}">${PO(prix)}</span><button class="btn petit ${assez ? 'neon' : ''}" data-fab="${c.id}" ${assez ? '' : `disabled title="Il te manque ${fmt(prix - (j.poussiere || 0))} poussières"`}>Fabriquer</button></div>`; })
      : `<div class="vide">${fabTous ? 'Aucun chauve à fabriquer.' : 'Il ne te manque aucun chauve fabricable. Bravo !'}</div>`}
    <p class="mut" style="font-size:13px;margin:12px 0 0">Un chauve fabriqué n'est jamais Chromé, compte dans le tirage maximum et a son propre état caché pour le PCA. Les uniques et le Crâne d'or ne se broient ni ne se fabriquent jamais.</p></section>`;
}
/* uids : les exemplaires proposés ; pour un groupe de doublons, on choisit combien en broyer */
function confirmerBroyage(uids, groupe = false){
  const tous = uids.filter(u => E.copies[u]).map(u => ({ ...E.copies[u], uid: u })); if (!tous.length) return;
  let n = tous.length;
  const dessiner = () => {
    const xs = tous.slice(0, n), total = xs.reduce((t, x) => t + poussiereDe(x, chauve(x.id), E.cat.reglages), 0), speciaux = xs.filter(x => x.chrome || x.note).length;
    openModal(`<h2>Broyer ${xs.length > 1 ? `${xs.length} chauves` : esc(chauve(xs[0].id).nom)} ?</h2>
      ${groupe && tous.length > 1 ? `<div class="row br-qte"><span class="mut">Combien ?</span><button class="btn petit" data-q="-1" ${n <= 1 ? 'disabled' : ''}>−</button><b class="mono">${n}</b><button class="btn petit" data-q="1" ${n >= tous.length ? 'disabled' : ''}>+</button><button class="btn petit" data-q="tout" ${n >= tous.length ? 'disabled' : ''}>Tous (${tous.length})</button></div>` : ''}
      <div class="mini-liste" style="margin:12px 0">${xs.slice(0, 12).map(miniCopie).join('')}${xs.length > 12 ? `<span class="mut">+ ${xs.length - 12}</span>` : ''}</div>
      <p>Tu récupères <b>${PO(total)}</b>. C'est définitif : ${xs.length > 1 ? 'ces exemplaires disparaissent' : 'cet exemplaire disparaît'}, et tu gardes ton meilleur exemplaire.${speciaux ? ` <b style="color:var(--orange-c)">Attention : ${speciaux > 1 ? `${speciaux} sont Chromés ou sous coque` : 'il est Chromé ou sous coque'}.</b>` : ''}</p>
      <div class="row"><button class="btn neon" id="okBroie">Broyer</button><button class="btn" data-close>Annuler</button></div>`);
    $$('#modalIn [data-q]').forEach(b => b.onclick = () => { n = b.dataset.q === 'tout' ? tous.length : Math.max(1, Math.min(tous.length, n + +b.dataset.q)); dessiner(); });
    $('#okBroie').onclick = e => occupe(e.currentTarget, async () => { const r = await api('broyer', { copies: xs.map(x => x.uid) }); closeModal(); toast(`${r.broyes} broyé${r.broyes > 1 ? 's' : ''} : +${fmt(r.poussiere)} poussières de crâne`); });
  };
  dessiner();
}
function confirmerFabrication(id){
  const c = chauve(id), prix = broyeurDe(E.cat.reglages).prix[c.rarete];
  openModal(`<h2>Fabriquer ${esc(c.nom)} ?</h2><div class="row" style="gap:18px;align-items:center;flex-wrap:nowrap"><span class="mini" style="width:96px">${carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, droite: '' })}</span>
    <p class="mut" style="margin:0">Le Broyeur assemble un exemplaire neuf de ce chauve ${RARETES[c.rarete].nom.toLowerCase()} pour <b>${PO(prix)}</b>.</p></div>
    <div class="row" style="margin-top:18px"><button class="btn neon" id="okFab">Fabriquer</button><button class="btn" data-close>Annuler</button></div>`);
  $('#okFab').onclick = e => occupe(e.currentTarget, async () => { await api('fabriquer', { id }); closeModal(); toast(`${c.nom} fabriqué : il t'attend dans ton ChauveDex`); });
}
function brancherBroyeur(){
  $$('[data-broyer-g]').forEach(b => b.onclick = () => confirmerBroyage(mesDoublons().filter(x => cleGroupe(x) === b.dataset.broyerG).map(x => x.uid), true));
  $$('[data-broyer-rar]').forEach(b => b.onclick = () => confirmerBroyage(mesDoublons().filter(x => chauve(x.id).rarete === b.dataset.broyerRar && !x.chrome && !x.note).map(x => x.uid)));
  $$('[data-fab]').forEach(b => b.onclick = () => confirmerFabrication(b.dataset.fab));
  $$('[data-fabt]').forEach(b => b.onclick = () => { fabTous = b.dataset.fabt === '1'; render(); });
}

/* ---------- SUCCÈS ---------- */
let sucF = 'tous';
function etatSucces(){
  const j = moiJ(), m = mesures(j, mesCopies(), E.cat);
  return SUCCES.map(x => { const v = Math.min(x.cible, m[x.mesure] || 0), recu = !!(j.succes || {})[x.id]; return { ...x, v, recu, pret: !recu && v >= x.cible }; });
}
function vueSucces(){
  if (!E.moi) return `<h1>Succès</h1><div class="vide">Connecte-toi avec Twitch pour suivre tes succès.</div>`;
  const liste = etatSucces(), faits = liste.filter(x => x.recu), prets = liste.filter(x => x.pret);
  const gagne = faits.reduce((t, x) => t + x.gain, 0), total = liste.reduce((t, x) => t + x.gain, 0), pct = Math.round(faits.length / liste.length * 100);
  if (sucF === 'prets' && !prets.length) sucF = 'tous';
  const filtres = [['tous', 'Tous', liste.length], ['prets', 'À récupérer', prets.length], ['cours', 'En cours', liste.filter(x => !x.recu && !x.pret).length], ['faits', 'Obtenus', faits.length]];
  const garde = x => sucF === 'tous' || (sucF === 'prets' && x.pret) || (sucF === 'cours' && !x.recu && !x.pret) || (sucF === 'faits' && x.recu);
  const ordre = x => x.pret ? 0 : x.recu ? 2 : 1;
  const tuile = x => `<article class="sut ${x.pret ? 'pret' : ''} ${x.recu ? 'fait' : ''}" style="--p:${x.v / x.cible * 100}%">
      <div class="sut-h"><span class="emo" aria-hidden="true">${x.emoji || '🏆'}</span>${x.recu ? `<span class="ok" title="Obtenu">${ic('check', 2)}</span>` : ''}</div>
      <h3>${x.nom}</h3><p>${x.desc}</p>
      <div class="sut-b">${x.recu ? '<span class="mut">Obtenu</span>' : `<div class="jauge"><i></i></div><span class="mono">${fmt(x.v)}/${fmt(x.cible)}</span>`}<span class="gain">${R(x.gain)}</span></div>
      ${x.pret ? `<button class="btn petit neon" data-suc="${x.id}">Récupérer</button>` : ''}</article>`;
  const familles = FAMILLES_SUCCES.map(f => { const l = liste.filter(x => (x.cat || 'autres') === f.id && garde(x)).sort((a, b) => ordre(a) - ordre(b));
    return l.length ? `<section class="suf" id="suf-${f.id}"><h2><span aria-hidden="true">${f.emoji}</span>${f.nom}<small class="mono">${liste.filter(x => x.cat === f.id && x.recu).length}/${liste.filter(x => x.cat === f.id).length}</small></h2><div class="sug">${l.map(tuile).join('')}</div></section>` : ''; }).join('');
  return `<h1>Succès</h1>
  <section class="pan su-tete"><div class="su-anneau" style="--p:${pct}%"><div><b>${faits.length}</b><span>/${liste.length}</span></div></div>
    <div><div class="etiq">Ta progression</div><div class="su-gain">${R(gagne)} <span class="mut">gagnés sur ${fmt(total)}</span></div>
      <div class="mut" style="font-size:14px">${prets.length ? `${prets.length} succès ${prets.length > 1 ? 'sont prêts' : 'est prêt'} à être récupéré${prets.length > 1 ? 's' : ''}.` : 'Chaque succès rapporte des cheveux et des points de calvitie.'}</div></div>
    ${prets.length ? `<button class="btn neon" id="toutRecup">Tout récupérer · ${R(prets.reduce((t, x) => t + x.gain, 0))}</button>` : ''}</section>
  <div class="onglets">${filtres.map(([k, l, n]) => `<button class="onglet" data-sucf="${k}" aria-pressed="${sucF === k}" ${n || k === 'tous' ? '' : 'disabled'}>${l} <span class="mono" style="font-size:12px;opacity:.75">${n}</span></button>`).join('')}</div>
  <nav class="su-sauts" aria-label="Familles de succès">${FAMILLES_SUCCES.map(f => { const l = liste.filter(x => x.cat === f.id), p = l.filter(x => x.pret).length;
    return l.some(garde) ? `<a href="#suf-${f.id}" data-saut="suf-${f.id}"><span aria-hidden="true">${f.emoji}</span>${f.nom}<small class="mono">${l.filter(x => x.recu).length}/${l.length}</small>${p ? `<em class="pastille-n">${p}</em>` : ''}</a>` : ''; }).join('')}</nav>
  ${familles || '<div class="vide">Rien ici pour l\'instant.</div>'}`;
}
async function toutRecuperer(b){
  let gain = 0;
  await occupe(b, async () => { for (const x of etatSucces().filter(x => x.pret)){ const r = await api('succes', { id: x.id }); gain += r.gain || 0; } });
  if (gain) toast(`Succès récupérés : +${mR(gain)}`);
}
const succesPrets = () => E.moi ? etatSucces().filter(x => x.pret).length : 0;

/* ---------- CLASSEMENT ---------- */
function vueClassement(){
  const tous = Object.entries(E.joueurs).sort((a, b) => (b[1].score || 0) - (a[1].score || 0)).slice(0, 100), gm = gradeDe(moiJ().score || 0);
  return `<h1>${JEU.classement}</h1><p class="sub">Le classement des plus accros. Plus ta collection grandit, plus tu perds tes cheveux. La calvitie compte chaque chauve selon sa rareté, les Chromés, les petits numéros, les collections complètes et les succès.</p>
  <div class="grades">${GRADES.map(g => `<div class="gr ${E.moi && g === gm ? 'moi' : ''}">${tete(g.cheveux, 54)}<span>${g.nom}</span><small>${fmt(g.min)} pts</small></div>`).join('')}</div>
  <div class="pan scroll-x" style="padding:14px 6px"><table class="table"><thead><tr><th>Rang</th><th>Collectionneur</th><th>Grade</th><th style="text-align:right">Calvitie</th></tr></thead><tbody>
  ${tous.map(([u, j], i) => { const g = gradeDe(j.score || 0), moi = u === E.moi?.uid; return `<tr class="${moi ? 'moi' : ''}"><td class="rang ${i < 3 ? 'pod' : ''}">${i + 1}</td><td><a class="j joueur-lien" href="#v-${esc(j.login)}">${tete(g.cheveux, 30)}${esc(j.nom)}${moi ? ' <span class="puce" style="color:var(--orange-c)">toi</span>' : ''}</a></td><td class="mut">${g.nom}</td><td class="mono" style="text-align:right">${fmt(j.score || 0)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="mut">Personne pour l\'instant.</td></tr>'}
  </tbody></table></div>`;
}

/* ---------- ATELIER (admin) ---------- */
function vueAtelier(){
  const cols = collections();
  if (!chauves(true).length) return `<h1>L'Atelier</h1><p class="sub">Le catalogue est vide. Sème les 9 chauves de départ, leurs 3 collections et le booster Saison 1.</p><button class="btn neon" id="initCat">Semer le catalogue</button>`;
  const onglets = [['cartes', 'Cartes', chauves(true).length], ['nouvelle', 'Nouvelle carte', ''], ['boosters', 'Boosters', boosters(true).length], ['collections', 'Collections', cols.length], ['taux', 'Pourcentages', ''], ['broyeur', 'Broyeur', ''], ['stream', 'Stream', ''], ['maintenance', E.maintenance?.actif ? 'Maintenance · active' : 'Maintenance', ''], ['zero', 'Remise à zéro', '']];
  const corps = {
    cartes: () => `${panneauGagnants()}<div class="filtres">
        <input id="fcQ" type="search" placeholder="Chercher une carte…" value="${esc(filtreA.q)}" aria-label="Chercher une carte">
        <select id="fcRar" aria-label="Rareté"><option value="">Toutes les raretés</option>${ORDRE_R.map(k => `<option value="${k}" ${filtreA.rar === k ? 'selected' : ''}>${RARETES[k].nom}</option>`).join('')}</select>
        <select id="fcColl" aria-label="Collection"><option value="">Toutes les collections</option>${cols.map(c => `<option value="${c.id}" ${filtreA.coll === c.id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>
        <select id="fcBo" aria-label="Booster"><option value="">Tous les boosters</option>${boosters(true).map(b => `<option value="${b.id}" ${filtreA.bo === b.id ? 'selected' : ''}>${esc(b.nom)}</option>`).join('')}<option value="-" ${filtreA.bo === '-' ? 'selected' : ''}>Dans aucun booster</option></select>
        <select id="fcTri" aria-label="Tri">${[['recent', 'Plus récentes d\'abord'], ['ancien', 'Plus anciennes d\'abord'], ['nom', 'Par nom'], ['rarete', 'Par rareté']].map(([k, t]) => `<option value="${k}" ${filtreA.tri === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <span class="mut" id="fcCompte"></span></div>
      <div class="cartes petites" id="fcGrille"></div><div class="vide" id="fcVide" hidden>Aucune carte ne correspond.</div>`,
    taux: () => { const t = tauxDe(E.cat.reglages), ors = chauves(true).filter(estOr);
      return `<form class="pan form" id="fTaux" style="max-width:640px"><h2 class="plein" style="margin:0">Pourcentages de tirage</h2>
        <p class="plein mut" style="margin:0">Pour chaque carte d'un booster, la chance de tomber sur chaque rareté. Le total doit faire 100 %. Si un booster n'a aucune carte d'une rareté, il prend la rareté la plus proche.</p>
        ${ORDRE_R.filter(k => k !== 'or').map(k => `<label class="champ" for="t-${k}"><span style="color:${RARETES[k].couleur}">${RARETES[k].nom}</span><span class="row" style="gap:8px;align-items:center"><input id="t-${k}" data-taux="${k}" type="number" min="0" max="100" step="any" value="${+(t[k] * 100).toFixed(4)}"> %</span></label>`).join('')}
        <div class="plein total-taux" id="tTotal"></div>
        <label class="champ" for="tChrome">Chance d'être Chromée<span class="row" style="gap:8px;align-items:center"><input id="tChrome" type="number" min="0" max="100" step="any" value="${+(chromeDe(E.cat.reglages) * 100).toFixed(4)}"> %</span><small>Par carte tirée, toutes raretés.</small></label>
        <div class="champ plein">Crânes d'or<small>${ors.length ? ors.map(c => `${esc(c.nom)} : ${pct(chanceOr(c) * 100)} %`).join(' · ') + '. Réglé carte par carte, dans sa fenêtre Modifier.' : 'Aucun pour l\'instant. La chance se règle carte par carte.'}</small></div>
        <div class="row plein"><button class="btn neon" type="submit">Enregistrer</button><button class="btn" type="button" id="tDefaut">Valeurs par défaut</button></div></form>`; },
    maintenance: () => { const m = E.maintenance || {};
      return `<form class="pan form" id="fMaint" style="max-width:640px"><h2 class="plein" style="margin:0">Mode maintenance</h2>
        <p class="plein mut" style="margin:0">Quand il est actif, toi seul vois le site et peux jouer. Les autres voient un écran d'attente, et le serveur refuse leurs actions. Les enchères en cours sont mises en pause et récupèrent le temps perdu à la réouverture. Les cheveux de présence sur le stream continuent d'être crédités.</p>
        <div class="plein maint-etat ${m.actif ? 'on' : ''}"><span class="pastille-m"></span>${m.actif ? `Maintenance activée ${ilya(m.depuis)}` : 'Le Salon est ouvert à tout le monde'}</div>
        <label class="champ plein" for="mMsg">Message affiché aux joueurs (facultatif)<input id="mMsg" maxlength="200" value="${esc(m.message || '')}" placeholder="On polit les crânes et on range les classeurs. Reviens dans un petit moment !"></label>
        <div class="row plein">${m.actif ? '<button class="btn neon" type="submit" data-maint="maj">Mettre à jour le message</button><button class="btn" type="button" data-maint="off">Rouvrir le Salon</button>' : '<button class="btn danger" type="submit" data-maint="on">Activer la maintenance</button>'}</div></form>`; },
    zero: () => { const autres = Object.entries(E.joueurs).filter(([u]) => u !== E.moi.uid).sort((a, b) => (a[1].nom || '').localeCompare(b[1].nom || ''));
      return `<div class="pile zero" style="max-width:720px">
        <p class="mut" style="margin:0">Pour repartir de zéro avant le lancement. Le catalogue, les boosters, les collections, les pourcentages, les images et la clé de l'overlay sont toujours gardés.</p>
        <section class="pan"><h2 style="margin-top:0">Mon compte</h2><p class="mut">Tes chauves, cheveux, poussière, succès, stats, vitrine et souhaits sont effacés : tu repars à ${R(JEU.depart)} comme un nouveau joueur. Tes cartes rendent leur place dans le tirage (ton unique redevient disponible), tes enchères en cours sont annulées.</p>
          <button class="btn" data-zero="moi">Remettre mon compte à zéro</button></section>
        <section class="pan"><h2 style="margin-top:0">Un joueur</h2><p class="mut">Pareil, pour le compte d'un testeur.</p>
          <div class="row" style="flex-wrap:nowrap"><select id="zJoueur" style="flex:1;min-width:0" aria-label="Joueur"><option value="">Choisis un joueur</option>${autres.map(([u, j]) => `<option value="${u}">${esc(j.nom)}</option>`).join('')}</select><button class="btn" data-zero="joueur">Remettre à zéro</button></div></section>
        <section class="pan danger"><h2 style="margin-top:0">Tout le jeu</h2><p class="mut">À faire juste avant le lancement officiel : <b>tous</b> les joueurs repartent à ${R(JEU.depart)}, sans aucune carte. Les enchères, échanges, alertes, le fil du Salon, le rapport PCA et les tirages repartent de zéro. Les comptes restent inscrits : personne n'a besoin de se reconnecter.</p>
          <button class="btn danger" data-zero="tout">Remettre tout le jeu à zéro</button></section></div>`; },
    broyeur: () => { const B = broyeurDe(E.cat.reglages), rs = ORDRE_R.filter(k => k !== 'or');
      return `<form class="pan form" id="fBroyeur" style="max-width:640px"><h2 class="plein" style="margin:0">Broyeur</h2>
        <p class="plein mut" style="margin:0">La poussière de crâne gagnée en broyant un doublon, et son prix pour fabriquer un chauve. Laisse le prix vide pour qu'une rareté ne se fabrique pas. Les uniques et les Crânes d'or ne se broient ni ne se fabriquent jamais.</p>
        <div class="plein br-grille"><span></span><span class="etiq">Broyé</span><span class="etiq">Fabriqué</span>
        ${rs.map(k => `<b style="color:${RARETES[k].couleur}">${RARETES[k].nom}</b>${k === 'unique' ? '<span class="mut">jamais broyé</span>' : `<input type="number" min="0" data-bg="${k}" value="${B.gain[k] ?? 0}" aria-label="Poussière d'un ${RARETES[k].nom} broyé">`}${k === 'unique' ? '<span class="mut">jamais fabriqué</span>' : `<input type="number" min="1" data-bp="${k}" value="${B.prix[k] ?? ''}" placeholder="—" aria-label="Prix d'un ${RARETES[k].nom} fabriqué">`}`).join('')}</div>
        <label class="champ" for="bChrome">Un Chromé broyé rapporte<span class="row" style="gap:8px;align-items:center">× <input id="bChrome" type="number" min="1" max="20" step="any" value="${B.chrome}"></span></label>
        <div class="row plein"><button class="btn neon" type="submit">Enregistrer</button><button class="btn" type="button" id="bDefaut">Valeurs par défaut</button></div></form>`; },
    stream: () => `${(() => { const A = alertesDe(E.cat.reglages), opts = v => [...ORDRE_R.filter(k => k !== 'or').map(k => [k, `${RARETES[k].nom} et plus`]), ['aucun', 'Jamais']].map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('');
      return `<form class="pan form" id="fAlertes" style="max-width:720px;margin-bottom:18px"><h2 class="plein" style="margin:0">Alertes sur le stream</h2>
        <p class="plein mut" style="margin:0">Quand un viewer sort une grosse carte d'un booster, l'overlay l'annonce en grand avec son pseudo. Le Crâne d'or est toujours annoncé. Plus la carte est rare, plus l'alerte est spectaculaire.</p>
        <label class="champ" for="alMin">Annoncer les cartes<select id="alMin">${opts(A.min)}</select></label>
        <label class="champ" for="alChrome">Annoncer les Chromés<select id="alChrome">${opts(A.chrome)}</select></label>
        <div class="row plein"><button class="btn neon" type="submit">Enregistrer</button><a class="btn" href="/overlay.html?test=1" target="_blank" rel="noopener">Voir un exemple</a></div></form>`; })()}<section class="pan form" id="pStream" style="max-width:720px"><h2 class="plein" style="margin:0">Cheveux de stream</h2>
      <p class="plein mut" style="margin:0">Pendant le live, l'overlay relève toutes les ${JEU.presence.intervalle} minutes la liste des personnes connectées au chat. Chaque joueur inscrit sur le site reçoit ${R(JEU.presence.parHeure)} par heure et un booster gratuit toutes les ${JEU.presence.boosterToutes} minutes (${JEU.presence.stockMax} en réserve au maximum). Hors live, rien n'est crédité.</p>
      <div class="plein" id="stEtat">Chargement…</div></section>`,
    nouvelle: () => `<div style="max-width:640px"><form class="pan form" id="fChauve">
      <h2 class="plein" style="margin:0">Nouveau chauve</h2>
      <div class="plein depot"><label class="apercu" for="aImg" id="aApercu">Choisir une illustration</label>
        <label class="champ" for="aImg">Illustration<input id="aImg" type="file" accept="image/*"><small>Tu la recadres juste après l'avoir choisie. Clique sur l'aperçu pour recadrer à nouveau.</small></label></div>
      <label class="champ plein" for="aNom">Nom<input id="aNom" required maxlength="40"></label>
      <label class="champ" for="aRar">Rareté<select id="aRar">${ORDRE_R.map(k => `<option value="${k}">${RARETES[k].nom}</option>`).join('')}</select></label>
      <label class="champ" for="aTirage">Tirage maximum<input id="aTirage" type="number" min="1" value="${RARETES.commun.tirage}"><span style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="aIllimite" style="width:auto"> Illimité</span></label>
      <label class="champ plein or-seul" for="aPct" hidden>Chance de tirage du Crâne d'or<span class="row" style="gap:8px;align-items:center"><input id="aPct" type="number" min="0" max="100" step="any" value="${JEU.pctCraneOr}" style="width:140px"> % par carte tirée</span><small>Lié au compte du gagnant (ni vente, ni échange).</small></label>
      <label class="champ plein or-seul" for="aSaison" hidden>Saison<input id="aSaison" maxlength="40" placeholder="ex. Saison 1"><small>Un joueur ne peut gagner qu'un seul Crâne d'or par saison. Deux Crânes d'or avec la même saison comptent comme une seule.</small></label>
      <label class="champ" for="aColl">Collection<select id="aColl">${cols.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}<option value="" class="or-seul" hidden>Aucune collection</option></select></label>
      <label class="champ" for="aBooster">Dans le booster<select id="aBooster"><option value="">Aucun pour l'instant</option>${boosters(true).map(b => `<option value="${b.id}">${esc(b.nom)}</option>`).join('')}</select></label>
      <label class="champ plein" for="aDesc">Description<textarea id="aDesc" maxlength="160"></textarea></label>
      <div class="row plein"><button class="btn neon" type="submit">Ajouter au catalogue</button></div>
    </form></div>`,
    boosters: () => `<div style="max-width:640px"><section class="pan"><div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Boosters</h2><button class="btn neon petit" id="nouveauBooster">Nouveau booster</button></div>
        <div class="catalogue">${boosters(true).map(b => `<div class="cat bo" style="${b.actif ? '' : 'opacity:.55'}"><img src="${esc(b.img)}" alt=""><div><b>${esc(b.nom)}</b>${b.actif ? '' : ' <span class="puce">hors vente</span>'}<div class="mut" style="font-size:13px">${b.chauves.length} chauve${b.chauves.length > 1 ? 's' : ''} dedans · ${b.nb} carte${b.nb > 1 ? 's' : ''} · ${fmt(b.prix)} cheveux</div></div>
          <div class="row"><button class="btn petit neon" data-bo-cartes="${b.id}">Cartes</button><button class="btn petit" data-bo-modif="${b.id}">Modifier</button></div></div>`).join('') || '<div class="vide">Aucun booster. Crée le premier.</div>'}</div></section></div>`,
    collections: () => `<div class="grille2"><section class="pan"><h2>Collections</h2><div class="catalogue">${cols.map(c => { const n = chauves(true).filter(x => x.coll === c.id).length; return `<div class="cat sansimg"><div><b>${esc(c.nom)}</b><div class="mut" style="font-size:13px">${n} chauve${n > 1 ? 's' : ''} · récompense ${fmt(c.gain || 0)} cheveux</div></div>
        <button class="btn petit" data-co-modif="${c.id}">Modifier</button></div>`; }).join('') || '<div class="vide">Aucune collection.</div>'}</div></section>
      <form class="pan form" id="fColl"><h2 class="plein" style="margin:0">Nouvelle collection</h2>
        <label class="champ plein" for="cNom">Nom<input id="cNom" required maxlength="40"></label>
        <label class="champ plein" for="cDesc">Description<input id="cDesc" maxlength="120"></label>
        <label class="champ" for="cGain">Récompense<input id="cGain" type="number" min="0" value="300"></label>
        <div class="row plein"><button class="btn" type="submit">Créer</button></div></form></div>`,
  };
  return `<h1>L'Atelier</h1><p class="sub">Clique sur une carte pour tout modifier. Tout est visible aussitôt par tout le monde.</p>
  <div class="onglets">${onglets.map(([k, l, n]) => `<button class="onglet" data-oa="${k}" aria-pressed="${ongletA === k}">${l} <span class="mono" style="font-size:12px;opacity:.75">${n}</span></button>`).join('')}</div>${corps[ongletA]()}`;
}

/* =========================================================
   PCA — Polisseurs de Crânes Agréés : l'expertise des exemplaires
   ========================================================= */
const noteDe = n => NOTES[n] || NOTES[1];
const tarifPCA = c => JEU.pca[c.rarete] || JEU.pca.commun;
const dureeTexte = min => min >= 60 ? `${Math.round(min / 60 * 10) / 10} h`.replace('.', ',') : `${min} min`;
/* la carte sous coque : étiquette en haut, carte dans le boîtier */
function slab(x, base){
  const c = chauve(x.id), n = x.note.n, bl = blackLabel(x);
  return `<span class="slab ${bl ? 'black' : n === 10 ? 'gem' : ''}"><span class="slab-in"><span class="slab-l"><b class="slab-pca">PCA</b><span class="slab-t"><span class="slab-nom">${esc(c.nom)}${x.chrome ? ' · Chromé' : ''}</span><span class="slab-sous">${bl ? 'ÉTIQUETTE NOIRE' : noteDe(n).nom} · n° ${x.note.cert}</span></span><b class="slab-n">${n}</b></span><span class="slab-c">${base}</span></span></span>`;
}
function vuePCA(){
  if (!E.moi) return `<h1>PCA</h1><div class="vide">Connecte-toi avec Twitch pour faire expertiser tes chauves.</div>`;
  const miennes = mesCopies(), labo = miennes.filter(x => x.pca).sort((a, b) => a.pca.fin - b.pca.fin), libres = miennes.filter(x => !x.vente && !x.note);
  const notees = miennes.filter(x => x.note).sort((a, b) => b.note.n - a.note.n || b.note.t - a.note.t);
  const pf = ORDRE_R.filter(k => JEU.pca[k] && k !== 'or');
  const pop = Object.entries(E.pop || {}).map(([id, p]) => [chauve(id), p]).filter(([c]) => E.cat.chauves[c.id]).sort((a, b) => ORDRE_R.indexOf(b[0].rarete) - ORDRE_R.indexOf(a[0].rarete));
  return `<h1>PCA</h1><p class="sub">Les Polisseurs de Crânes Agréés expertisent tes chauves. L'état de chaque exemplaire est fixé à sa sortie du booster : l'expertise le révèle, de 1 à 10, et la carte revient sous coque. Une bonne note fait grimper sa cote.</p>
  <div class="tarifs">${pf.map(k => `<div class="tarif" style="--rc:${RARETES[k].couleur}"><span class="puce" style="color:${RARETES[k].couleur}">${RARETES[k].nom}</span><b>${R(JEU.pca[k].prix)}</b><span class="mut">${dureeTexte(JEU.pca[k].duree)}</span></div>`).join('')}
    <div class="tarif"><span class="puce" style="color:var(--mut)">Cote</span><b>×${NOTES[10].mult} en 10</b><span class="mut">×${NOTES[9].mult} en 9 · ×${NOTES[1].mult} en 1</span></div></div>
  ${labo.length ? `<section class="pan pca-sec"><h2>Au labo</h2><div class="labo">${labo.map(x => { const c = chauve(x.id), pret = Date.now() >= x.pca.fin;
    return `<div class="labo-l ${pret ? 'pret' : ''}"><span class="mini">${carteCopie(x)}</span><div><b>${esc(c.nom)}${x.chrome ? ' <span class="puce badge-chrome">Chromé</span>' : ''}</b><div class="mut">${pret ? 'Expertise terminée' : `Résultat dans <span class="mono" data-pcafin="${x.pca.fin}">${duree(x.pca.fin - Date.now())}</span>`}</div>
      <div class="jauge"><i style="width:${Math.min(100, (Date.now() - x.pca.debut) / (x.pca.fin - x.pca.debut) * 100)}%"></i></div></div>
      <div class="row">${pret ? `<button class="btn neon" data-reveler="${x.uid}">Révéler la note</button>` : E.moi.admin ? `<button class="btn petit" data-pca-fin="${x.uid}">Terminer maintenant</button>` : ''}</div></div>`; }).join('')}</div></section>` : ''}
  <section class="pan pca-sec"><h2>Envoyer à l'expertise</h2>${libres.length ? `<p class="mut" style="margin-top:-6px">Clique sur un chauve pour l'envoyer au labo. Pendant l'expertise, il ne peut ni être vendu ni échangé.</p>
    ${selecteur('pca', libres, ({ x }) => { const t = tarifPCA(chauve(x.id));
      return `<button class="carte pca-choix" data-pca-envoi="${x.uid}" aria-label="Expertiser ${esc(chauve(x.id).nom)}">${carteCopie(x)}<span class="legende">${R(t.prix)} · ${dureeTexte(t.duree)}</span></button>`; }, { grouper: true })}` : '<div class="vide">Aucun chauve disponible : tous sont déjà sous coque, au labo ou en vente.</div>'}</section>
  <section class="pan pca-sec"><h2>Tes chauves sous coque <span class="mono mut" style="font-size:15px">${notees.length}</span></h2>${notees.length ? `<div class="cartes slabs">${notees.map(x => `<button class="carte" data-copie="${x.uid}">${carteCopie(x)}</button>`).join('')}</div>` : '<div class="vide">Pas encore de chauve expertisé.</div>'}</section>
  <section class="pan pca-sec"><h2>Rapport de population</h2><p class="mut" style="margin-top:-6px">Combien d'exemplaires de chaque note existent, tous joueurs confondus.</p>${pop.length ? `<div class="pop-t"><table><thead><tr><th>Chauve</th>${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => `<th>${n}</th>`).join('')}<th>Total</th></tr></thead><tbody>${pop.map(([c, p]) => `<tr><td><span class="pastille" style="--rc:${RARETES[c.rarete].couleur}"></span> ${esc(c.nom)}</td>${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => `<td class="mono ${p[n] ? '' : 'mut'} ${n === 10 && p[n] ? 'gem' : ''}">${p[n] || '·'}</td>`).join('')}<td class="mono">${Object.values(p).reduce((a, b) => a + b, 0)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vide">Aucune expertise pour l\'instant.</div>'}</section>`;
}
function confirmerPCA(cu){
  const x = E.copies[cu], c = chauve(x.id), t = tarifPCA(c);
  openModal(`<h2>Expertise PCA</h2><div class="row" style="gap:18px;align-items:center;flex-wrap:nowrap"><span class="mini" style="width:96px">${carteCopie(x)}</span>
    <div><b style="font-size:18px">${esc(c.nom)}${x.chrome ? ' Chromé' : ''}</b><p class="mut" style="margin:6px 0 0">Les Polisseurs examinent le centrage, les coins, les bords et la surface. Résultat dans <b>${dureeTexte(t.duree)}</b>. La note est définitive : la carte reste sous coque.</p></div></div>
    <div class="row" style="margin-top:18px"><button class="btn neon" id="okPCA">Expertiser pour ${fmt(t.prix)} cheveux</button><button class="btn" data-close>Annuler</button></div>`);
  $('#okPCA').onclick = e => occupe(e.currentTarget, async () => { await api('pca-envoyer', { copie: cu }); closeModal(); toast(`${c.nom} est parti au labo`); });
}
/* la révélation : les quatre sous-notes, puis la note finale */
async function revelerPCA(cu){
  const r = await api('pca-reveler', { copie: cu }), x = { ...E.copies[cu], note: r.note }, c = chauve(x.id), n = r.note.n, bl = r.black;
  const fen = document.createElement('div'); fen.className = `pca-revele ${bl ? 'black' : n === 10 ? 'gem' : n >= 9 ? 'top' : ''}`;
  fen.innerHTML = `<canvas id="fxCanvas"></canvas><div class="pr-boite"><div class="pr-titre">PCA · Polisseurs de Crânes Agréés</div>
    <div class="pr-carte">${carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: E.cat.collections[c.coll]?.nom, droite: '', chrome: x.chrome })}</div>
    <div class="pr-sous">${SOUS_NOTES.map(([k, t]) => `<div class="pr-l" data-k="${k}"><span>${t}</span><span class="pr-b"><i></i></span><b class="mono">–</b></div>`).join('')}</div>
    <div class="pr-note"><b>?</b><span></span></div><button class="btn neon" id="prOk" hidden>Ranger sous coque</button></div>`;
  document.body.append(fen);
  const pause = ms => new Promise(f => setTimeout(f, ms));
  await pause(500);
  for (const [k] of SOUS_NOTES){ const l = fen.querySelector(`[data-k="${k}"]`), v = r.note[k]; l.classList.add('on'); l.querySelector('i').style.width = `${v * 10}%`;
    for (let i = 1; i <= v; i++){ l.querySelector('b').textContent = i; await pause(45); } await pause(380); }
  await pause(500);
  const zone = fen.querySelector('.pr-note'); zone.querySelector('b').textContent = n; zone.querySelector('span').textContent = bl ? 'ÉTIQUETTE NOIRE' : noteDe(n).nom; zone.classList.add('tombe');
  if (n >= 9){ const cv = fen.querySelector('#fxCanvas'), [cx, cy] = centre(zone); const COUL = bl ? ['#fff', '#d9d9d9', '#ffd447', '#111'] : n === 10 ? ['#fff6c9', '#ffd447', '#ffb000', '#fff'] : ['#cfeeff', '#8fe3ff', '#fff'];
    gerbe(cx, cy, n === 10 ? 220 : 90, COUL, { vmax: n === 10 ? 22 : 12, vie: 120, rond: true }); if (n === 10) pluie(160, COUL); }
  await pause(700); const ok = fen.querySelector('#prOk'); ok.hidden = false; ok.focus();
  await new Promise(f => { ok.onclick = f; });
  fen.classList.add('part'); await pause(300); fen.remove();
  toast(`${c.nom} : PCA ${n}${bl ? ' Étiquette noire' : ''}`);
}
function brancherPCA(){
  $$('[data-pca-envoi]').forEach(b => b.onclick = () => confirmerPCA(b.dataset.pcaEnvoi));
  $$('[data-reveler]').forEach(b => b.onclick = () => occupe(b, () => revelerPCA(b.dataset.reveler)));
  $$('[data-pca-fin]').forEach(b => b.onclick = () => occupe(b, () => api('admin-pca-terminer', { copie: b.dataset.pcaFin })));
}

/* =========================================================
   BRANCHEMENTS
   ========================================================= */
function brancher(){
  $$('#view [data-fiche]').forEach(b => b.onclick = () => fiche(b.dataset.fiche));
  $$('#view [data-copie]').forEach(b => b.onclick = () => { const x = E.copies[b.dataset.copie] || E.vitrines?.[b.dataset.copie]; if (x) fiche(x.id); });
  $$('[data-pack]').forEach(b => b.onclick = () => occupe(b, async () => { const r = await api('pack', { pack: b.dataset.pack }); ouvrirBooster(boosters(true).find(x => x.id === b.dataset.pack), r.copies); }));
  $$('[data-contenu]').forEach(b => b.onclick = () => contenuBooster(b.dataset.contenu));
  const dq = $('#dxQ'); if (dq) dq.oninput = () => { dexF.q = dq.value; listeDex(); };
  [['dxColl', 'coll'], ['dxGr', 'gr']].forEach(([id, k]) => { const el = $('#' + id); if (el) el.onchange = () => { dexF[k] = el.value; listeDex(); }; });
  $$('[data-dexv]').forEach(b => b.onclick = () => { dexF.voir = b.dataset.dexv; $$('[data-dexv]').forEach(x => x.setAttribute('aria-pressed', x === b)); listeDex(); });
  $$('[data-dexr]').forEach(b => b.onclick = () => { dexF.rar = dexF.rar === b.dataset.dexr ? '' : b.dataset.dexr; $$('[data-dexr]').forEach(x => x.classList.toggle('on', x.dataset.dexr === dexF.rar)); listeDex(); });
  $$('[data-dexvue]').forEach(b => b.onclick = () => { dexVue = b.dataset.dexvue; render(); });
  listeDex(); brancherClasseur(); brancherPCA(); brancherBroyeur();
  $$('[data-om]').forEach(b => b.onclick = () => { ongletM = b.dataset.om; render(); });
  $$('[data-lot]').forEach(b => b.onclick = () => ouvrirEnchere(b.dataset.lot));
  $$('#view [data-vendre]').forEach(b => b.onclick = () => formVente(b.dataset.vendre));
  $$('[data-sucf]').forEach(b => b.onclick = () => { sucF = b.dataset.sucf; render(); });
  $$('[data-saut]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.saut)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const tr = $('#toutRecup'); if (tr) tr.onclick = () => toutRecuperer(tr);
  $$('[data-suc]').forEach(b => b.onclick = () => occupe(b, async () => { const r = await api('succes', { id: b.dataset.suc }); toast(`Succès récupéré : +${mR(r.gain)}`); }));
  $$('[data-coll]').forEach(b => b.onclick = () => occupe(b, async () => { const r = await api('collection', { id: b.dataset.coll }); toast(`Collection complète : +${mR(r.gain)}`); }));
  $$('[data-rep]').forEach(b => b.onclick = () => occupe(b, async () => { await api('echange-repondre', { tid: b.dataset.rep, accepte: b.dataset.ok === '1' }); toast(b.dataset.ok === '1' ? 'Échange conclu' : 'Échange refusé'); }));
  $$('[data-annuler-ech]').forEach(b => b.onclick = () => occupe(b, async () => { await api('echange-annuler', { tid: b.dataset.annulerEch }); toast('Proposition annulée'); }));
  $$('[data-troc]').forEach(b => b.onclick = () => ouvrirTroc(b.dataset.troc));
  $$('#view [data-troc-donne]').forEach(b => b.onclick = () => ouvrirTroc(b.dataset.trocVers, { donne: b.dataset.trocDonne }));
  const nt = $('#nouveauTroc'); if (nt) nt.onclick = () => ouvrirTroc();
  const ev = $('#editerVitrine'); if (ev) ev.onclick = editerVitrine;
  const cl = $('#copierLien'); if (cl) cl.onclick = async () => { const lien = `${location.origin}/#v-${moiJ().login}`; try { await navigator.clipboard.writeText(lien); toast('Lien copié'); } catch { toast(lien); } };
  brancherAtelier();
}
/* recadre une image au centre et la compresse (WebP, sinon JPEG) */
/* ---------- recadreur : on glisse l'image dans un cadre au format de la carte, on zoome, on valide ---------- */
function recadrer(source, L, H){
  return new Promise(fini => {
    const url = source instanceof Blob ? URL.createObjectURL(source) : source, im = new Image();
    const fin = v => { if (source instanceof Blob) URL.revokeObjectURL(url); removeEventListener('keydown', clavier, true); fen?.remove(); fini(v); };
    const clavier = e => { if (e.key === 'Escape'){ e.stopImmediatePropagation(); fin(null); } if (e.key === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); valider(); } };
    let fen, valider;
    im.onerror = () => { toast('Image illisible'); fin(null); };
    im.onload = () => {
      fen = document.createElement('div'); fen.className = 'recadreur';
      fen.innerHTML = `<div class="rc-boite" role="dialog" aria-label="Recadrer l'image"><h2>Recadrer l'image</h2>
        <p class="mut">Glisse l'image pour la placer, zoome avec la molette ou le curseur.</p>
        <div class="rc-cadre" style="aspect-ratio:${L}/${H};width:min(300px,100%,calc(58vh * ${(L / H).toFixed(4)}))"><img alt="" draggable="false"><span class="rc-grille"></span></div>
        <label class="rc-zoom">Zoom<input type="range" step="0.001"></label>
        <div class="row"><button class="btn neon" data-ok>Valider</button><button class="btn" data-entier>Image entière</button><button class="btn" data-rempli>Remplir le cadre</button><button class="btn" data-non style="margin-left:auto">Annuler</button></div></div>`;
      document.body.append(fen); addEventListener('keydown', clavier, true);
      const cadre = fen.querySelector('.rc-cadre'), img = cadre.querySelector('img'), curseur = fen.querySelector('input');
      img.src = url;
      const W = cadre.clientWidth, Hc = cadre.clientHeight, couvre = Math.max(W / im.width, Hc / im.height), contient = Math.min(W / im.width, Hc / im.height);
      let z = couvre, x = 0, y = 0;   /* z : échelle de l'image dans le cadre ; x, y : décalage de son centre */
      curseur.min = contient; curseur.max = couvre * 4;
      const maj = () => {
        z = Math.min(+curseur.max, Math.max(contient, z));
        const w = im.width * z, h = im.height * z, mx = Math.abs(w - W) / 2, my = Math.abs(h - Hc) / 2;
        x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
        img.style.width = `${w}px`; img.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; curseur.value = z;
      };
      maj();
      let glisse = null;
      cadre.onpointerdown = e => { glisse = { px: e.clientX, py: e.clientY, x, y }; cadre.setPointerCapture(e.pointerId); cadre.classList.add('prise'); };
      cadre.onpointermove = e => { if (!glisse) return; x = glisse.x + e.clientX - glisse.px; y = glisse.y + e.clientY - glisse.py; maj(); };
      cadre.onpointerup = cadre.onpointercancel = () => { glisse = null; cadre.classList.remove('prise'); };
      cadre.onwheel = e => { e.preventDefault(); const avant = z; z *= Math.exp(-e.deltaY * .0015); maj(); const k = z / avant; x *= k; y *= k; maj(); };
      curseur.oninput = () => { const k = +curseur.value / z; z = +curseur.value; x *= k; y *= k; maj(); };
      fen.querySelector('[data-entier]').onclick = () => { z = contient; x = y = 0; maj(); };
      fen.querySelector('[data-rempli]').onclick = () => { z = couvre; x = y = 0; maj(); };
      fen.querySelector('[data-non]').onclick = () => fin(null);
      fen.onclick = e => { if (e.target === fen) fin(null); };
      valider = () => {
        const cv = document.createElement('canvas'); cv.width = L; cv.height = H; const g = cv.getContext('2d'), k = L / W;
        g.fillStyle = '#000'; g.fillRect(0, 0, L, H);
        const w = im.width * z * k, h = im.height * z * k; g.drawImage(im, L / 2 + x * k - w / 2, H / 2 + y * k - h / 2, w, h);
        const webp = cv.toDataURL('image/webp', .85); fin(webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/jpeg', .88));
      };
      fen.querySelector('[data-ok]').onclick = valider;
    };
    im.src = url;
  });
}
/* enregistre l'illustration (sans le cadre de la carte) sur l'ordinateur */
async function telecharger(src, nom){
  try {
    const blob = await (await fetch(src)).blob(), ext = ({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' })[blob.type] || 'webp';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${nom}.${ext}`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { toast('Téléchargement impossible'); }
}
/* choisir un fichier puis le recadrer ; le fichier d'origine est gardé pour pouvoir recadrer à nouveau sans perte */
async function choisirImage(input, L, H){
  const f = input.files[0]; input.value = ''; if (!f) return null;
  const image = await recadrer(f, L, H); return image ? { image, source: f } : null;
}
function formBooster(id){
  const b = id ? boosters(true).find(x => x.id === id) : null; let image = null;
  openModal(`<h2>${b ? `Modifier « ${esc(b.nom)} »` : 'Nouveau booster'}</h2>
    <form class="form" id="fBooster">
      <div class="plein depot"><label class="apercu" for="bImg" id="bApercu" style="aspect-ratio:2/3">${b ? `<img src="${esc(b.img)}" alt="">` : 'Choisir l\'image du booster'}</label>
        <div class="pile" style="gap:8px"><label class="champ" for="bImg">Image du booster<input id="bImg" type="file" accept="image/*"><small>Format vertical 2:3, sur fond noir de préférence : le noir devient transparent sur le site.</small></label>${b ? '<div class="row"><button class="btn petit" type="button" id="bRecadrer">Recadrer l\'image actuelle</button><button class="btn petit" type="button" id="bTelecharger">Télécharger l\'image</button></div>' : ''}</div></div>
      <label class="champ plein" for="bNom">Nom<input id="bNom" required maxlength="40" value="${esc(b?.nom || '')}"></label>
      <label class="champ" for="bPrix">Prix en cheveux<input id="bPrix" type="number" min="0" value="${b?.prix ?? 300}"></label>
      <label class="champ" for="bNb">Cartes par booster<input id="bNb" type="number" min="1" max="10" value="${b?.nb ?? 3}"></label>
      <label class="champ" for="bGar">Rareté garantie<select id="bGar"><option value="">Aucune</option>${ORDRE_R.slice(1, 4).map(k => `<option value="${k}" ${b?.garantie === k ? 'selected' : ''}>Au moins 1 ${RARETES[k].nom.toLowerCase()}</option>`).join('')}</select></label>
      <label class="champ" for="bActif">En vente<select id="bActif"><option value="1">Oui</option><option value="0" ${b && !b.actif ? 'selected' : ''}>Non, caché du Salon</option></select></label>
      <label class="plein case" for="bGratuit"><input type="checkbox" id="bGratuit" ${b?.gratuit ? 'checked' : ''}> Booster de présence : gratuit, 1 offert toutes les ${JEU.presence.boosterToutes} minutes passées sur le stream</label>
      <fieldset class="champ plein taux-b"><legend>Pourcentages de ce booster</legend>
        <label class="case" for="bTauxPerso"><input type="checkbox" id="bTauxPerso" ${b?.taux ? 'checked' : ''}> Pourcentages propres à ce booster (sinon ceux de l'onglet Pourcentages)</label>
        <div class="taux-grille" id="bTaux" ${b?.taux ? '' : 'hidden'}>${ORDRE_R.filter(k => k !== 'or').map(k => `<label for="bt-${k}"><span style="color:${RARETES[k].couleur}">${RARETES[k].nom} (%)</span><input id="bt-${k}" data-bt="${k}" type="number" min="0" max="100" step="any" value="${+(((b?.taux || tauxDe(E.cat.reglages))[k] || 0) * 100).toFixed(4)}"></label>`).join('')}<div class="plein" id="btTotal"></div></div>
      </fieldset>
      <div class="row plein"><button class="btn neon" type="submit">${b ? 'Enregistrer' : 'Créer le booster'}</button><button class="btn" type="button" data-close>Annuler</button>${b ? '<button class="btn danger" type="button" id="bSuppr" style="margin-left:auto">Supprimer</button>' : ''}</div>
    </form>`);
  const bs = $('#bSuppr'); if (bs) bs.onclick = () => confirmer(bs, async () => { await api('admin-booster-supprimer', { id }); closeModal(); toast('Booster supprimé'); });
  let sourceB = null;
  $('#bImg').onchange = async e => { const r = await choisirImage(e.target, 640, 960); if (!r) return; ({ image, source: sourceB } = r); $('#bApercu').innerHTML = `<img src="${image}" alt="Aperçu">`; };
  const tb = $('#bTelecharger'); if (tb) tb.onclick = () => occupe(tb, () => telecharger(image || b.img, `booster-${id}`));
  const rb = $('#bRecadrer'); if (rb) rb.onclick = async () => { const r = await recadrer(sourceB || b.img, 640, 960); if (r){ image = r; $('#bApercu').innerHTML = `<img src="${image}" alt="Aperçu">`; } };
  const totalB = () => { const v = $$('#bTaux [data-bt]').reduce((s, i) => s + (Number(i.value.replace(',', '.')) || 0), 0), ok = Math.abs(v - 100) < .001;
    $('#btTotal').innerHTML = `Total : <b>${pct(v)} %</b> ${ok ? '<span style="color:var(--ok)">✓</span>' : '<span style="color:var(--ko)">il faut 100 %</span>'}`; return ok; };
  totalB(); $('#bTaux').oninput = totalB;
  $('#bTauxPerso').onchange = e => { $('#bTaux').hidden = !e.target.checked; };
  const majGratuit = () => { $('#bPrix').disabled = $('#bGratuit').checked; }; majGratuit(); $('#bGratuit').onchange = majGratuit;
  $('#fBooster').onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => {
    const perso = $('#bTauxPerso').checked; if (perso && !totalB()) throw toast('Les pourcentages du booster doivent faire 100 %');
    const r = await api('admin-booster', { id, nom: $('#bNom').value, prix: +$('#bPrix').value, nb: +$('#bNb').value, garantie: $('#bGar').value, actif: $('#bActif').value === '1', image,
      gratuit: $('#bGratuit').checked, taux: perso ? Object.fromEntries($$('#bTaux [data-bt]').map(i => [i.dataset.bt, i.value])) : null });
    closeModal(); toast(b ? 'Booster enregistré' : 'Booster créé : choisis maintenant ses cartes'); if (!b) setTimeout(() => cartesBooster(r.id), 400); }); };
}
function cartesBooster(id){
  const b = boosters(true).find(x => x.id === id); if (!b) return;
  const dedans = new Set(b.chauves), tous = chauves(true).sort((x, y) => ORDRE_R.indexOf(x.rarete) - ORDRE_R.indexOf(y.rarete));
  openModal(`<h2>Les cartes de « ${esc(b.nom)} »</h2><p class="mut">Coche les chauves que ce booster peut contenir. <span id="bCompte"></span></p>
    <form id="fBoCartes" class="pile" style="gap:16px">
      <div class="row"><button class="btn petit" type="button" id="bTout">Tout cocher</button><button class="btn petit" type="button" id="bRien">Tout décocher</button></div>
      <div class="cartes petites">${tous.map(c => `<label class="choix"><input type="checkbox" name="c" value="${c.id}" ${dedans.has(c.id) ? 'checked' : ''}>${carte(c, { forcer: true, tabindex: -1 })}</label>`).join('')}</div>
      <div class="row"><button class="btn neon" type="submit">Enregistrer</button><button class="btn" type="button" data-close>Annuler</button></div></form>`);
  $('#modalIn').style.maxWidth = '980px';
  const coches = () => $$('#fBoCartes input[name="c"]'), compte = () => { $('#bCompte').textContent = `${coches().filter(i => i.checked).length} sur ${tous.length} cochés.`; };
  compte(); $('#fBoCartes').onchange = compte;
  $('#bTout').onclick = () => { coches().forEach(i => i.checked = true); compte(); };
  $('#bRien').onclick = () => { coches().forEach(i => i.checked = false); compte(); };
  $('#fBoCartes').onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => { const r = await api('admin-booster-cartes', { id, chauves: coches().filter(i => i.checked).map(i => i.value) }); closeModal(); toast(`${r.nb} carte${r.nb > 1 ? 's' : ''} dans ${b.nom}`); }); };
}
/* un bouton dangereux demande un second clic avant d'agir */
function confirmer(b, action){
  if (b.dataset.sur !== '1'){ b.dataset.sur = '1'; b.dataset.texte = b.textContent; b.textContent = 'Sûr ? Clique encore'; b._t = setTimeout(() => { b.dataset.sur = ''; b.textContent = b.dataset.texte; }, 3500); return; }
  clearTimeout(b._t); b.dataset.sur = ''; b.textContent = b.dataset.texte;
  occupe(b, action);
}
const TEXTES = [['nom', 'Nom'], ['rar', 'Rareté'], ['coll', 'Collection']];
const sansCoches = () => $$('#fModif input[name="mTxt"]').filter(i => !i.checked).map(i => i.value);
function formChauve(id){
  const c = chauves(true).find(x => x.id === id); if (!c) return;
  let image = null; const emis = E.emis[c.id] || 0, dans = new Set(boosters(true).filter(b => b.chauves.includes(id)).map(b => b.id));
  openModal(`<h2>Modifier « ${esc(c.nom)} »</h2>
    <div class="edition">
      <div class="apercu-carte"><div id="mApercu"></div><label class="mut" style="font-size:13px;display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px"><input type="checkbox" id="mVoirChrome"> Voir en Chromé</label></div>
      <form class="form" id="fModif">
        <div class="champ plein"><label for="mImg">Illustration</label><div class="row"><input id="mImg" type="file" accept="image/*" style="flex:1 1 220px"><button class="btn petit" type="button" id="mRecadrer">Recadrer l'image actuelle</button><button class="btn petit" type="button" id="mTelecharger">Télécharger l'image</button></div><small>Une nouvelle image s'ouvre dans le recadreur. Laisse vide pour garder l'actuelle.</small></div>
        <label class="champ plein" for="mNom">Nom<input id="mNom" required maxlength="40" value="${esc(c.nom)}"></label>
        <label class="champ" for="mRar">Rareté<select id="mRar">${ORDRE_R.map(k => `<option value="${k}" ${c.rarete === k ? 'selected' : ''}>${RARETES[k].nom}</option>`).join('')}</select></label>
        <label class="champ" for="mTirage">Tirage maximum<input id="mTirage" type="number" min="${Math.max(1, emis)}" value="${c.tirage || RARETES[c.rarete].tirage}" ${c.illimite ? 'disabled' : ''}><small>${emis} déjà tiré${emis > 1 ? 's' : ''}.</small><span style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="mIllimite" ${c.illimite ? 'checked' : ''}> Illimité</span></label>
        <label class="champ plein or-seul" for="mPct" ${estOr(c) ? '' : 'hidden'}>Chance de tirage du Crâne d'or<span class="row" style="gap:8px;align-items:center"><input id="mPct" type="number" min="0" max="100" step="any" value="${+(chanceOr(c) * 100).toFixed(4)}" style="width:140px"> % par carte tirée</span><small>Lié au compte du gagnant.</small></label>
        <label class="champ plein or-seul" for="mSaison" ${estOr(c) ? '' : 'hidden'}>Saison<input id="mSaison" maxlength="40" value="${esc(c.saison || '')}" placeholder="ex. Saison 1"><small>Un seul Crâne d'or par joueur et par saison.</small></label>
        <label class="champ" for="mColl">Collection<select id="mColl">${collections().map(k => `<option value="${k.id}" ${c.coll === k.id ? 'selected' : ''}>${esc(k.nom)}</option>`).join('')}<option value="" class="or-seul" ${estOr(c) ? '' : 'hidden'} ${estOr(c) && !c.coll ? 'selected' : ''}>Aucune collection</option></select></label>
        <label class="champ" for="mCadre">Bord de carte<select id="mCadre"><option value="">Automatique (suit la rareté)</option>${ORDRE_R.map(k => `<option value="${k}" ${c.cadre === k ? 'selected' : ''}>Bord ${RARETES[k].nom.toLowerCase()}</option>`).join('')}</select></label>
        <div class="champ plein">Couleur du bord
          <div class="row"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mCoulPerso" ${c.couleur ? 'checked' : ''}> Couleur personnalisée</label><input type="color" id="mCoul" value="${esc(c.couleur || RARETES[c.rarete].couleur || '#ff7a18')}" aria-label="Couleur du bord"></div>
          <small>Sans couleur personnalisée, le bord prend la couleur de sa rareté.</small></div>
        <fieldset class="champ plein coches"><legend>Textes affichés sur la carte</legend>${TEXTES.map(([k, t]) => `<label><input type="checkbox" name="mTxt" value="${k}" ${(c.sans || []).includes(k) ? '' : 'checked'}> ${t}</label>`).join('')}<button class="btn petit" type="button" id="mSansTexte">Tout enlever</button></fieldset>
        <label class="champ plein" for="mDesc">Description<textarea id="mDesc" maxlength="160">${esc(c.desc || '')}</textarea></label>
        <fieldset class="champ plein coches"><legend>Dans les boosters</legend>${boosters(true).map(b => `<label><input type="checkbox" name="mBo" value="${b.id}" ${dans.has(b.id) ? 'checked' : ''}> ${esc(b.nom)}</label>`).join('') || '<span class="mut">Aucun booster.</span>'}</fieldset>
        <label class="plein" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mRetire" ${c.retire ? 'checked' : ''}> Retiré : caché du Chauvedex et plus jamais tiré</label>
        <p class="plein avert" id="mAvert" hidden></p>
        <div class="row plein"><button class="btn neon" type="submit">Enregistrer</button><button class="btn" type="button" data-close>Annuler</button><button class="btn danger" type="button" id="mSuppr" style="margin-left:auto">Supprimer</button></div>
      </form>
    </div>`);
  $('#modalIn').style.maxWidth = '900px';
  const apercu = () => { const r = $('#mRar').value; $('#mApercu').innerHTML = carteHTML({ img: image || c.img, nom: $('#mNom').value || '…', rarete: r, cadre: $('#mCadre').value, couleur: $('#mCoulPerso').checked ? $('#mCoul').value : '', sans: sansCoches(), coll: E.cat.collections[$('#mColl').value]?.nom, droite: '', chrome: $('#mVoirChrome').checked }); };
  $('#mIllimite').onchange = () => { $('#mTirage').disabled = $('#mIllimite').checked; apercu(); };
  $('#mSansTexte').onclick = () => { $$('#fModif input[name="mTxt"]').forEach(i => i.checked = false); apercu(); };
  apercu(); $('#fModif').oninput = apercu; $('#mVoirChrome').onchange = apercu;
  $('#mRar').onchange = () => { if (!emis || RARETES[$('#mRar').value].tirage >= emis) $('#mTirage').value = RARETES[$('#mRar').value].tirage; const o = $('#mRar').value === 'or'; $$('#fModif .or-seul').forEach(e => e.hidden = !o); if (!o && !$('#mColl').value) $('#mColl').selectedIndex = 0; if (o){ $('#mIllimite').checked = false; $('#mTirage').disabled = false; } $('#mIllimite').closest('span').hidden = o; apercu(); };
  $('#mCoul').oninput = () => { $('#mCoulPerso').checked = true; apercu(); };
  let sourceM = null;
  $('#mImg').onchange = async e => { const r = await choisirImage(e.target, 600, 1066); if (r){ ({ image, source: sourceM } = r); apercu(); } };
  $('#mTelecharger').onclick = e => occupe(e.currentTarget, () => telecharger(image || c.img, c.id));
  $('#mRecadrer').onclick = async () => { const r = await recadrer(sourceM || c.img, 600, 1066); if (r){ image = r; apercu(); } };
  $('#fModif').onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => {
    await api('admin-chauve-modifier', { id, nom: $('#mNom').value, rarete: $('#mRar').value, tirage: +$('#mTirage').value, illimite: $('#mIllimite').checked, pct: $('#mRar').value === 'or' ? $('#mPct').value : undefined, saison: $('#mRar').value === 'or' ? $('#mSaison').value : undefined, sans: sansCoches(), coll: $('#mColl').value, cadre: $('#mCadre').value, couleur: $('#mCoulPerso').checked ? $('#mCoul').value : '', desc: $('#mDesc').value, boosters: $$('#fModif input[name="mBo"]:checked').map(i => i.value), retire: $('#mRetire').checked, image: image || undefined });
    closeModal(); toast(`${$('#mNom').value} est à jour`); }); };
  const sup = $('#mSuppr'); let force = false;
  sup.onclick = () => confirmer(sup, async () => {
    const r = await fetch('/api/admin-chauve-supprimer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, force }) }), d = await r.json().catch(() => ({}));
    if (r.status === 409){ force = true; $('#mAvert').hidden = false; $('#mAvert').textContent = `${d.erreur.split(' :')[0]}. Si tu supprimes quand même, ces exemplaires sont détruits, leurs propriétaires reçoivent la cote de la carte en cheveux et les enchères en cours sur elle sont annulées.`; sup.textContent = 'Supprimer quand même'; return; }
    if (!r.ok || d.erreur) return toast(d.erreur || 'Erreur');
    closeModal(); toast(d.detruits ? `Chauve supprimé, ${d.detruits} exemplaire${d.detruits > 1 ? 's' : ''} dédommagé${d.detruits > 1 ? 's' : ''}` : 'Chauve supprimé'); });
}
function formCollection(id){
  const c = E.cat.collections[id]; if (!c) return; const n = chauves(true).filter(x => x.coll === id).length;
  openModal(`<h2>Modifier « ${esc(c.nom)} »</h2>
    <form class="form" id="fCoModif">
      <label class="champ plein" for="kNom">Nom<input id="kNom" required maxlength="40" value="${esc(c.nom)}"></label>
      <label class="champ plein" for="kDesc">Description<input id="kDesc" maxlength="120" value="${esc(c.desc || '')}"></label>
      <label class="champ" for="kGain">Récompense<input id="kGain" type="number" min="0" value="${c.gain || 0}"></label>
      <div class="row plein"><button class="btn neon" type="submit">Enregistrer</button><button class="btn" type="button" data-close>Annuler</button><button class="btn danger" type="button" id="kSuppr" style="margin-left:auto" ${n ? `disabled title="Déplace d'abord ses ${n} chauves"` : ''}>Supprimer</button></div>
    </form>`);
  $('#fCoModif').onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => { await api('admin-collection-modifier', { id, nom: $('#kNom').value, desc: $('#kDesc').value, gain: +$('#kGain').value }); closeModal(); toast('Collection enregistrée'); }); };
  const sup = $('#kSuppr'); sup.onclick = () => confirmer(sup, async () => { await api('admin-collection-supprimer', { id }); closeModal(); toast('Collection supprimée'); });
}
/* la grille des cartes de l'Atelier : filtrée et triée sans redessiner la page, pour garder le curseur dans la recherche */
function grilleAtelier(){
  const g = $('#fcGrille'); if (!g) return;
  const q = filtreA.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), bos = boosters(true);
  const tris = { recent: (a, b) => (b.ordre || 0) - (a.ordre || 0), ancien: (a, b) => (a.ordre || 0) - (b.ordre || 0), nom: (a, b) => a.nom.localeCompare(b.nom, 'fr'), rarete: (a, b) => ORDRE_R.indexOf(b.rarete) - ORDRE_R.indexOf(a.rarete) || a.nom.localeCompare(b.nom, 'fr') };
  const liste = chauves(true).filter(c => (!q || c.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)) && (!filtreA.rar || c.rarete === filtreA.rar) && (!filtreA.coll || c.coll === filtreA.coll)
    && (!filtreA.bo || (filtreA.bo === '-' ? !bos.some(b => b.chauves.includes(c.id)) : bos.find(b => b.id === filtreA.bo)?.chauves.includes(c.id)))).sort(tris[filtreA.tri] || tris.recent);
  g.innerHTML = liste.map(c => `<button class="carte carte-atelier" data-ch-modif="${c.id}" style="${c.retire ? 'opacity:.45' : ''}" title="Modifier ${esc(c.nom)}">${carteHTML({ img: c.img, nom: c.nom, rarete: c.rarete, cadre: c.cadre, couleur: c.couleur, sans: c.sans, coll: E.cat.collections[c.coll]?.nom, droite: '' })}<span class="legende">${esc(c.nom)} · ${fmt(E.emis[c.id])}/${tMax(c)}${c.retire ? ' · retiré' : ''}</span></button>`).join('');
  $('#fcVide').hidden = liste.length > 0; $('#fcCompte').textContent = `${liste.length} carte${liste.length > 1 ? 's' : ''}`;
  $$('#fcGrille [data-ch-modif]').forEach(b => b.onclick = () => formChauve(b.dataset.chModif));
}
function brancherAtelier(){
  const fm = $('#fMaint');
  if (fm){ fm.onsubmit = e => { e.preventDefault(); const deja = !!E.maintenance?.actif; occupe(e.submitter, async () => { await api('admin-maintenance', { actif: true, message: $('#mMsg').value }); delete fm.dataset.brouillon; toast(deja ? 'Message mis à jour' : 'Maintenance activée : toi seul vois le site'); render(); }); };
    const off = fm.querySelector('[data-maint="off"]'); if (off) off.onclick = () => occupe(off, async () => { const r = await api('admin-maintenance', { actif: false }); delete fm.dataset.brouillon; toast(`Le Salon est rouvert${r.prolongees ? ` : ${r.prolongees} enchère${r.prolongees > 1 ? 's' : ''} prolongée${r.prolongees > 1 ? 's' : ''}` : ''}`); render(); }); }
  $$('[data-zero]').forEach(b => b.onclick = () => {
    const mode = b.dataset.zero, cible = mode === 'joueur' ? $('#zJoueur').value : mode;
    if (!cible) return toast('Choisis d\'abord un joueur');
    const qui = mode === 'tout' ? 'tout le jeu' : mode === 'moi' ? 'ton compte' : `le compte de ${esc(E.joueurs[cible]?.nom || '')}`;
    openModal(`<h2>Remettre ${qui} à zéro ?</h2><p>C'est définitif, il n'y a pas de retour en arrière.${mode === 'tout' ? ' <b>Tous les joueurs perdent toutes leurs cartes.</b>' : ''}</p>
      <label class="champ" for="zConf">Pour confirmer, écris <b>REMISE A ZERO</b><input id="zConf" autocomplete="off"></label>
      <div class="row" style="margin-top:16px"><button class="btn danger" id="zOk" disabled>Remettre à zéro</button><button class="btn" data-close>Annuler</button></div>`);
    const conf = $('#zConf'), ok = $('#zOk'), bon = () => conf.value.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'REMISE A ZERO';
    conf.oninput = () => { ok.disabled = !bon(); }; conf.focus();
    ok.onclick = e => occupe(e.currentTarget, async () => { const r = await api('admin-reset', { cible, confirmation: conf.value }); closeModal(); E.vitrines = {};
      toast(mode === 'tout' ? `Le jeu repart de zéro (${r.joueurs} joueurs)` : `Compte remis à zéro (${r.copies} chauve${r.copies > 1 ? 's' : ''} effacé${r.copies > 1 ? 's' : ''})`); });
  });
  const fb = $('#fBroyeur');
  if (fb){ fb.onsubmit = e => { e.preventDefault(); const lire = a => Object.fromEntries($$(`#fBroyeur [${a}]`).map(i => [i.getAttribute(a), i.value === '' ? '' : +i.value]));
      occupe(e.submitter, async () => { await api('admin-broyeur', { gain: lire('data-bg'), prix: lire('data-bp'), chrome: +$('#bChrome').value }); delete fb.dataset.brouillon; toast('Broyeur enregistré'); render(); }); };
    $('#bDefaut').onclick = () => { $$('#fBroyeur [data-bg]').forEach(i => i.value = JEU.broyeur.gain[i.dataset.bg] ?? 0); $$('#fBroyeur [data-bp]').forEach(i => i.value = JEU.broyeur.prix[i.dataset.bp] ?? ''); $('#bChrome').value = JEU.broyeur.chrome; fb.dataset.brouillon = '1'; }; }
  const fa = $('#fAlertes');
  if (fa) fa.onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => { await api('admin-alertes', { min: $('#alMin').value, chrome: $('#alChrome').value }); delete fa.dataset.brouillon; toast('Alertes enregistrées'); render(); }); };
  const st = $('#stEtat');
  if (st){ const charger = async n => { const d = await api('admin-presence', { nouvelleCle: !!n }), lien = `${location.origin}/overlay.html?bandeau=1&cle=${d.cle}`;
      st.innerHTML = `<div class="pile" style="gap:16px">
        <div><div class="etiq">1. Autoriser la lecture du chat</div><p class="mut" style="margin:6px 0 10px">${d.twitch ? `Connecté avec la chaîne <b>${esc(d.twitch.login)}</b>.` : 'Pas encore autorisé.'}</p><a class="btn ${d.twitch ? '' : 'neon'}" href="/api/login?presence=1">${d.twitch ? 'Autoriser à nouveau' : 'Autoriser avec Twitch'}</a></div>
        <div><div class="etiq">2. L'adresse de l'overlay dans OBS</div><p class="mut" style="margin:6px 0 10px">Remplace l'adresse de ta source navigateur par celle-ci. Garde-la secrète : ne l'affiche pas en stream.</p>
          <div class="row" style="flex-wrap:nowrap"><input id="stLien" readonly value="${esc(lien)}" style="flex:1;min-width:0"><button class="btn" type="button" id="stCopier">Copier</button></div>
          <button class="btn petit" type="button" id="stNouvelle" style="margin-top:10px">Changer la clé</button></div>
        <div><div class="etiq">3. Dernier relevé</div><p class="mut" style="margin:6px 0 0">${d.dernier ? `${ilya(d.dernier)} : ${d.spectateurs} dans le chat, ${d.credites} joueur${d.credites > 1 ? 's' : ''} crédité${d.credites > 1 ? 's' : ''}.` : 'Aucun pour l\'instant.'}</p></div></div>`;
      $('#stCopier').onclick = async () => { try { await navigator.clipboard.writeText(lien); toast('Adresse copiée'); } catch { $('#stLien').select(); } };
      $('#stNouvelle').onclick = e => confirmer(e.currentTarget, () => charger(true)); };
    charger().catch(() => { st.textContent = 'Impossible de charger les réglages.'; }); }
  const ft = $('#fTaux');
  if (ft){ const total = () => { const v = $$('#fTaux [data-taux]').reduce((s, i) => s + (Number(i.value.replace(',', '.')) || 0), 0), ok = Math.abs(v - 100) < .001;
      $('#tTotal').innerHTML = `Total : <b>${pct(v)} %</b> ${ok ? '<span style="color:var(--ok)">✓</span>' : `<span style="color:var(--ko)">il faut 100 % (${v > 100 ? 'trop' : 'manque'} ${pct(Math.abs(100 - v))} %)</span>`}`; $('#fTaux button[type=submit]').disabled = !ok; };
    total(); ft.oninput = total;
    $('#tDefaut').onclick = () => { $$('#fTaux [data-taux]').forEach(i => i.value = +(RARETES[i.dataset.taux].taux * 100).toFixed(4)); $('#tChrome').value = JEU.tauxChrome * 100; total(); };
    ft.onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => { await api('admin-reglages', { taux: Object.fromEntries($$('#fTaux [data-taux]').map(i => [i.dataset.taux, i.value])), chrome: $('#tChrome').value }); delete ft.dataset.brouillon; toast('Pourcentages enregistrés'); }); }; }
  $$('[data-oa]').forEach(b => b.onclick = () => { ongletA = b.dataset.oa; render(); });
  [['fcQ', 'q', 'oninput'], ['fcRar', 'rar', 'onchange'], ['fcColl', 'coll', 'onchange'], ['fcBo', 'bo', 'onchange'], ['fcTri', 'tri', 'onchange']].forEach(([id, k, ev]) => { const el = $('#' + id); if (el) el[ev] = () => { filtreA[k] = el.value; grilleAtelier(); }; });
  grilleAtelier();
  $$('[data-ch-modif]').forEach(b => b.onclick = () => formChauve(b.dataset.chModif));
  $$('[data-co-modif]').forEach(b => b.onclick = () => formCollection(b.dataset.coModif));
  const nb = $('#nouveauBooster'); if (nb) nb.onclick = () => formBooster();
  $$('[data-bo-modif]').forEach(b => b.onclick = () => formBooster(b.dataset.boModif));
  $$('[data-bo-cartes]').forEach(b => b.onclick = () => cartesBooster(b.dataset.boCartes));
  const ini = $('#initCat'); if (ini) ini.onclick = () => occupe(ini, async () => { await api('admin-init'); toast('Catalogue semé'); });
  let image = null;
  let sourceA = null;
  const fi = $('#aImg'); if (fi) fi.onchange = async () => { const r = await choisirImage(fi, 600, 1066); if (!r) return; ({ image, source: sourceA } = r); $('#aApercu').innerHTML = `<img src="${image}" alt="Aperçu">`; $('#fChauve').dataset.brouillon = '1'; };
  const ap = $('#aApercu'); if (ap) ap.onclick = async e => { if (!sourceA) return; e.preventDefault(); const r = await recadrer(sourceA, 600, 1066); if (r){ image = r; $('#aApercu').innerHTML = `<img src="${image}" alt="Aperçu">`; } };
  const ai = $('#aIllimite'); if (ai) ai.onchange = () => { $('#aTirage').disabled = ai.checked; };
  const ar = $('#aRar'); if (ar) ar.onchange = () => { $('#aTirage').value = RARETES[ar.value].tirage; const o = ar.value === 'or'; $$('#fChauve .or-seul').forEach(e => e.hidden = !o); if (o) $('#aColl').value = ''; else if (!$('#aColl').value) $('#aColl').selectedIndex = 0; $('#aIllimite').closest('span').hidden = o; if (o){ $('#aIllimite').checked = false; $('#aTirage').disabled = false; } };
  const fch = $('#fChauve'); if (fch) fch.onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => {
    const r = await api('admin-chauve', { nom: $('#aNom').value, coll: $('#aColl').value, rarete: $('#aRar').value, tirage: +$('#aTirage').value, illimite: $('#aIllimite').checked, pct: $('#aRar').value === 'or' ? $('#aPct').value : undefined, saison: $('#aRar').value === 'or' ? $('#aSaison').value || boosters(true).find(b => b.id === $('#aBooster').value)?.nom || '' : undefined, desc: $('#aDesc').value, booster: $('#aBooster').value, image });
    toast(`${$('#aNom').value} rejoint le catalogue`); fch.reset(); $('#aTirage').disabled = false; sourceA = null; delete fch.dataset.brouillon; ongletA = 'cartes'; filtreA.tri = 'recent'; planifier(); $('#aApercu').textContent = 'Choisir une illustration'; image = null; return r; }); };
  const fco = $('#fColl'); if (fco) fco.onsubmit = e => { e.preventDefault(); occupe(e.submitter, async () => { await api('admin-collection', { nom: $('#cNom').value, desc: $('#cDesc').value, gain: +$('#cGain').value }); fco.reset(); delete fco.dataset.brouillon; planifier(); toast('Collection créée'); }); };
  $$('[data-retirer]').forEach(b => b.onclick = () => occupe(b, async () => { await api('admin-retirer', { id: b.dataset.retirer, retire: b.dataset.etat === '1' }); }));
}

/* =========================================================
   ALERTES (surenchères, ventes, échanges)
   ========================================================= */
const vues = new Set();
let premiereLecture = true;
function alerter(n){
  const div = document.createElement('div'); div.className = n.type; div.textContent = n.texte;
  $('#alertes').appendChild(div); setTimeout(() => div.remove(), 7000);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('La Chauverie', { body: n.texte, icon: '/img/logo.webp' });
}
function surNotifs(d){
  E.notifs = d;
  for (const [k, n] of Object.entries(d)){ if (vues.has(k)) continue; vues.add(k); if (!premiereLecture && !n.lu && n.t > DEMARRAGE - 5000) alerter(n); }
  premiereLecture = false;
  if (!$('#panneau').hidden) remplirPanneau();
  majTop();
}
function basculerPanneau(){ const p = $('#panneau'); p.hidden = !p.hidden; if (!p.hidden) remplirPanneau(); }
function remplirPanneau(){
  const liste = Object.entries(E.notifs).sort((a, b) => b[1].t - a[1].t), perm = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#panneau').innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><h3>Alertes</h3><button class="btn petit" id="toutLu">Tout marquer lu</button></div>
    ${perm === 'default' ? '<button class="btn petit neon" id="permNotif" style="margin-bottom:10px">Recevoir les alertes même dans un autre onglet</button>' : ''}
    ${liste.map(([, n]) => `<div class="notif ${n.lu ? '' : 'nonlu'}"><span>${esc(n.texte)}</span><span class="t">${ilya(n.t)}</span></div>`).join('') || '<div class="vide">Aucune alerte pour l\'instant.</div>'}`;
  $('#toutLu').onclick = () => api('notifs-lues');
  const pn = $('#permNotif'); if (pn) pn.onclick = async () => { await Notification.requestPermission(); remplirPanneau(); };
}
document.addEventListener('click', e => { const p = $('#panneau'); if (!p.hidden && !p.contains(e.target) && !e.target.closest('#cloche')) p.hidden = true; });

/* =========================================================
   OUVERTURE D'UN BOOSTER
   ========================================================= */
const TONTE = { actif: false, passer: false };   /* état de l'ouverture en cours */
const attendre = ms => new Promise(r => { const t0 = performance.now(); (function tic(){ if (TONTE.passer || performance.now() - t0 >= ms) r(); else requestAnimationFrame(tic); })(); });
const pause = ms => new Promise(r => setTimeout(r, ms));
/* la déchirure : une ligne en dents de scie, partagée par le haut et le bas du sachet */
function dechirure(){
  const pts = []; for (let i = 0; i <= 16; i++) pts.push([i / 16 * 100, 11 + (i % 2 ? 2.2 : 0) + Math.random() * 1.2]);
  const ligne = pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(',');
  return { haut: `polygon(0 0,100% 0,${[...pts].reverse().map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(',')})`, bas: `polygon(${ligne},100% 100%,0 100%)` };
}

/* ---------- particules (étincelles, confettis) sur un canvas plein écran ---------- */
const FX = { p: [], raf: 0 };
function fxBoucle(){
  const cv = $('#fxCanvas'); if (!cv){ FX.p = []; FX.raf = 0; return; }
  const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  FX.p = FX.p.filter(q => q.vie > 0);
  for (const q of FX.p){
    q.x += q.vx; q.y += q.vy; q.vy += q.g; q.vx *= .985; q.vie -= 1; q.rot += q.vr;
    g.save(); g.globalAlpha = Math.min(1, q.vie / 25); g.translate(q.x, q.y); g.rotate(q.rot); g.fillStyle = q.c;
    if (q.rond){ g.shadowColor = q.c; g.shadowBlur = 12; g.beginPath(); g.arc(0, 0, q.t, 0, 7); g.fill(); } else g.fillRect(-q.t, -q.t * .5, q.t * 2, q.t);
    g.restore();
  }
  FX.raf = FX.p.length ? requestAnimationFrame(fxBoucle) : 0;
}
function fxLancer(){ if (!FX.raf) FX.raf = requestAnimationFrame(fxBoucle); }
/* gerbe : n particules depuis (x, y) */
function gerbe(x, y, n, couleurs, o = {}){
  const cv = $('#fxCanvas'); if (!cv) return; cv.width = innerWidth; cv.height = innerHeight;
  for (let i = 0; i < n; i++){ const a = rnd(0, Math.PI * 2), v = rnd(o.vmin ?? 3, o.vmax ?? 14);
    FX.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.haut ?? 2), g: o.g ?? .22, vie: rnd(40, o.vie ?? 90), t: rnd(2, o.t ?? 5), c: pick(couleurs), rond: o.rond ?? Math.random() < .5, rot: rnd(0, 6), vr: rnd(-.3, .3) }); }
  fxLancer();
}
/* pluie de confettis depuis le haut de l'écran */
function pluie(n, couleurs){
  const cv = $('#fxCanvas'); if (!cv) return; cv.width = innerWidth; cv.height = innerHeight;
  for (let i = 0; i < n; i++) FX.p.push({ x: rnd(0, innerWidth), y: rnd(-innerHeight * .6, -10), vx: rnd(-2, 2), vy: rnd(2, 7), g: .05, vie: rnd(120, 240), t: rnd(3, 7), c: pick(couleurs), rond: false, rot: rnd(0, 6), vr: rnd(-.25, .25) });
  fxLancer();
}

/* 1. le booster arrive et tremble  2. il se déchire  3. les cartes sortent, face cachée
   4. elles se retournent une à une, de la moins rare à la plus rare, avec une mise en scène selon la rareté */
async function ouvrirBooster(b, tirages){
  const salon = $('#salon'), d = dechirure(), img = b?.img || '/img/booster-saison-1.webp';
  const force = x => ORDRE_R.indexOf(chauve(x.id).rarete) * 2 + (x.chrome ? 1 : 0);
  tirages = [...tirages].sort((x, y) => force(x) - force(y));
  const n = tirages.length;
  salon.innerHTML = `<canvas id="fxCanvas"></canvas><div class="voile-fx" id="voileFx"></div>
    <h2 style="margin:0" id="tTitre">${esc(b?.nom || 'Booster')}</h2>
    <div class="scene-b" id="sceneB">
      <div class="halo"></div>
      <div class="sachet" id="sachet"><span class="bas" style="background-image:url('${esc(img)}');clip-path:${d.bas}"></span><span class="haut" style="background-image:url('${esc(img)}');clip-path:${d.haut}"></span><span class="eclair"></span></div>
      <div class="eclats">${Array.from({ length: 18 }, () => `<i style="--a:${Math.round(rnd(-80, 80))}deg;--d:${Math.round(rnd(90, 260))}px;--t:${rnd(.5, 1).toFixed(2)}s;background:${pick(['#ff7b1c', '#ff4f8b', '#b64dff', '#fff'])}"></i>`).join('')}</div>
    </div>
    <div class="etal" id="etal" hidden>${tirages.map((x, i) => `<button class="fente r-${chauve(x.id).rarete}" id="f${i}" style="--w:${n > 3 ? 'clamp(96px,17vw,176px)' : 'clamp(110px,26vw,230px)'};--i:${i}" aria-label="Retourner la carte ${i + 1}">
      <span class="pivot"><span class="face dos"><img src="/img/dos-carte.webp" alt=""></span><span class="face recto">${carteCopie(x)}</span></span></button>`).join('')}</div>
    <div class="row" id="tBoutons"><button class="btn" id="tPasser">Passer</button><button class="btn neon" id="tFin" hidden>Ranger dans ma collection</button></div>`;
  salon.classList.add('ouvert'); TONTE.actif = true; TONTE.passer = false;
  $('#tPasser').onclick = () => { TONTE.passer = true; };
  $('#tFin').onclick = () => { salon.classList.remove('ouvert', 'secousse', 'chaos'); salon.innerHTML = ''; TONTE.actif = false; planifier(); };
  const scene = $('#sceneB');
  await attendre(700);  scene.classList.add('tremble');
  await attendre(1100); scene.classList.replace('tremble', 'craque');
  await attendre(750);  scene.classList.add('vide');
  await attendre(350);
  scene.remove(); $('#tTitre').textContent = `${n} carte${n > 1 ? 's' : ''}`;
  $('#etal').hidden = false; $('#etal').classList.add('sort');
  await attendre(450 + n * 90);
  TONTE.passer = false; $('#tPasser').textContent = 'Tout retourner';
  for (let i = 0; i < n; i++) await retourner($(`#f${i}`), tirages[i]);
  $('#tPasser').hidden = true; $('#tFin').hidden = false; $('#tFin').focus();
  if (succesPrets()) toast('Un succès est prêt à être récupéré');
}
const centre = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
async function retourner(fente, copie){
  const rar = chauve(copie.id).rarete, [x, y] = centre(fente), coul = RARETES[rar].couleur;
  /* « Tout retourner » accélère les cartes ordinaires, jamais un légendaire ni un unique */
  if (rar === 'or') return revelerUnique(fente, copie, true);
  if (rar === 'unique') return revelerUnique(fente, copie);
  if (rar === 'legendaire') return revelerLegendaire(fente, copie);
  fente.classList.add('revele');
  if (!TONTE.passer){
    if (copie.chrome){
      /* un Chromé : éclat prismatique et annonce, quelle que soit la rareté */
      const PRISME = ['#e8fbff', '#8fe3ff', '#ff9bd2', '#fff38a', '#b9a4ff', '#fff'];
      fente.classList.add('vedette');
      setTimeout(() => { gerbe(x, y, 120, PRISME, { vmax: 17, vie: 110, rond: true }); annonceRarete('Chromé', 'chrome'); }, 230);
      await attendre(2100); fente.classList.remove('vedette');
    } else {
      if (rar !== 'commun') setTimeout(() => gerbe(x, y, rar === 'epique' ? 46 : 26, [coul, '#fff'], { rond: true, vmax: rar === 'epique' ? 13 : 9 }), 230);
      await attendre(rar === 'commun' ? 520 : rar === 'rare' ? 800 : 1100);
    }
  }
}
/* LÉGENDAIRE : la carte tremble et s'embrase, l'écran s'assombrit, explosion dorée */
async function revelerLegendaire(fente, copie){
  const salon = $('#salon'), voile = $('#voileFx'), OR = ['#ffc85a', '#fff3cc', '#ff9a1c', '#fff'];
  voile.className = 'voile-fx or'; fente.classList.add('vedette', 'charge');
  const [x, y] = centre(fente);
  const braises = setInterval(() => gerbe(x + rnd(-60, 60), y + rnd(20, 90), 3, OR, { vmin: 1, vmax: 4, haut: 5, g: -.04, vie: 60, rond: true, t: 3 }), 60);
  await pause(1400); clearInterval(braises);
  voile.classList.add('flash'); salon.classList.add('secousse');
  fente.classList.remove('charge'); fente.classList.add('revele', 'rayons');
  gerbe(x, y, 150, OR, { vmax: 20, vie: 120, t: 6 }); setTimeout(() => gerbe(x, y, 80, OR, { vmax: 11, rond: true }), 250);
  annonceRarete('Légendaire', 'or');
  await pause(700); salon.classList.remove('secousse');
  await pause(1900);
  voile.className = 'voile-fx'; fente.classList.remove('vedette', 'rayons');
}
/* UNIQUE : coupure de courant, montée, la carte jaillit au centre de l'écran, tout explose */
async function revelerUnique(fente, copie, or = false){
  const salon = $('#salon'), voile = $('#voileFx'), c = chauve(copie.id);
  const ARC = or ? ['#fff3b0', '#ffd447', '#ffb000', '#fff', '#ffe58a', '#c98a00'] : ['#ff4f8b', '#ffb347', '#fff38a', '#6dffb0', '#3fc1ff', '#b64dff', '#fff'];
  /* 1. coupure : tout s'éteint, le cœur bat */
  voile.className = 'voile-fx noir'; salon.classList.add('chaos'); $('#etal').classList.add('eteint'); $('#tBoutons').style.visibility = 'hidden';
  await pause(900);
  /* 2. la montée : l'écran grésille, des éclairs de couleur, des particules aspirées */
  voile.classList.add('gresille');
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const aspire = setInterval(() => { for (let k = 0; k < 6; k++){ const a = rnd(0, 7), dd = rnd(300, 700); FX.p.push({ x: cx + Math.cos(a) * dd, y: cy + Math.sin(a) * dd, vx: -Math.cos(a) * dd / 28, vy: -Math.sin(a) * dd / 28, g: 0, vie: 28, t: rnd(2, 4), c: pick(ARC), rond: true, rot: 0, vr: 0 }); } const cv = $('#fxCanvas'); if (cv && cv.width !== innerWidth){ cv.width = innerWidth; cv.height = innerHeight; } fxLancer(); }, 40);
  await pause(1800); clearInterval(aspire);
  /* 3. l'explosion : flash blanc, la carte en grand au centre, rayons arc-en-ciel qui tournent */
  voile.className = 'voile-fx blanc'; salon.classList.add('secousse', 'fort');
  const scene = document.createElement('div'); scene.className = `unique-scene${or ? ' or' : ''}`;
  scene.innerHTML = `<div class="rayons-arc"></div><div class="onde"></div><div class="onde o2"></div><div class="onde o3"></div>
    <div class="u-mot">${or ? 'CRÂNE D\'OR' : 'UNIQUE'}</div><div class="u-carte">${carteCopie(copie)}</div>
    <div class="u-nom">${esc(c.nom)}</div><div class="u-sous">${or ? 'Tu as gagné ta propre carte pour la saison prochaine !' : 'Il en existe très peu dans le monde. Celui-ci est à toi.'}</div>`;
  salon.appendChild(scene);
  gerbe(cx, cy, 260, ARC, { vmax: 28, vie: 150, t: 7 });
  await pause(350); voile.className = 'voile-fx arc';
  for (let k = 0; k < 5; k++){ await pause(420); gerbe(rnd(innerWidth * .15, innerWidth * .85), rnd(innerHeight * .15, innerHeight * .6), 90, ARC, { vmax: 16, vie: 110 }); if (k === 1) pluie(220, ARC); if (k === 0) salon.classList.remove('fort'); }
  salon.classList.remove('secousse');
  await pause(2600);
  /* 4. la carte regagne sa place */
  scene.classList.add('part'); fente.classList.add('revele', 'rayons');
  await pause(600); scene.remove();
  voile.className = 'voile-fx'; salon.classList.remove('chaos'); $('#etal').classList.remove('eteint'); $('#tBoutons').style.visibility = '';
  pluie(120, ARC);
}
function annonceRarete(texte, cls){
  const a = document.createElement('div'); a.className = `annonce-r ${cls}`; a.textContent = texte; $('#salon').appendChild(a); setTimeout(() => a.remove(), 2600);
}

/* l'écran que voient les joueurs pendant la maintenance */
function ecranMaintenance(){
  const m = E.maintenance || {};
  return `<section class="maint"><img src="/img/logo.webp" alt="" class="maint-logo">
    <h1>Le Salon est en maintenance</h1>
    <p>${esc(m.message || 'On polit les crânes et on range les classeurs. Reviens dans un petit moment !')}</p>
    <p class="mut" style="font-size:14px">Tes chauves, tes cheveux et tes enchères sont à l'abri : les enchères en cours sont mises en pause et récupèrent leur temps à la réouverture.</p>
    ${E.moi ? '' : '<a class="maint-cnx" href="/api/login">Connexion</a>'}</section>`;
}

/* ses chauves, ses échanges et ses alertes, relus d'un coup (regroupés si plusieurs demandes arrivent ensemble) */
let persoEnCours = null, persoEncore = false;
async function rafraichirPerso(premiere = false){
  if (!E.moi) return;
  if (persoEnCours){ persoEncore = true; return persoEnCours; }
  persoEnCours = (async () => {
    const [copies, de, a, notifs] = await Promise.all([lire('copies', { orderBy: 'proprio', equalTo: E.moi.uid }), lire('echanges', { orderBy: 'de', equalTo: E.moi.uid }), lire('echanges', { orderBy: 'a', equalTo: E.moi.uid }), lire(`notifs/${E.moi.uid}`)].map(p => p.catch(() => null)));
    if (copies?.error){ console.error('Firebase copies :', copies.error); if (premiere) toast(/index/i.test(copies.error) ? 'Tes chauves ne peuvent pas être lus : il manque l\'index « proprio » dans les règles Firebase' : 'Tes chauves ne peuvent pas être lus pour le moment'); }
    else if (copies) E.copies = copies;
    if (de && !de.error) E.echDe = de;
    if (a && !a.error) E.echA = a;
    if (notifs && !notifs.error) surNotifs(notifs);
    planifier();
  })().finally(() => { persoEnCours = null; if (persoEncore){ persoEncore = false; rafraichirPerso(); } });
  return persoEnCours;
}

/* =========================================================
   DÉMARRAGE : session, flux temps réel, horloge
   ========================================================= */
const demandees = new Set();
let joueurs = async () => {};
setInterval(() => {
  for (const el of $$('[data-pcafin]')){ const r = +el.dataset.pcafin - Date.now(); if (r > 0) el.textContent = duree(r); else { delete el.dataset.pcafin; planifier(); } }
  for (const el of $$('[data-fin]')){
    const fin = +el.dataset.fin; if (!fin){ el.textContent = 'Terminée'; continue; }
    const r = fin - Date.now(); el.textContent = r > 0 ? duree(r) : 'Clôture…'; el.classList.toggle('urgent', r > 0 && r <= JEU.relance);
  }
  /* la première page ouverte qui voit une enchère échue la fait clôturer */
  if (!E.maintenance?.actif) for (const [eid, e] of Object.entries(E.ench)) if (!e.fini && e.fin <= Date.now() && !demandees.has(eid)){ demandees.add(eid); api('cloturer', { eid }).catch(() => {}); }
}, 1000);

(async () => {
  try { await configurer(); }
  catch { $('#view').innerHTML = '<div class="hors-ligne">Impossible de joindre le serveur du Salon. Réessaie dans un instant.</div>'; return; }
  const me = await (await fetch('/api/me')).json().catch(() => ({}));
  if (me.connecte) E.moi = { uid: me.uid, nom: me.nom, admin: me.admin };
  /* 2 flux en direct par onglet seulement (Firebase limite les connexions simultanées, 100 en offre gratuite) :
     le flux « public » (catalogue, Marché, fil) et la fiche du joueur. Ses chauves, échanges et alertes sont relus
     quand le serveur bouge son « signal », après chacune de ses actions, et toutes les 30 secondes par sécurité. */
  ecouter('public', {}, d => { E.cat = { chauves: {}, collections: {}, boosters: {}, ...d.catalogue }; E.emis = d.emis || {}; E.ench = d.encheres || {}; E.fil = d.fil || {}; E.pop = d.pop || {}; E.maintenance = d.maintenance || null; planifier(); });
  joueurs = async () => { const moi = E.moi && E.joueurs[E.moi.uid]; E.joueurs = await lire('joueurs'); if (moi) E.joueurs[E.moi.uid] = moi; planifier(); };
  joueurs(); setInterval(joueurs, 20000);
  if (E.moi){
    let signal = null;
    ecouter(`joueurs/${E.moi.uid}`, {}, d => { E.joueurs[E.moi.uid] = d; if (d.signal !== signal){ const premier = signal === null; signal = d.signal; if (!premier) rafraichirPerso(); } planifier(); });
    rafraichirPerso(true); setInterval(() => rafraichirPerso(), 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichirPerso(); });
  }
  api('regler').catch(() => {});
  activerInclinaison();
  window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); rafraichirPerso(); if (/^#(v-|classement|echanges|vitrine)/.test(location.hash)) joueurs(); });
  render();
})();
