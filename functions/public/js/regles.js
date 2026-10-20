/* =========================================================
   La Chauverie — règles du jeu (source unique)
   Importé par le site, l'overlay ET les Functions Cloudflare :
   ne modifie les chiffres qu'ici.
   ========================================================= */
export const JEU = {
  nom: 'La Chauverie',
  monnaie: { nom: 'Cheveux', un: 'cheveu' },
  classement: 'Les Déplumés',
  depart: 1500,               // cheveux offerts à l'inscription (5 boosters Saison 1)
  taxe: 0.05,                 // prélevée sur chaque vente aux enchères
  /* présence sur le stream : l'overlay relève le chat toutes les « intervalle » minutes */
  presence: { parHeure: 100, intervalle: 6, boosterToutes: 30, stockMax: 6 },
  tauxChrome: 0.04,
  miseHausse: 0.05,           // une mise doit dépasser l'offre de 5 % (+1)
  relance: 10e3,              // une mise dans les 10 dernières secondes…
  prolongation: 60e3,         // …relance le chrono à 1 minute
  historiqueMax: 50,          // mises gardées dans l'historique d'une enchère
  durees: [ { nom: '5 minutes', ms: 5 * 60e3 }, { nom: '1 heure', ms: 36e5 }, { nom: '24 heures', ms: 864e5 } ],
  vitrineMax: 6,
  /* PCA (Polisseurs de Crânes Agréés) : prix en cheveux et durée en minutes de l'expertise, selon la rareté */
  pca: {
    commun:     { prix: 80,   duree: 15 },
    rare:       { prix: 200,  duree: 60 },
    epique:     { prix: 500,  duree: 180 },
    legendaire: { prix: 1200, duree: 480 },
    unique:     { prix: 3000, duree: 1440 },
    or:         { prix: 0,    duree: 1440 },
  },
  /* Crâne d'or : chance en % par carte tirée (réglable carte par carte dans l'Atelier) */
  pctCraneOr: 0.05,
  echangeMaxChauves: 6,
  souhaitsMax: 5,             // chauves recherchés affichés sur la vitrine
  /* Broyeur : poussière de crâne gagnée en broyant un doublon, et prix pour fabriquer un chauve (réglables dans l'Atelier) */
  broyeur: {
    gain: { commun: 5, rare: 20, epique: 60, legendaire: 250 },
    prix: { commun: 50, rare: 200, epique: 600, legendaire: 2500 },
    chrome: 3,                // un Chromé broyé rapporte 3 fois plus
  },
  /* alertes de l'overlay pour les grosses sorties de booster (réglables dans l'Atelier) */
  alertes: { min: 'legendaire', chrome: 'epique' },
};


export const RARETES = {
  commun:     { nom: 'Commun',     taux: .72,  cote: 60,   points: 10,   tirage: 500, couleur: '#c9bfd8' },
  rare:       { nom: 'Rare',       taux: .20,  cote: 180,  points: 30,   tirage: 150, couleur: '#3fc1ff' },
  epique:     { nom: 'Épique',     taux: .065, cote: 500,  points: 80,   tirage: 50,  couleur: '#b64dff' },
  legendaire: { nom: 'Légendaire', taux: .015, cote: 1500, points: 250,  tirage: 10,  couleur: '#ff7b1c' },
  unique:     { nom: 'Unique',     taux: 0,    cote: 5000, points: 1000, tirage: 1,   couleur: '#ff4f8b' },
  /* catégorie spéciale : jamais tirée au hasard des raretés, une seule par joueur, liée au compte */
  or:         { nom: 'Crâne d\'or', taux: 0,    cote: 0,    points: 2000, tirage: 1,   couleur: '#ffcf3f', special: true },
};
export const ORDRE_R = Object.keys(RARETES);
export const estOr = c => c?.rarete === 'or';
/* taux réglés dans l'Atelier (public/catalogue/reglages), sinon ceux par défaut ci-dessus — en fractions (0.72 = 72 %) */
export const tauxDe = reglages => Object.fromEntries(ORDRE_R.map(k => [k, k === 'or' ? 0 : reglages?.taux?.[k] ?? RARETES[k].taux]));
export const chromeDe = reglages => reglages?.chrome ?? JEU.tauxChrome;
/* Broyeur : réglages de l'Atelier, sinon ceux par défaut ; une rareté absente de « prix » ne se fabrique pas.
   Les uniques et les Crânes d'or ne se broient ni ne se fabriquent, quel que soit le réglage. */
export const broyeurDe = reglages => { const b = reglages?.broyeur || {}, prix = { ...JEU.broyeur.prix, ...b.prix }, gain = { ...JEU.broyeur.gain, ...b.gain };
  for (const k of ['unique', 'or', 'aucun']){ delete prix[k]; delete gain[k]; }
  return { gain, prix, chrome: b.chrome ?? JEU.broyeur.chrome }; };
/* les uniques et les Crânes d'or n'entrent jamais dans le Broyeur : ni broyés, ni fabriqués */
export const horsBroyeur = c => !c || c.rarete === 'unique' || c.rarete === 'or';
export const poussiereDe = (copie, c, reglages) => { const b = broyeurDe(reglages); return Math.round((b.gain[c.rarete] || 0) * (copie.chrome ? b.chrome : 1)); };
export const alertesDe = reglages => ({ ...JEU.alertes, ...reglages?.alertes });
/* les exemplaires « en trop » d'un joueur : pour chaque chauve, on garde le meilleur (Chromé, puis la meilleure note) */
export function doublons(copies){
  const par = {}; for (const x of copies) (par[x.id] ||= []).push(x);
  const valeur = x => (x.chrome ? 100 : 0) + (x.note?.n || 0) + (x.lie ? 1000 : 0);
  return Object.values(par).flatMap(l => l.sort((a, b) => valeur(b) - valeur(a) || (a.t || 0) - (b.t || 0) || String(a.uid).localeCompare(String(b.uid))).slice(1)).filter(x => !x.vente && !x.lie && !x.pca);
}
/* chance d'un Crâne d'or par carte tirée, en fraction (accepte l'ancien réglage « 1 sur N ») */
export const chanceOr = c => c.pct != null ? c.pct / 100 : c.chance ? 1 / c.chance : JEU.pctCraneOr / 100;

/* ---------- PCA : l'état caché de chaque exemplaire, révélé par l'expertise ---------- */
/* chance de chaque note à la sortie du booster, multiplicateur de cote, libellé de l'étiquette */
export const NOTES = {
  10: { chance: .02,  mult: 5,   nom: 'Crâne de cristal' },
  9:  { chance: .08,  mult: 2.5, nom: 'Miroir parfait' },
  8:  { chance: .20,  mult: 1.6, nom: 'Lisse comme un œuf' },
  7:  { chance: .25,  mult: 1.2, nom: 'Bien poli' },
  6:  { chance: .18,  mult: 1,   nom: 'Légèrement terni' },
  5:  { chance: .11,  mult: 1,   nom: 'Bon état' },
  4:  { chance: .07,  mult: .7,  nom: 'Bosselé' },
  3:  { chance: .045, mult: .6,  nom: 'Écaillé' },
  2:  { chance: .025, mult: .5,  nom: 'Duveteux' },
  1:  { chance: .02,  mult: .4,  nom: 'Plein de cheveux' },
};
export const SOUS_NOTES = [['centrage', 'Centrage'], ['coins', 'Coins'], ['bords', 'Bords'], ['surface', 'Surface']];
/* tire l'état d'un exemplaire : la note finale, et quatre sous-notes dont la plus basse fixe la note */
export function tirerEtat(rng){
  let r = rng(), n = 1; for (const k of [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]){ r -= NOTES[k].chance; if (r < 0){ n = k; break; } }
  const sous = {}; for (const [k] of SOUS_NOTES) sous[k] = n === 10 ? 10 : Math.min(10, n + (rng() < .6 ? 1 : 0) + (rng() < .15 ? 1 : 0));
  if (n < 10) sous[SOUS_NOTES[Math.floor(rng() * 4)][0]] = n;
  return { n, ...sous };
}
/* boosters gratuits gagnés à regarder le stream, encore à ouvrir (plafonnés à stockMax) */
export function gratuitsDispo(j){
  const P = JEU.presence, gagnes = Math.floor((j?.presenceMin || 0) / P.boosterToutes), utilises = Math.max(j?.gratuits || 0, gagnes - P.stockMax);
  return Math.max(0, gagnes - utilises);
}
export const blackLabel = x => !!(x?.chrome && x?.note?.n === 10);

export const GRADES = [
  { nom: 'Chevelu',          min: 0,     cheveux: 9 },
  { nom: 'Tempes dégarnies', min: 300,   cheveux: 7 },
  { nom: 'Tonsure',          min: 1000,  cheveux: 5 },
  { nom: 'Crâne d\'œuf',     min: 2500,  cheveux: 3 },
  { nom: 'Boule de billard', min: 6000,  cheveux: 1 },
  { nom: 'Miroir absolu',    min: 12000, cheveux: 0 },
];

/* chaque succès lit une « mesure » calculée par mesures() */
/* les familles de succès, dans l'ordre d'affichage */
export const FAMILLES_SUCCES = [
  { id: 'boosters', nom: 'Boosters', emoji: '📦' }, { id: 'collection', nom: 'Collection', emoji: '🃏' }, { id: 'broyeur', nom: 'Broyeur', emoji: '⚙️' },
  { id: 'marche', nom: 'Marché et échanges', emoji: '🔨' }, { id: 'pca', nom: 'PCA', emoji: '🔬' }, { id: 'stream', nom: 'Stream', emoji: '📺' }, { id: 'profil', nom: 'Profil', emoji: '🪟' },
];
export const SUCCES = [
  { id: 'pack1', emoji: '📦', cat: 'boosters', nom: 'Premier booster', desc: 'Ouvrir un booster au Salon', mesure: 'packs', cible: 1, gain: 100 },
  { id: 'pack10', emoji: '🎰', cat: 'boosters', nom: 'Habitué du Salon', desc: 'Ouvrir 10 boosters', mesure: 'packs', cible: 10, gain: 400 },
  { id: 'pack25', emoji: '🎟️', cat: 'boosters', nom: 'Accro du Salon', desc: 'Ouvrir 25 boosters', mesure: 'packs', cible: 25, gain: 600 },
  { id: 'pack50', emoji: '🧨', cat: 'boosters', nom: 'Déchireur fou', desc: 'Ouvrir 50 boosters', mesure: 'packs', cible: 50, gain: 1000 },
  { id: 'pack100', emoji: '🚀', cat: 'boosters', nom: 'Machine à boosters', desc: 'Ouvrir 100 boosters', mesure: 'packs', cible: 100, gain: 2000 },
  { id: 'gratuit1', emoji: '🎁', cat: 'boosters', nom: 'Cadeau du stream', desc: 'Ouvrir un booster de présence', mesure: 'gratuits', cible: 1, gain: 50 },
  { id: 'gratuit25', emoji: '🎀', cat: 'boosters', nom: 'Fidèle au poste', desc: 'Ouvrir 25 boosters de présence', mesure: 'gratuits', cible: 25, gain: 500 },
  { id: 'esp5', emoji: '🃏', cat: 'collection', nom: 'Début de collection', desc: 'Posséder 5 chauves différents', mesure: 'especes', cible: 5, gain: 200 },
  { id: 'esp9', emoji: '🖼️', cat: 'collection', nom: 'Galerie de crânes', desc: 'Posséder 9 chauves différents', mesure: 'especes', cible: 9, gain: 500 },
  { id: 'esp20', emoji: '📒', cat: 'collection', nom: 'Album bien rempli', desc: 'Posséder 20 chauves différents', mesure: 'especes', cible: 20, gain: 600 },
  { id: 'dex50', emoji: '🌓', cat: 'collection', nom: 'La moitié du crâne', desc: 'Remplir la moitié du ChauveDex (hors uniques et Crâne d\'or)', mesure: 'dexPct', cible: 50, gain: 1500 },
  { id: 'dex100', emoji: '🌕', cat: 'collection', nom: 'ChauveDex complet', desc: 'Posséder tous les chauves (hors uniques et Crâne d\'or)', mesure: 'dexPct', cible: 100, gain: 5000 },
  { id: 'coll1', emoji: '📚', cat: 'collection', nom: 'Série complète', desc: 'Compléter une collection', mesure: 'collections', cible: 1, gain: 300 },
  { id: 'coll3', emoji: '🏛️', cat: 'collection', nom: 'Conservateur', desc: 'Compléter trois collections', mesure: 'collections', cible: 3, gain: 1000 },
  { id: 'coll5', emoji: '🏰', cat: 'collection', nom: 'Grand conservateur', desc: 'Compléter cinq collections', mesure: 'collections', cible: 5, gain: 1500 },
  { id: 'triple', emoji: '🎲', cat: 'collection', nom: 'Jamais deux sans trois', desc: 'Posséder trois exemplaires du même chauve', mesure: 'maxDoublon', cible: 3, gain: 150 },
  { id: 'rare1', emoji: '🔷', cat: 'collection', nom: 'Un peu de bleu', desc: 'Obtenir un chauve rare', mesure: 'rares', cible: 1, gain: 100 },
  { id: 'epique1', emoji: '🔮', cat: 'collection', nom: 'Violet de rage', desc: 'Obtenir un chauve épique', mesure: 'epiques', cible: 1, gain: 200 },
  { id: 'leg1', emoji: '🔥', cat: 'collection', nom: 'Légende vivante', desc: 'Obtenir un chauve légendaire', mesure: 'legendaires', cible: 1, gain: 500 },
  { id: 'leg5', emoji: '🌋', cat: 'collection', nom: 'Panthéon', desc: 'Posséder 5 légendaires différents', mesure: 'legendaires', cible: 5, gain: 2000 },
  { id: 'unique1', emoji: '💗', cat: 'collection', nom: 'Pièce unique', desc: 'Obtenir un chauve unique', mesure: 'uniques', cible: 1, gain: 1500 },
  { id: 'or1', emoji: '👑', cat: 'collection', nom: 'Crâne d\'or', desc: 'Trouver un Crâne d\'or', mesure: 'ors', cible: 1, gain: 1000 },
  { id: 'chrome', emoji: '✨', cat: 'collection', nom: 'Ça brille', desc: 'Obtenir un chauve Chromé', mesure: 'chromes', cible: 1, gain: 300 },
  { id: 'chrome5', emoji: '🪩', cat: 'collection', nom: 'Boule à facettes', desc: 'Posséder 5 chauves Chromés', mesure: 'chromes', cible: 5, gain: 800 },
  { id: 'broie1', emoji: '⚙️', cat: 'broyeur', nom: 'Premier broyage', desc: 'Broyer un doublon au Broyeur', mesure: 'broyes', cible: 1, gain: 50 },
  { id: 'broie50', emoji: '🌀', cat: 'broyeur', nom: 'Broyeur fou', desc: 'Broyer 50 doublons', mesure: 'broyes', cible: 50, gain: 400 },
  { id: 'broie250', emoji: '🌪️', cat: 'broyeur', nom: 'Hachoir à crânes', desc: 'Broyer 250 doublons', mesure: 'broyes', cible: 250, gain: 1000 },
  { id: 'fab1', emoji: '🛠️', cat: 'broyeur', nom: 'Artisan du crâne', desc: 'Fabriquer un chauve au Broyeur', mesure: 'fabriques', cible: 1, gain: 200 },
  { id: 'fab10', emoji: '⚒️', cat: 'broyeur', nom: 'Maître artisan', desc: 'Fabriquer 10 chauves', mesure: 'fabriques', cible: 10, gain: 800 },
  { id: 'mise1', emoji: '🪙', cat: 'marche', nom: 'Première mise', desc: 'Placer une enchère au Marché', mesure: 'encheres', cible: 1, gain: 50 },
  { id: 'mise25', emoji: '📣', cat: 'marche', nom: 'Enchérisseur compulsif', desc: 'Placer 25 enchères', mesure: 'encheres', cible: 25, gain: 300 },
  { id: 'adj1', emoji: '🔨', cat: 'marche', nom: 'Adjugé !', desc: 'Remporter une enchère', mesure: 'adjuges', cible: 1, gain: 200 },
  { id: 'adj10', emoji: '🏆', cat: 'marche', nom: 'Collectionneur d\'adjugés', desc: 'Remporter 10 enchères', mesure: 'adjuges', cible: 10, gain: 600 },
  { id: 'vente1', emoji: '🏷️', cat: 'marche', nom: 'Premier marchand', desc: 'Vendre un chauve aux enchères', mesure: 'ventes', cible: 1, gain: 150 },
  { id: 'vente10', emoji: '🛒', cat: 'marche', nom: 'Commerçant', desc: 'Vendre 10 chauves aux enchères', mesure: 'ventes', cible: 10, gain: 500 },
  { id: 'vente2k', emoji: '💰', cat: 'marche', nom: 'Marchand de crânes', desc: 'Gagner 2 000 cheveux en ventes aux enchères', mesure: 'gainsVentes', cible: 2000, gain: 500 },
  { id: 'troc1', emoji: '🤝', cat: 'marche', nom: 'Troc de crânes', desc: 'Conclure un échange avec un autre joueur', mesure: 'echanges', cible: 1, gain: 150 },
  { id: 'troc10', emoji: '🔁', cat: 'marche', nom: 'Roi du troc', desc: 'Conclure 10 échanges', mesure: 'echanges', cible: 10, gain: 600 },
  { id: 'pca1', emoji: '🔬', cat: 'pca', nom: 'Premier passage au labo', desc: 'Faire expertiser un chauve par le PCA', mesure: 'expertises', cible: 1, gain: 150 },
  { id: 'pca10x', emoji: '🧪', cat: 'pca', nom: 'Habitué du labo', desc: 'Faire expertiser 10 chauves', mesure: 'expertises', cible: 10, gain: 500 },
  { id: 'pca9', emoji: '🪞', cat: 'pca', nom: 'Miroir parfait', desc: 'Obtenir un PCA 9 ou plus', mesure: 'pca9', cible: 1, gain: 400 },
  { id: 'pca10', emoji: '💎', cat: 'pca', nom: 'Crâne de cristal', desc: 'Obtenir un PCA 10', mesure: 'gemMint', cible: 1, gain: 1000 },
  { id: 'black', emoji: '🖤', cat: 'pca', nom: 'Étiquette noire', desc: 'Obtenir un PCA 10 sur un chauve Chromé', mesure: 'blackLabel', cible: 1, gain: 5000 },
  { id: 'pcaNul', emoji: '🦱', cat: 'pca', nom: 'Plein de cheveux', desc: 'Obtenir un PCA 1 (pas de chance !)', mesure: 'pcaNul', cible: 1, gain: 100 },
  { id: 'stream1', emoji: '👋', cat: 'stream', nom: 'Premier live', desc: 'Passer 1 heure sur le stream', mesure: 'heures', cible: 1, gain: 50 },
  { id: 'stream5', emoji: '📺', cat: 'stream', nom: 'Habitué du stream', desc: 'Passer 5 heures sur le stream', mesure: 'heures', cible: 5, gain: 200 },
  { id: 'stream20', emoji: '🍿', cat: 'stream', nom: 'Spectateur assidu', desc: 'Passer 20 heures sur le stream', mesure: 'heures', cible: 20, gain: 500 },
  { id: 'stream50', emoji: '🛋️', cat: 'stream', nom: 'Pilier du chat', desc: 'Passer 50 heures sur le stream', mesure: 'heures', cible: 50, gain: 1000 },
  { id: 'stream100', emoji: '🗿', cat: 'stream', nom: 'Meuble du stream', desc: 'Passer 100 heures sur le stream', mesure: 'heures', cible: 100, gain: 2500 },
  { id: 'vitrine1', emoji: '🪟', cat: 'profil', nom: 'Vitrine ouverte', desc: 'Exposer un chauve dans ta vitrine', mesure: 'vitrine', cible: 1, gain: 50 },
  { id: 'souhait1', emoji: '💌', cat: 'profil', nom: 'Liste au Père Noël', desc: 'Ajouter un chauve à tes souhaits', mesure: 'souhaits', cible: 1, gain: 30 },
];

/* ---------- calculs purs ---------- */
/* une carte « illimitée » n'a pas de plafond : elle reste toujours tirable */
export const tirageMax = c => c.illimite ? Infinity : c.tirage || RARETES[c.rarete].tirage;
export const miseMin = e => e.offre ? Math.ceil(e.offre * (1 + JEU.miseHausse) + 1) : e.depart;
export const gradeDe = sc => [...GRADES].reverse().find(g => sc >= g.min);
export const jourDe = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export function cote(copie, c){
  let v = RARETES[c.rarete].cote;
  if (copie.chrome) v *= 2.2;
  if (copie.note) v *= NOTES[copie.note.n]?.mult ?? 1;
  return Math.round(v);
}

/* copies : liste des exemplaires d'un joueur ; catalogue : { chauves:{id:c}, collections:{id:co} } */
export function collectionsCompletes(copies, catalogue){
  const eus = new Set(copies.map(x => x.id)), actifs = Object.entries(catalogue.chauves || {}).filter(([, c]) => !c.retire && c.rarete !== 'or');
  return Object.keys(catalogue.collections || {}).filter(co => {
    const ids = actifs.filter(([, c]) => c.coll === co).map(([id]) => id);
    return ids.length && ids.every(id => eus.has(id));
  });
}
export function mesures(joueur, copies, catalogue){
  const st = joueur.stats || {}, par = {};
  for (const x of copies) par[x.id] = (par[x.id] || 0) + 1;
  const ch = catalogue?.chauves || {}, parRar = r => Object.keys(par).filter(id => ch[id]?.rarete === r).length;
  /* le ChauveDex « complet » : tous les chauves actifs, hors uniques et Crânes d'or */
  const dex = Object.entries(ch).filter(([, c]) => !c.retire && c.rarete !== 'unique' && c.rarete !== 'or').map(([id]) => id);
  return {
    packs: st.packs || 0, encheres: st.encheres || 0, adjuges: st.adjuges || 0, ventes: st.ventes || 0,
    gainsVentes: st.gainsVentes || 0, echanges: st.echanges || 0, heures: Math.floor((joueur.presenceMin || 0) / 60),
    especes: Object.keys(par).length, maxDoublon: Math.max(0, ...Object.values(par)),
    chromes: copies.filter(x => x.chrome).length,
    expertises: Math.max(st.expertises || 0, copies.filter(x => x.note).length),
    gemMint: Math.max(st.pca10 || 0, copies.filter(x => x.note?.n === 10).length), blackLabel: Math.max(st.black || 0, copies.filter(blackLabel).length),
    pca9: Math.max(st.pca9 || 0, copies.filter(x => x.note?.n >= 9).length), pcaNul: Math.max(st.pca1 || 0, copies.filter(x => x.note?.n === 1).length),
    collections: collectionsCompletes(copies, catalogue).length,
    broyes: st.broyes || 0, fabriques: st.fabriques || 0, gratuits: st.gratuits || 0,
    rares: parRar('rare'), epiques: parRar('epique'), legendaires: parRar('legendaire'), uniques: parRar('unique'), ors: parRar('or'),
    dexPct: dex.length ? Math.floor(dex.filter(id => par[id]).length / dex.length * 100) : 0,
    vitrine: (joueur.vitrine || []).length, souhaits: Array.isArray(joueur.souhaits) ? joueur.souhaits.length : 0,
  };
}
export function score(joueur, copies, catalogue){
  let s = 0;
  for (const x of copies){ const c = catalogue.chauves?.[x.id]; if (!c) continue; s += RARETES[c.rarete].points * (x.chrome ? 2 : 1) + (x.note ? 10 + (x.note.n === 10 ? 150 : x.note.n === 9 ? 40 : 0) * (x.chrome ? 2 : 1) : 0); }
  const m = mesures(joueur, copies, catalogue);
  return s + m.especes * 15 + m.collections * 200 + Object.keys(joueur.succes || {}).length * 20;
}

/* tirage d'une rareté ; dispo(rar) dit s'il reste un chauve de cette rareté */
export function tirerRarete(rng, dispo, min, taux = tauxDe()){
  let r = rng(), acc = 0, rar = 'commun';
  for (const k of ORDRE_R){ acc += taux[k] || 0; if (r < acc){ rar = k; break; } }
  if (min && ORDRE_R.indexOf(rar) < ORDRE_R.indexOf(min)) rar = min;
  const i = ORDRE_R.indexOf(rar), essais = [...ORDRE_R.slice(0, i + 1).reverse(), ...ORDRE_R.slice(i + 1)];
  return essais.find(k => dispo(k)) || null;
}

/* le catalogue de départ : semé par l'action admin « init » */
export const CATALOGUE_BASE = {
  collections: {
    premiers: { nom: 'Les Premiers Rasés',  desc: 'Les trois fondateurs de l\'Ordre.', gain: 300, ordre: 1 },
    ruines:   { nom: 'Les Ruines Pourpres', desc: 'Ils ont juré de ne jamais repousser.', gain: 300, ordre: 2 },
    ecorches: { nom: 'Les Écorchés',        desc: 'Des bandages, des cicatrices et zéro cheveu.', gain: 300, ordre: 3 },
  },
  /* un booster : son image, son prix, le nombre de cartes et la liste des chauves qu'il peut contenir */
  boosters: {
    'saison-1': { nom: 'Saison 1', img: '/img/booster-saison-1.webp', prix: 300, nb: 5, garantie: '', actif: true, ordre: 1,
      chauves: ['front-de-fer', 'cranisse', 'cranombre', 'massacrane', 'tankrane', 'cranomancien', 'bladwall', 'apothicrane', 'barbald'] },
  },
  chauves: {
    'front-de-fer': { nom: 'Front de Fer', coll: 'premiers', rarete: 'commun', classe: 'Cabochard',    img: '/img/front-de-fer.webp', desc: 'Il encaisse les coups derrière ses planches clouées.', ordre: 1 },
    cranisse:       { nom: 'Crânisse',     coll: 'premiers', rarete: 'commun', classe: 'Lustreuse',    img: '/img/cranisse.webp',     desc: 'Sa lanterne soigne les crânes cabossés.', ordre: 2 },
    cranombre:      { nom: 'Crânombre',    coll: 'premiers', rarete: 'commun', classe: 'Éblouisseur',  img: '/img/cranombre.webp',    desc: 'Deux lames, aucun reflet : il frappe dans l\'ombre.', ordre: 3 },
    massacrane:     { nom: 'Massacrâne',   coll: 'ruines',   rarete: 'commun', classe: 'Éblouisseuse', img: '/img/massacrane.webp',   desc: 'Son espadon rouillé fait le ménage.', ordre: 4 },
    tankrane:       { nom: 'Tankrâne',     coll: 'ruines',   rarete: 'commun', classe: 'Cabocharde',   img: '/img/tankrane.webp',     desc: 'Un pavois, un marteau, et personne ne passe.', ordre: 5 },
    cranomancien:   { nom: 'Crânomancien', coll: 'ruines',   rarete: 'commun', classe: 'Lustreur',     img: '/img/cranomancien.webp', desc: 'Il lit les psaumes du crâne dans son grimoire.', ordre: 6 },
    bladwall:       { nom: 'Bladwall',     coll: 'ecorches', rarete: 'commun', classe: 'Cabocharde',   img: '/img/bladwall.webp',     desc: 'Deux boucliers valent mieux qu\'un.', ordre: 7 },
    apothicrane:    { nom: 'Apothicrâne',  coll: 'ecorches', rarete: 'commun', classe: 'Lustreuse',    img: '/img/apothicrane.webp',  desc: 'Perfusions, fioles et bandages propres.', ordre: 8 },
    barbald:        { nom: 'Barbald',      coll: 'ecorches', rarete: 'commun', classe: 'Éblouisseur',  img: '/img/barbald.webp',      desc: 'Pas d\'arme. Il n\'en a jamais eu besoin.', ordre: 9 },
  },
};
