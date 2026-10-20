/* Scénario multi-joueurs contre l'émulateur local.   node tests/scenario.mjs */
process.env.PORT = '8799'; process.env.PORT_DB = '8798'; process.env.SAUVE = 'non';
import { collectionsCompletes } from '../public/js/regles.js';
const { serveur, serveurBase, lireBase } = await import('../dev/serveur.mjs');
await new Promise(r => serveur.listen(8799, r)); await new Promise(r => serveurBase.listen(8798, r));
const URL0 = 'http://localhost:8799';
let ok = 0, ko = 0;
const verifier = (cond, msg) => { if (cond){ ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg); } };

async function connecter(login){
  const r = await fetch(`${URL0}/api/dev-login?login=${login}`, { redirect: 'manual' });
  const c = r.headers.getSetCookie().find(x => x.startsWith('chv_session=')).split(';')[0];
  return { login, uid: `tw_${login}`, c,
    post: async (action, corps = {}) => { const r = await fetch(`${URL0}/api/${action}`, { method: 'POST', headers: { cookie: c, 'content-type': 'application/json', origin: URL0 }, body: JSON.stringify(corps) }); return { statut: r.status, ...(await r.json()) }; } };
}
const db = chemin => chemin.split('/').reduce((n, k) => n?.[k], lireBase().chauvalerie);
const reflets = j => db(`joueurs/${j.uid}/reflets`);
const secret = (chemin, v) => fetch(`http://localhost:8798/db/chauvalerie/${chemin}.json?auth=dev`, { method: 'PATCH', body: JSON.stringify(v) });

console.log('Inscription et catalogue');
const alveas = await connecter('alveas'), bob = await connecter('bob'), carl = await connecter('carl');
verifier(reflets(bob) === 1500, 'un nouveau joueur reçoit 1 500 cheveux');
verifier((await bob.post('admin-init')).statut === 403, 'bob ne peut pas utiliser l\'Atelier');
verifier((await alveas.post('admin-init')).ok, 'alveas sème le catalogue');
verifier(Object.keys(db('public/catalogue/chauves')).length === 9, '9 chauves au catalogue');
verifier(db('public/catalogue/boosters/saison-1/chauves').length === 9, 'le booster Saison 1 contient les 9 chauves');

console.log('Salon');
const p = await alveas.post('pack', { pack: 'saison-1' });
verifier(p.copies?.length === 5 && reflets(alveas) === 1200, 'un booster Saison 1 donne 5 cartes pour 300 cheveux');
verifier(p.copies.every(x => db(`copies/${x.uid}/proprio`) === alveas.uid), 'les exemplaires appartiennent à alveas');
verifier(new Set(p.copies.map(x => `${x.id}#${x.no}`)).size === 5, 'numéros d\'exemplaires uniques');
verifier((await bob.post('pack', { pack: 'inconnu' })).statut === 400, 'booster inconnu refusé');

console.log('Boosters');
const imgB = 'data:image/webp;base64,' + Buffer.from('RIFF0000WEBP').toString('base64');
verifier((await bob.post('admin-booster', { nom: 'Pirate', prix: 1, nb: 3, image: imgB })).statut === 403, 'bob ne peut pas créer de booster');
const bo = await alveas.post('admin-booster', { nom: 'Édition Dorée', prix: 100, nb: 2, image: imgB });
verifier(bo.id === 'edition-doree' && db('public/catalogue/boosters/edition-doree/prix') === 100, 'alveas crée un booster');
verifier((await carl.post('pack', { pack: 'edition-doree' })).statut === 400 && reflets(carl) === 1500, 'un booster vide ne s\'ouvre pas et ne coûte rien');
verifier((await alveas.post('admin-booster-cartes', { id: bo.id, chauves: ['barbald', 'inconnu'] })).statut === 400, 'on ne met que des chauves existants');
verifier((await alveas.post('admin-booster-cartes', { id: bo.id, chauves: ['barbald', 'bladwall'] })).nb === 2, 'alveas choisit les cartes du booster');
const ob = await carl.post('pack', { pack: bo.id });
verifier(ob.copies?.length === 2 && ob.copies.every(x => ['barbald', 'bladwall'].includes(x.id)), 'le booster ne donne que ses cartes');
verifier(reflets(carl) === 1400, 'au prix du booster');
await alveas.post('admin-booster', { id: bo.id, nom: 'Édition Dorée', prix: 100, nb: 2, actif: false });
verifier((await carl.post('pack', { pack: bo.id })).statut === 400, 'un booster désactivé ne s\'ouvre plus');
await secret(`joueurs/${carl.uid}`, { reflets: 1000 });

console.log('Enchères');
const v = await alveas.post('vendre', { copie: p.copies[0].uid, depart: 50, duree: 0 });
verifier(!!v.eid, 'alveas met un chauve aux enchères');
verifier((await alveas.post('vendre', { copie: p.copies[0].uid, depart: 50, duree: 0 })).statut === 400, 'impossible de vendre deux fois le même');
verifier((await alveas.post('miser', { eid: v.eid, montant: 60 })).statut === 400, 'on ne mise pas sur sa propre vente');
verifier((await bob.post('miser', { eid: v.eid, montant: 40 })).statut === 400, 'mise sous le prix de départ refusée');
verifier(!(await bob.post('miser', { eid: v.eid, montant: 50 })).erreur && reflets(bob) === 1450, 'bob mise 50 (reflets bloqués)');
verifier((await carl.post('miser', { eid: v.eid, montant: 52 })).statut === 400, 'surenchère trop faible refusée');
verifier(!(await carl.post('miser', { eid: v.eid, montant: 60 })).erreur, 'carl surenchérit à 60');
verifier(reflets(bob) === 1500 && reflets(carl) === 940, 'bob est remboursé, carl bloque 60');
verifier(Object.values(db(`notifs/${bob.uid}`) || {}).some(n => n.type === 'surenchere'), 'bob reçoit une alerte de surenchère');
verifier(Object.values(db(`notifs/${alveas.uid}`) || {}).some(n => n.type === 'mise'), 'alveas est prévenu des mises');

console.log('Mises simultanées');
const joueurs = await Promise.all(['d1', 'd2', 'd3', 'd4', 'd5'].map(connecter));
const avant = Object.fromEntries(joueurs.map(j => [j.uid, reflets(j)]));
const res = await Promise.all(joueurs.map(j => j.post('miser', { eid: v.eid, montant: 100 })));
const gagnants = res.filter(r => !r.erreur).length, e = db(`public/encheres/${v.eid}`);
verifier(gagnants >= 1, `${gagnants} mise(s) acceptée(s), les autres refusées proprement`);
verifier(joueurs.every(j => j.uid === e.meneur ? reflets(j) === avant[j.uid] - e.offre : reflets(j) === avant[j.uid]), 'aucun reflet perdu ni créé');
verifier(reflets(carl) === 1000, 'carl est remboursé');

console.log('Relance des 10 dernières secondes');
await secret(`public/encheres/${v.eid}`, { fin: Date.now() + 30e3 });
const avant30 = db(`public/encheres/${v.eid}/fin`), m1 = db(`public/encheres/${v.eid}`);
await bob.post('miser', { eid: v.eid, montant: Math.ceil(m1.offre * 1.05 + 1) });
verifier(db(`public/encheres/${v.eid}/fin`) === avant30, 'à 30 s de la fin, une mise ne change pas le chrono');
await secret(`public/encheres/${v.eid}`, { fin: Date.now() + 5e3 });
const m2 = db(`public/encheres/${v.eid}`);
await carl.post('miser', { eid: v.eid, montant: Math.ceil(m2.offre * 1.05 + 1) });
const reste = db(`public/encheres/${v.eid}/fin`) - Date.now();
verifier(reste > 55e3 && reste <= 60e3, `à 5 s de la fin, la mise relance le chrono à 1 minute (${Math.round(reste / 1000)} s)`);
verifier(db(`public/encheres/${v.eid}/relances`) === 1, 'la relance est comptée');
const hist = db(`public/encheres/${v.eid}/mises`);
verifier(hist.length >= 5 && hist.every(m => m.uid && m.nom && m.m && m.t), `historique complet des mises (${hist.length}), avec qui et combien`);

console.log('Clôture');
await secret(`public/encheres/${v.eid}`, { fin: Date.now() - 1 });
await carl.post('regler');
for (let k = 0; k < 40 && db(`public/encheres/${v.eid}/regle`) !== true; k++) await new Promise(r => setTimeout(r, 50));   /* la clôture a pu être lancée en tâche de fond par une action précédente */
const f = db(`public/encheres/${v.eid}`);
verifier(f.fini && db(`copies/${p.copies[0].uid}/proprio`) === f.meneur, 'le chauve part au meilleur enchérisseur');
verifier(reflets(alveas) === 1200 + Math.round(f.offre * .95), 'alveas touche la vente moins 5 %');
verifier(!db(`copies/${p.copies[0].uid}/vente`), 'le verrou de vente est levé');

console.log('Succès');
verifier(!(await alveas.post('succes', { id: 'pack1' })).erreur, 'succès « Premier coup de tondeuse » récupéré');
verifier((await alveas.post('succes', { id: 'pack1' })).statut === 400, 'pas deux fois');
verifier((await bob.post('succes', { id: 'pack1' })).statut === 400, 'bob n\'a pas rempli ce succès');
verifier((await bob.post('lustre')).statut === 404 && (await alveas.post('barbier', { copie: p.copies[2].uid })).statut === 404, 'le lustre du jour et le Barbier n\'existent plus');

console.log('Échanges');
const pb = await bob.post('pack', { pack: 'saison-1' });
const prop = await alveas.post('echange-proposer', { a: bob.uid, donne: [p.copies[1].uid], demande: [pb.copies[0].uid], reflets: 20 });
verifier(!!prop.tid, 'alveas propose un échange à bob');
verifier((await carl.post('echange-repondre', { tid: prop.tid, accepte: true })).statut === 403, 'carl ne peut pas accepter à la place de bob');
const rb = reflets(bob), ra = reflets(alveas);
verifier((await bob.post('echange-repondre', { tid: prop.tid, accepte: true })).statut === 'accepte', 'bob accepte');
verifier(db(`copies/${p.copies[1].uid}/proprio`) === bob.uid && db(`copies/${pb.copies[0].uid}/proprio`) === alveas.uid, 'les chauves ont changé de main');
verifier(reflets(bob) === rb + 20 && reflets(alveas) === ra - 20, 'les 20 reflets sont passés');
verifier((await bob.post('echange-repondre', { tid: prop.tid, accepte: true })).statut === 400, 'un échange ne se règle qu\'une fois');

console.log('Vitrine et classement');
verifier(!(await alveas.post('vitrine', { copies: [pb.copies[0].uid], devise: 'Le crâne le plus lisse du chat' })).erreur, 'alveas compose sa vitrine');
verifier((await alveas.post('vitrine', { copies: [p.copies[1].uid] })).statut === 400, 'on n\'expose que ses propres chauves');
verifier(db(`joueurs/${alveas.uid}/score`) > 0, 'la calvitie est calculée');

console.log('Atelier');
const img = 'data:image/webp;base64,' + Buffer.from('RIFF0000WEBP').toString('base64');
const ch = await alveas.post('admin-chauve', { nom: 'Crâne d\'Or', coll: 'premiers', rarete: 'legendaire', tirage: 10, image: img, booster: 'saison-1' });
verifier(db('public/catalogue/boosters/saison-1/chauves').includes('crane-d-or'), 'le nouveau chauve entre dans le booster choisi');
verifier(ch.id === 'crane-d-or' && db('public/catalogue/chauves/crane-d-or/rarete') === 'legendaire', 'alveas ajoute un chauve légendaire');
verifier((await bob.post('admin-chauve', { nom: 'Pirate', coll: 'premiers', rarete: 'commun', image: img })).statut === 403, 'bob ne peut pas ajouter de chauve');
console.log('Atelier : tout modifier');
verifier((await bob.post('admin-chauve-modifier', { id: 'barbald', nom: 'Hack' })).statut === 403, 'bob ne peut rien modifier');
verifier(!(await alveas.post('admin-chauve-modifier', { id: 'barbald', nom: 'Barbald le Grand', rarete: 'epique', cadre: 'legendaire', couleur: '#00ff88', coll: 'premiers', boosters: [] })).erreur, 'alveas modifie nom, rareté, bord, couleur, collection et boosters');
const bm = db('public/catalogue/chauves/barbald');
verifier(bm.nom === 'Barbald le Grand' && bm.rarete === 'epique' && bm.cadre === 'legendaire' && bm.couleur === '#00ff88' && bm.coll === 'premiers', 'les changements sont enregistrés');
verifier(!db('public/catalogue/boosters/saison-1/chauves').includes('barbald'), 'il est sorti du booster Saison 1');
const [plusTire, nbTire] = Object.entries(db('public/emis')).sort((a, b) => b[1] - a[1])[0];
verifier((await alveas.post('admin-chauve-modifier', { id: plusTire, tirage: nbTire - 1 })).statut === 400, 'le tirage ne peut pas descendre sous le nombre d\'exemplaires existants');
verifier((await alveas.post('admin-chauve-modifier', { id: 'barbald', couleur: 'rouge' })).statut === 400, 'couleur invalide refusée');
verifier((await alveas.post('admin-chauve-supprimer', { id: plusTire })).statut === 409 && !!db(`public/catalogue/chauves/${plusTire}`), 'un chauve déjà possédé demande une confirmation');
verifier((await fetch(`${URL0}/api/image?id=crane-d-or`)).headers.get('content-type') === 'image/webp', 'l\'illustration est servie');
verifier(!(await alveas.post('admin-chauve-supprimer', { id: 'crane-d-or' })).erreur && !db('public/catalogue/chauves/crane-d-or'), 'un chauve jamais tiré se supprime');
verifier(!(await alveas.post('admin-chauve-modifier', { id: plusTire, illimite: true })).erreur && db(`public/catalogue/chauves/${plusTire}/illimite`) === true, 'un chauve passe en tirage illimité');
verifier(!(await alveas.post('admin-chauve-modifier', { id: plusTire, illimite: false, tirage: 500 })).erreur && !db(`public/catalogue/chauves/${plusTire}/illimite`), 'et revient à un tirage limité');
verifier(!(await alveas.post('admin-chauve-modifier', { id: 'barbald', sans: ['nom', 'no', 'pirate'] })).erreur && JSON.stringify(db('public/catalogue/chauves/barbald/sans')) === '["nom","no"]', 'les textes d\'une carte se masquent un par un');
verifier((await alveas.post('admin-collection-supprimer', { id: 'ruines' })).statut === 400, 'une collection non vide ne se supprime pas');
verifier(!(await alveas.post('admin-collection-modifier', { id: 'ruines', nom: 'Les Ruines', gain: 500 })).erreur && db('public/catalogue/collections/ruines/gain') === 500, 'alveas modifie une collection');
verifier(!(await alveas.post('admin-booster-supprimer', { id: 'edition-doree' })).erreur && !db('public/catalogue/boosters/edition-doree'), 'alveas supprime un booster');
const avantForce = Object.values(db('copies')).filter(x => x.id === plusTire && x.proprio !== 'barbier'), unProprio = avantForce[0].proprio, refletsAvant = db(`joueurs/${unProprio}/reflets`);
const sf = await alveas.post('admin-chauve-supprimer', { id: plusTire, force: true });
verifier(sf.detruits === avantForce.length && !db(`public/catalogue/chauves/${plusTire}`) && !Object.values(db('copies') || {}).some(x => x.id === plusTire), 'la suppression forcée détruit la carte et ses exemplaires');
verifier(db(`joueurs/${unProprio}/reflets`) > refletsAvant, 'les propriétaires sont dédommagés');
verifier(!Object.values(db('public/encheres') || {}).some(e => e.id === plusTire) && !Object.values(db('public/catalogue/boosters')).some(b => (b.chauves || []).includes(plusTire)), 'plus aucune enchère ni booster ne la contient');

console.log("Crâne d'or");
const imgOr = 'data:image/webp;base64,' + Buffer.from('RIFF0000WEBP').toString('base64');
const or1 = await alveas.post('admin-chauve', { nom: 'Crâne d\'or S1', coll: '', rarete: 'or', pct: 100, tirage: 5, saison: 'Saison 1', image: imgOr, booster: 'saison-1' });
const or1b = await alveas.post('admin-chauve', { nom: 'Crâne d\'or S1 bis', coll: 'premiers', rarete: 'or', pct: 100, tirage: 5, saison: 'Saison 1', image: imgOr, booster: 'saison-1' });
const or2 = await alveas.post('admin-chauve', { nom: 'Crâne d\'or S2', coll: 'premiers', rarete: 'or', pct: 100, tirage: 5, saison: 'Saison 2', image: imgOr, booster: 'saison-1' });
verifier(db(`public/catalogue/chauves/${or1.id}/rarete`) === 'or' && db(`public/catalogue/chauves/${or1.id}/pct`) === 100 && !db(`public/catalogue/chauves/${or1.id}/coll`) && db(`public/catalogue/chauves/${or1.id}/saison`) === 'Saison 1', 'alveas crée un Crâne d\'or sans collection, avec sa chance en % et sa saison');
const idsOr = [or1.id, or1b.id, or2.id], orsDe = u => Object.values(db('copies')).filter(x => x.proprio === u && idsOr.includes(x.id));
const pOr = await bob.post('pack', { pack: 'saison-1' });
verifier(!pOr.erreur && orsDe(bob.uid).length === 2, 'dans un même booster, bob trouve un Crâne d\'or de chaque saison, pas plus');
verifier(new Set(orsDe(bob.uid).map(x => db(`public/catalogue/chauves/${x.id}/saison`))).size === 2, 'un de la Saison 1 et un de la Saison 2');
verifier(Object.keys(db(`joueurs/${bob.uid}/craneOr`)).length === 2, 'bob est marqué gagnant pour les deux saisons');
for (let k = 0; k < 3; k++) await bob.post('pack', { pack: 'saison-1' });
verifier(orsDe(bob.uid).length === 2, 'il a beau rouvrir des boosters, jamais un deuxième de la même saison');
const dede = await connecter('dede');
const simul = await Promise.all([1, 2, 3].map(() => dede.post('pack', { pack: 'saison-1' })));
const parSaison = {}; for (const x of orsDe(dede.uid)) { const sa = db(`public/catalogue/chauves/${x.id}/saison`); parSaison[sa] = (parSaison[sa] || 0) + 1; }
verifier(simul.filter(r => !r.erreur).length >= 2 && Object.values(parSaison).every(n => n === 1), 'trois boosters ouverts en même temps : jamais deux Crânes d\'or de la même saison');
const cuOr = Object.entries(db('copies')).find(([, x]) => x.proprio === bob.uid && x.lie)[0];
verifier((await bob.post('vendre', { copie: cuOr, depart: 10, duree: 0 })).statut === 400, 'un Crâne d\'or ne se vend pas aux enchères');
verifier((await bob.post('echange-proposer', { a: alveas.uid, donne: [cuOr], reflets: 0 })).statut === 400, 'ni en échange');
verifier(collectionsCompletes(Object.values(db('copies')).filter(x => x.proprio === bob.uid), db('public/catalogue')).length >= 0 && !collectionsCompletes([], { chauves: { a: { coll: 'z', rarete: 'or' } }, collections: { z: {} } }).length, 'un Crâne d\'or ne compte pas pour compléter une collection');

console.log('Pourcentages');
verifier((await alveas.post('admin-reglages', { taux: { commun: 50, rare: 30, epique: 10, legendaire: 5, unique: 1 }, chrome: 4 })).statut === 400, 'un total différent de 100 % est refusé');
verifier((await bob.post('admin-reglages', { taux: { commun: 100, rare: 0, epique: 0, legendaire: 0, unique: 0 } })).statut === 403, 'bob ne peut pas changer les pourcentages');
verifier(!(await alveas.post('admin-reglages', { taux: { commun: 0, rare: 0, epique: 100, legendaire: 0, unique: 0 }, chrome: 0 })).erreur && db('public/catalogue/reglages/taux/epique') === 1, 'alveas règle les pourcentages');
const enEpique = db('public/catalogue/boosters/saison-1/chauves').find(id => db(`public/catalogue/chauves/${id}/rarete`) !== 'or');
await alveas.post('admin-chauve-modifier', { id: enEpique, rarete: 'epique', tirage: 500 });
const fred = await connecter('fred'); for (let k = 0; k < 2; k++) await fred.post('pack', { pack: 'saison-1' });
const nouv = Object.values(db('copies')).filter(x => x.proprio === fred.uid && !x.lie);
verifier(nouv.length > 0 && nouv.every(x => db(`public/catalogue/chauves/${x.id}/rarete`) === 'epique' && !x.chrome), 'à 100 % d\'épique et 0 % de Chromé, les boosters ne donnent que des épiques non chromés');
await alveas.post('admin-reglages', { taux: { commun: 72, rare: 20, epique: 6.5, legendaire: 1.5, unique: 0 }, chrome: 4 });

console.log('PCA');
const eric = await connecter('eric'); await eric.post('pack', { pack: 'saison-1' });
const [cuE, xE] = Object.entries(db('copies')).find(([, x]) => x.proprio === eric.uid && !x.lie);
verifier(!!lireBase().chauvalerie.etats?.[cuE] && !db(`copies/${cuE}/note`), 'chaque exemplaire a un état caché dès sa sortie du booster');
const etatCache = lireBase().chauvalerie.etats[cuE];
const refAvant = db(`joueurs/${eric.uid}/reflets`), env = await eric.post('pca-envoyer', { copie: cuE });
verifier(!env.erreur && db(`copies/${cuE}/vente`) === 'pca' && db(`joueurs/${eric.uid}/reflets`) === refAvant - env.prix, 'eric envoie un chauve au PCA et paie le tarif de sa rareté');
verifier((await eric.post('vendre', { copie: cuE, depart: 10, duree: 0 })).statut === 400, 'un chauve au labo ne peut pas être vendu');
verifier((await eric.post('pca-reveler', { copie: cuE })).statut === 400, 'impossible de révéler avant la fin de l\'expertise');
verifier((await bob.post('admin-pca-terminer', { copie: cuE })).statut === 403, 'bob ne peut pas accélérer une expertise');
await alveas.post('admin-pca-terminer', { copie: cuE });
const rev = await eric.post('pca-reveler', { copie: cuE });
verifier(!rev.erreur && db(`copies/${cuE}/note/n`) === etatCache.n && !db(`copies/${cuE}/vente`), 'la note révélée est celle fixée au tirage');
verifier(db(`public/pop/${xE.id}/${etatCache.n}`) >= 1 && db(`copies/${cuE}/note/cert`) > 100000, 'le rapport de population et le numéro de certificat sont mis à jour');
verifier(!lireBase().chauvalerie.etats?.[cuE], 'l\'état caché disparaît une fois révélé');
verifier((await eric.post('pca-envoyer', { copie: cuE })).statut === 400, 'une carte sous coque ne repart pas au labo');
const { cote, NOTES } = await import('../public/js/regles.js');
verifier(cote({ note: { n: 10 } }, { rarete: 'rare' }) === Math.round(180 * NOTES[10].mult), 'une note change la cote');

console.log('Présence sur le stream');
const gabi = await connecter('gabi');
const cleP = (await alveas.post('admin-presence', {})).cle;
verifier(!!cleP && (await bob.post('admin-presence', {})).statut === 403, 'seul l\'admin obtient la clé de l\'overlay');
verifier((await fetch(`${URL0}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cle: 'mauvaise', simul: ['gabi'] }) })).status === 403, 'une mauvaise clé est refusée');
const presence = simul => fetch(`${URL0}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cle: cleP, simul }) }).then(r => r.json());
const rg0 = reflets(gabi), p1 = await presence(['gabi', 'inconnu-du-site']);
verifier(p1.credites === 1 && reflets(gabi) === rg0 + 10 && db(`joueurs/${gabi.uid}/presenceMin`) === 6, 'un relevé crédite 10 cheveux et 6 minutes aux inscrits présents dans le chat');
verifier(!!(await presence(['gabi'])).attente && reflets(gabi) === rg0 + 10, 'deux relevés trop rapprochés ne créditent qu\'une fois');
const bp = await alveas.post('admin-booster', { nom: 'Présence', prix: 999, nb: 1, actif: true, image: img, gratuit: true, taux: { commun: 100, rare: 0, epique: 0, legendaire: 0, unique: 0 } });
await alveas.post('admin-booster-cartes', { id: bp.id, chauves: [enEpique, ...db('public/catalogue/boosters/saison-1/chauves').filter(id => db(`public/catalogue/chauves/${id}/rarete`) === 'commun')] });
verifier(db(`public/catalogue/boosters/${bp.id}/prix`) === 0 && db(`public/catalogue/boosters/${bp.id}/taux/commun`) === 1, 'un booster de présence est gratuit, avec ses propres pourcentages');
verifier((await gabi.post('pack', { pack: bp.id })).statut === 400, 'sans 30 minutes de stream, pas de booster gratuit');
await secret(`joueurs/${gabi.uid}`, { presenceMin: 65 });
const rg1 = reflets(gabi), g1 = await gabi.post('pack', { pack: bp.id }), g2 = await gabi.post('pack', { pack: bp.id }), g3 = await gabi.post('pack', { pack: bp.id });
verifier(!g1.erreur && !g2.erreur && g3.statut === 400 && reflets(gabi) === rg1, '65 minutes de stream donnent 2 boosters gratuits, sans payer');
verifier([...g1.copies, ...g2.copies].every(x => db(`public/catalogue/chauves/${x.id}/rarete`) === 'commun'), 'les pourcentages du booster sont appliqués');
await secret(`joueurs/${gabi.uid}`, { presenceMin: 65 + 30 * 20 });
let n = 0; while (!(await gabi.post('pack', { pack: bp.id })).erreur && n < 30) n++;
verifier(n === 6, 'la réserve de boosters gratuits est plafonnée à 6');
verifier(db(`joueurs/${gabi.uid}/stats/gratuits`) === 8 && !(await gabi.post('succes', { id: 'gratuit1' })).erreur, 'les boosters de présence ouverts sont comptés pour les succès');
{ const { SUCCES, mesures } = await import('../public/js/regles.js');
  verifier(SUCCES.length >= 50 && new Set(SUCCES.map(x => x.id)).size === SUCCES.length, `${SUCCES.length} succès, tous différents`);
  const cat = { chauves: { a: { rarete: 'commun' }, b: { rarete: 'rare' }, u: { rarete: 'unique' }, o: { rarete: 'or' } }, collections: {} };
  const m = mesures({ stats: {}, vitrine: ['x'], souhaits: ['a'] }, [{ id: 'a' }, { id: 'u' }, { id: 'b', note: { n: 1 } }], cat);
  verifier(m.dexPct === 100 && m.uniques === 1 && m.rares === 1 && m.pcaNul === 1 && m.vitrine === 1 && m.souhaits === 1, 'les nouvelles mesures (ChauveDex hors uniques, raretés, PCA 1, vitrine, souhaits)');
  verifier(SUCCES.every(x => mesures({}, [], cat)[x.mesure] !== undefined), 'chaque succès a une mesure qui existe'); }

console.log('Broyeur');
const hugo = await connecter('hugo');
for (let i = 0; i < 4; i++) await hugo.post('pack', { pack: 'saison-1' });
const { doublons: dbl, broyeurDe: bdf } = await import('../public/js/regles.js');
const mesH = () => Object.entries(db('copies')).filter(([, x]) => x.proprio === hugo.uid).map(([uid, x]) => ({ ...x, uid }));
const avantH = mesH(), dH = dbl(avantH);
verifier(dH.length > 0 && dH.length === avantH.length - new Set(avantH.map(x => x.id)).size, 'les doublons sont les exemplaires en trop (on en garde un de chaque)');
const seul = avantH.find(x => avantH.filter(y => y.id === x.id).length === 1) || avantH.find(x => !dH.some(d => d.uid === x.uid));
verifier((await hugo.post('broyer', { copies: [seul.uid] })).statut === 400 && !!db(`copies/${seul.uid}`), 'le dernier exemplaire d\'un chauve ne se broie pas');
verifier((await bob.post('broyer', { copies: [dH[0].uid] })).statut === 400, 'on ne broie pas les chauves des autres');
const br = await hugo.post('broyer', { copies: dH.map(x => x.uid) });
const attendu = dH.reduce((t, x) => t + bdf(null).gain[db(`public/catalogue/chauves/${x.id}/rarete`)] * (x.chrome ? 3 : 1), 0);
verifier(br.broyes === dH.length && br.poussiere === attendu && db(`joueurs/${hugo.uid}/poussiere`) === attendu, 'broyer rapporte la poussière de chaque rareté (×3 pour un Chromé)');
verifier(dH.every(x => !db(`copies/${x.uid}`) && !lireBase().chauvalerie.etats?.[x.uid]), 'les doublons broyés disparaissent');
verifier(new Set(mesH().map(x => x.id)).size === new Set(avantH.map(x => x.id)).size, 'hugo garde un exemplaire de chaque chauve');
await secret(`joueurs/${hugo.uid}`, { poussiere: 49 });
verifier((await hugo.post('fabriquer', { id: Object.entries(db('public/catalogue/chauves')).find(([, c]) => c.rarete === 'commun')[0] })).statut === 400 && db(`joueurs/${hugo.uid}/poussiere`) === 49, 'sans assez de poussière, pas de fabrication');
await secret(`joueurs/${hugo.uid}`, { poussiere: 120 });
const unCommun = Object.entries(db('public/catalogue/chauves')).find(([, c]) => c.rarete === 'commun' && !c.retire)[0];
const emisAv = db(`public/emis/${unCommun}`) || 0, fb = await hugo.post('fabriquer', { id: unCommun });
verifier(!fb.erreur && db(`copies/${fb.copie.uid}/proprio`) === hugo.uid && db(`joueurs/${hugo.uid}/poussiere`) === 70 && db(`public/emis/${unCommun}`) === emisAv + 1, 'fabriquer un commun coûte 50 poussières et compte dans le tirage');
verifier(!!lireBase().chauvalerie.etats?.[fb.copie.uid], 'un chauve fabriqué a aussi un état PCA caché');
verifier((await bob.post('admin-broyeur', { gain: { commun: 1 } })).statut === 403, 'bob ne règle pas le Broyeur');
await alveas.post('admin-broyeur', { gain: { commun: 7, rare: 20, epique: 60, legendaire: 250, unique: 800 }, prix: { commun: 70, rare: 200, epique: 600, legendaire: '' , unique: '' }, chrome: 2 });
verifier(db('public/catalogue/reglages/broyeur/gain/commun') === 7 && db('public/catalogue/reglages/broyeur/prix/commun') === 70 && db('public/catalogue/reglages/broyeur/prix/legendaire') === undefined, 'alveas règle le Broyeur (vide = ne se fabrique pas)');
await alveas.post('admin-broyeur', {});

await alveas.post('admin-broyeur', { prix: { unique: 10 } });
verifier(db('public/catalogue/reglages/broyeur/prix/unique') === undefined, 'impossible de mettre un prix de fabrication aux uniques');
{ const unU = Object.entries(db('public/catalogue/chauves')).find(([, c]) => c.rarete === 'unique' || c.rarete === 'or');
  await secret(`joueurs/${hugo.uid}`, { poussiere: 99999 });
  if (unU) verifier((await hugo.post('fabriquer', { id: unU[0] })).statut === 400 && db(`joueurs/${hugo.uid}/poussiere`) === 99999, 'un unique ou un Crâne d\'or ne se fabrique jamais'); }
{ const idU = Object.entries(db('public/catalogue/chauves')).find(([, c]) => c.rarete === 'unique')?.[0] || 'u-test';
  if (!db(`public/catalogue/chauves/${idU}`)) await secret('public/catalogue/chauves', { [idU]: { nom: 'U', rarete: 'unique', coll: 'premiers', img: '' } });
  await secret('copies', { 'u-a': { id: idU, no: 1, proprio: hugo.uid, t: 1 }, 'u-b': { id: idU, no: 2, proprio: hugo.uid, t: 2 } });
  verifier((await hugo.post('broyer', { copies: ['u-b'] })).statut === 400 && !!db('copies/u-b'), 'un unique ne se broie pas, même en double');
  await secret('copies', { 'u-a': null, 'u-b': null }); }
await alveas.post('admin-broyeur', { gain: { unique: 999 } });
verifier(db('public/catalogue/reglages/broyeur/gain/unique') === undefined, 'impossible de régler une poussière pour les uniques');
await alveas.post('admin-broyeur', {});
console.log('Liste de souhaits');
const ids = Object.keys(db('public/catalogue/chauves'));
verifier((await hugo.post('souhait', { id: ids[0] })).souhaits?.includes(ids[0]), 'hugo ajoute un chauve à ses souhaits');
verifier((await hugo.post('souhait', { id: 'inconnu' })).statut === 400, 'un chauve inconnu est refusé');
for (const id of ids.slice(1, 5)) await hugo.post('souhait', { id });
verifier((await hugo.post('souhait', { id: ids[5] })).statut === 400 && db(`joueurs/${hugo.uid}/souhaits`).length === 5, 'cinq souhaits au maximum');
verifier(!(await hugo.post('souhait', { id: ids[0], garder: false })).souhaits.includes(ids[0]), 'hugo retire un souhait');

console.log('Alertes overlay');
verifier((await bob.post('admin-alertes', { min: 'rare', chrome: 'rare' })).statut === 403, 'bob ne règle pas les alertes');
verifier((await alveas.post('admin-alertes', { min: 'n-importe', chrome: 'rare' })).statut === 400, 'un réglage invalide est refusé');
await alveas.post('admin-alertes', { min: 'epique', chrome: 'aucun' });
verifier(db('public/catalogue/reglages/alertes/min') === 'epique' && db('public/catalogue/reglages/alertes/chrome') === 'aucun', 'alveas choisit ce que l\'overlay annonce');

console.log('Mode maintenance');
{ const jim = await connecter('jim'); await jim.post('pack', { pack: 'saison-1' });
  const cj = Object.entries(db('copies')).find(([, x]) => x.proprio === jim.uid && !x.lie)[0];
  const vj = await jim.post('vendre', { copie: cj, depart: 10, duree: 1 }), finAvant = db(`public/encheres/${vj.eid}/fin`);
  verifier((await jim.post('admin-maintenance', { actif: true })).statut === 403, 'seul l\'admin peut activer la maintenance');
  await alveas.post('admin-maintenance', { actif: true, message: 'On revient vite' });
  verifier(db('public/maintenance/actif') === true && db('public/maintenance/message') === 'On revient vite', 'alveas active la maintenance avec un message');
  const refus = await jim.post('pack', { pack: 'saison-1' });
  verifier(refus.statut === 503 && refus.maintenance === true, 'pendant la maintenance, les joueurs ne peuvent plus rien faire');
  verifier(!(await alveas.post('pack', { pack: 'saison-1' })).erreur, 'l\'admin, lui, peut toujours jouer');
  await secret(`public/encheres/${vj.eid}`, { fin: Date.now() - 1000 });
  await alveas.post('regler'); const rc = await alveas.post('cloturer', { eid: vj.eid });
  verifier(rc.resultat === 'maintenance' && db(`public/encheres/${vj.eid}/fini`) === false, 'aucune enchère ne se termine pendant la maintenance');
  await secret('public/maintenance', { depuis: Date.now() - 60000 });
  const off = await alveas.post('admin-maintenance', { actif: false });
  verifier(!db('public/maintenance') && off.prolongees >= 1 && db(`public/encheres/${vj.eid}/fin`) > Date.now() + 50000, 'à la réouverture, les enchères récupèrent le temps passé en maintenance');
  verifier(!(await jim.post('annuler-vente', { eid: vj.eid })).erreur, 'les joueurs peuvent rejouer après la réouverture'); }

console.log('Remise à zéro');
const ivy = await connecter('ivy'); await ivy.post('pack', { pack: 'saison-1' });
const copiesIvy = Object.entries(db('copies')).filter(([, x]) => x.proprio === ivy.uid);
const emisAvantR = Object.fromEntries(copiesIvy.map(([, x]) => [x.id, db(`public/emis/${x.id}`)]));
const venteIvy = await ivy.post('vendre', { copie: copiesIvy.find(([, x]) => !x.lie)[0], depart: 10, duree: 1 });
const rb0 = reflets(bob); await bob.post('miser', { eid: venteIvy.eid, montant: 10 });
verifier((await bob.post('admin-reset', { cible: ivy.uid, confirmation: 'REMISE A ZERO' })).statut === 403, 'bob ne peut rien remettre à zéro');
verifier((await alveas.post('admin-reset', { cible: ivy.uid, confirmation: 'oui' })).statut === 400, 'sans la phrase de confirmation, rien ne se passe');
const rz = await alveas.post('admin-reset', { cible: ivy.uid, confirmation: 'remise à zéro' });
verifier(rz.copies === copiesIvy.length && !Object.values(db('copies')).some(x => x.proprio === ivy.uid), 'les chauves du joueur disparaissent');
verifier(reflets(ivy) === 1500 && !db(`joueurs/${ivy.uid}/stats/packs`) && db(`joueurs/${ivy.uid}/login`) === 'ivy', 'son compte repart à 1 500 cheveux, sans stats');
verifier(copiesIvy.every(([, x]) => db(`public/emis/${x.id}`) < emisAvantR[x.id] || copiesIvy.filter(([, y]) => y.id === x.id).length > 1), 'ses exemplaires rendent leur place dans le tirage');
verifier(db(`public/encheres/${venteIvy.eid}/annulee`) === true && reflets(bob) === rb0, 'son enchère en cours est annulée et l\'enchérisseur remboursé');
const nbCat = Object.keys(db('public/catalogue/chauves')).length, nbJ = Object.keys(db('joueurs')).length;
const rt = await alveas.post('admin-reset', { cible: 'tout', confirmation: 'REMISE A ZERO' });
verifier(rt.joueurs === nbJ && !db('copies') && !db('public/emis') && !db('public/encheres') && !db('echanges'), 'tout le jeu repart de zéro');
verifier(Object.keys(db('public/catalogue/chauves')).length === nbCat && !!db('public/catalogue/boosters') && !!db('prive/presence/cle'), 'le catalogue, les boosters et la clé de l\'overlay sont gardés');
verifier(Object.keys(db('joueurs')).every(u => db(`joueurs/${u}/reflets`) === 1500) && !(await bob.post('pack', { pack: 'saison-1' })).erreur, 'chaque joueur garde son compte, repart à 1 500 et peut rejouer');

console.log(`\n${ok} réussis, ${ko} échoués`);
serveur.close(); serveurBase.close(); process.exit(ko ? 1 : 0);
