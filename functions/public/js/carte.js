/* La carte de chauve (style Épuré) : même rendu sur le site et sur l'overlay. Voir carte.css. */
import { RARETES } from './regles.js';
const esc = t => String(t ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/* o : { img, nom, rarete, coll, droite, chrome, inconnu, cadre, couleur, etat }
   etat = note PCA révélée (1 à 10) : 5 et 6 sont l'état normal, en dessous la carte s'abîme, au-dessus elle brille
   cadre = style de bord forcé (une clé de rareté) ; couleur = teinte du bord (#rrggbb). Sans eux, le bord suit la rareté.
   droite = texte en bas à droite (numéro d'exemplaire, « ×3 »…) */
/* un nom long est coupé en deux lignes au meilleur espace, puis réduit jusqu'à ce que la plus longue ligne tienne */
const LIGNE = 12.5;
function nomAjuste(nom){
  const t = String(nom || '').trim(); let m = t.length, coupe = -1;
  if (t.length > LIGNE) for (let i = 0; i < t.length; i++) if (t[i] === ' ' && Math.max(i, t.length - i - 1) < m){ m = Math.max(i, t.length - i - 1); coupe = i; }
  return { html: coupe < 0 ? esc(t) : `${esc(t.slice(0, coupe))}<br>${esc(t.slice(coupe + 1))}`, echelle: Math.max(.35, Math.min(1, LIGNE / m)) };
}
export function carteHTML(o){
  const rar = RARETES[o.rarete] ? o.rarete : 'commun', cadre = RARETES[o.cadre] ? o.cadre : rar;
  const teinte = /^#[0-9a-f]{6}$/i.test(o.couleur || '') ? ` style="--c:${o.couleur};--c2:color-mix(in srgb,${o.couleur} 42%,#000)"` : '';
  /* o.sans : textes masqués sur cette carte, parmi nom, rar, coll, no */
  const sans = new Set(Array.isArray(o.sans) ? o.sans : []), plaque = !sans.has('nom') || o.inconnu;
  /* un nom long passe sur deux lignes et rétrécit pour rester entier */
  const n = nomAjuste(o.nom), taille = o.inconnu || n.echelle === 1 ? '' : ` style="--n:${n.echelle.toFixed(2)}"`;
  const us = o.etat >= 1 && o.etat <= 10 ? ` us${Math.round(o.etat)}` : '';
  return `<span class="tc ${cadre} ${o.chrome ? 'chrome' : ''} ${o.inconnu ? 'inconnu' : ''}${us}"${teinte}><span class="f"><span class="b">
    <span class="art"><img src="${esc(o.img)}" alt="${o.inconnu ? 'Chauve inconnu' : esc(o.nom)}" loading="lazy"></span>
    ${sans.has('rar') ? '' : `<span class="rar">${RARETES[rar].nom}</span>`}${o.chrome ? '<span class="chr">Chromé</span>' : ''}
    ${plaque ? `<span class="plq"><span class="nom"${taille}>${o.inconnu ? 'Inconnu' : n.html}</span></span>` : ''}
    <span class="pied"><span class="col">${sans.has('coll') ? '' : esc(o.coll || '')}</span><span class="gem"></span><span class="no">${sans.has('no') ? '' : esc(o.droite || '')}</span></span>
    <span class="fx"></span><span class="glare"></span></span>${us ? '<span class="usure"></span>' : ''}</span></span>`;
}

/* la carte s'incline sous la souris et un reflet suit le curseur */
export function activerInclinaison(){
  let courante = null;
  const repos = t => { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); t.style.setProperty('--g', 0); };
  document.addEventListener('pointermove', e => {
    const t = e.target.closest?.('.tc');
    if (courante && courante !== t) repos(courante);
    courante = t; if (!t || e.pointerType === 'touch') return;
    const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    t.style.setProperty('--ry', `${(x - .5) * 20}deg`); t.style.setProperty('--rx', `${(.5 - y) * 14}deg`);
    t.style.setProperty('--mx', `${x * 100}%`); t.style.setProperty('--my', `${y * 100}%`); t.style.setProperty('--g', 1);
  });
  document.addEventListener('pointerleave', () => { if (courante) repos(courante); courante = null; });
}
