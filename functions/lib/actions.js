/* =========================================================
   Toutes les actions du jeu, exécutées côté serveur.
   Chaque action reçoit (db, moi, corps, env) et renvoie un objet JSON.
   Les Cheveux (la monnaie) et les chauves ne bougent QUE par ici.
   ========================================================= */
import { JEU, RARETES, SUCCES, CATALOGUE_BASE, ORDRE_R, tirageMax, miseMin, cote, mesures, score, gradeDe, collectionsCompletes, tirerRarete, jourDe, estOr, tauxDe, chromeDe, chanceOr, tirerEtat, NOTES, blackLabel, gratuitsDispo, horsBroyeur, broyeurDe, poussiereDe, alertesDe } from '../public/js/regles.js';

export class Refus extends Error { constructor(msg, statut = 400){ super(msg); this.statut = statut; } }
const refuser = (msg, statut) => { throw new Refus(msg, statut); };
const rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtN = n => Math.floor(n).toLocaleString('fr-FR');
const mR = n => `${Math.floor(n).toLocaleString('fr-FR')} ${n > 1 ? JEU.monnaie.nom.toLowerCase() : JEU.monnaie.un}`;
const entier = (v, min = 0) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min ? n : null; };

/* ---------- lectures ---------- */
export async function catalogue(db){ return (await db.get('public/catalogue')) || { chauves: {}, collections: {} }; }
async function copiesDe(db, uid){
  const r = (await db.get('copies', { orderBy: 'proprio', equalTo: uid })) || {};
  return Object.entries(r).map(([cuid, x]) => ({ ...x, uid: cuid }));
}
async function joueur(db, uid){ return (await db.get(`joueurs/${uid}`)) || refuser('Joueur introuvable', 404); }

/* ---------- journal public : fil du Salon, overlay, notifications ---------- */
async function versFil(db, qui, texte, rar){ await db.push('public/fil', { qui, texte, rar: rar || 'commun', t: Date.now() }); await elaguer(db, 'public/fil', 60); }
async function versOverlay(db, ev){ await db.push('overlay', { ...ev, t: Date.now() }); await elaguer(db, 'overlay', 40); }
export async function notifier(db, uid, texte, type = 'info', lien = ''){ await db.push(`notifs/${uid}`, { texte, type, lien, t: Date.now(), lu: false }); await signaler(db, [uid]); await elaguer(db, `notifs/${uid}`, 40); }
/* « signal » : un compteur dans la fiche du joueur, que sa page écoute déjà. Quand il bouge, la page recharge
   ses chauves, ses échanges et ses alertes. Ça évite d'ouvrir un flux par sujet (Firebase limite les connexions). */
export async function signaler(db, uids){ const l = [...new Set(uids.filter(Boolean))]; if (l.length) await db.update('', Object.fromEntries(l.map(u => [`joueurs/${u}/signal`, db.INC(1)]))); }
async function elaguer(db, chemin, garder){
  if (Math.random() > .15) return;                 /* nettoyage de temps en temps seulement */
  const cles = Object.keys((await db.get(chemin, { shallow: true })) || {}).sort();
  if (cles.length > garder) await db.update(chemin, Object.fromEntries(cles.slice(0, cles.length - garder).map(k => [k, null])));
}

/* recalcule la calvitie (score) d'un joueur */
export async function majScore(db, uid, cat){
  const j = await db.get(`joueurs/${uid}`); if (!j) return;
  const sc = score(j, await copiesDe(db, uid), cat || await catalogue(db));
  await db.update(`joueurs/${uid}`, { score: sc, grade: gradeDe(sc).nom });
}

/* un pourcentage saisi dans l'Atelier : nombre entre 0 et 100 */
const lirePct = v => { const n = Number(String(v).replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > 100) refuser('Pourcentage invalide (entre 0 et 100)'); return Math.round(n * 1e4) / 1e4; };

/* jeton Twitch de la chaîne (lecture de la liste du chat), renouvelé quand il expire */
export async function jetonTwitch(db, env){
  const t = await db.get('prive/twitch'); if (!t?.refresh) return null;
  if (t.exp > Date.now() + 60e3) return t;
  const r = await (await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: t.refresh }) })).json();
  if (!r.access_token){ await db.del('prive/twitch'); return null; }
  const n = { ...t, acces: r.access_token, refresh: r.refresh_token || t.refresh, exp: Date.now() + (r.expires_in || 3600) * 1000 };
  await db.set('prive/twitch', n); return n;
}

/* ---------- Crâne d'or ---------- */
/* la saison d'un Crâne d'or : le champ « saison » de la carte, sinon la carte elle-même */
export const saisonOr = (c, id) => String(c.saison || id).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || id;
/* les Crânes d'or d'un joueur, par saison (convertit l'ancien format « un seul » si besoin) */
async function lireCranesOr(db, uid, cat){
  const v = (await db.get(`joueurs/${uid}/craneOr`)) || {};
  if (typeof v.id === 'string'){ const c = cat.chauves?.[v.id] || {}, n = { [saisonOr(c, v.id)]: v }; await db.set(`joueurs/${uid}/craneOr`, n); return n; }
  return v;
}

/* ---------- compte ---------- */
export async function inscrire(db, profil){
  const uid = `tw_${profil.id}`, j = await db.get(`joueurs/${uid}`);
  if (!j){
    await db.set(`joueurs/${uid}`, { login: profil.login, nom: profil.display_name || profil.login, avatar: profil.profile_image_url || '', reflets: JEU.depart,
      stats: {}, score: 0, grade: 'Chevelu', vitrine: [], devise: '', cree: Date.now() });
    await versFil(db, profil.display_name || profil.login, 'rejoint le Salon', 'commun');
  } else await db.update(`joueurs/${uid}`, { login: profil.login, nom: profil.display_name || profil.login, avatar: profil.profile_image_url || j.avatar || '' });
  return uid;
}

/* ---------- actions ---------- */
export const ACTIONS = {
  async pack(db, moi, { pack }){
    /* lectures en parallèle : catalogue, tirages, Crânes d'or du joueur, minutes de stream */
    const [cat, emisLu, orsLus, presenceMin] = await Promise.all([catalogue(db), db.get('public/emis'), db.get(`joueurs/${moi.uid}/craneOr`), db.get(`joueurs/${moi.uid}/presenceMin`)]);
    const emis = emisLu || {};
    const p = cat.boosters?.[pack]; if (!p || !p.actif) refuser('Booster inconnu');
    const dedans = new Set(p.chauves || []);
    const actifs = Object.entries(cat.chauves || {}).filter(([id, c]) => !c.retire && dedans.has(id));
    const dispo = rar => rar === 'or' ? [] : actifs.filter(([id, c]) => c.rarete === rar && (emis[id] || 0) < tirageMax(c));
    /* Crânes d'or : un seul par joueur et par saison ; on écarte ceux des saisons déjà gagnées */
    let mesOrs = typeof orsLus?.id === 'string' ? await lireCranesOr(db, moi.uid, cat) : (orsLus || {});
    const ors = () => actifs.filter(([id, c]) => estOr(c) && (emis[id] || 0) < tirageMax(c) && !mesOrs[saisonOr(c, id)]);
    if (!ORDRE_R.some(r => dispo(r).length)) refuser('Ce booster est épuisé : direction le Marché');
    if (p.gratuit){
      /* booster de présence : un jeton gagné toutes les 30 min de stream */
      const P = JEU.presence, gagnes = Math.floor((presenceMin || 0) / P.boosterToutes);
      const pris = await db.tx(`joueurs/${moi.uid}/gratuits`, v => { const u = Math.max(v || 0, gagnes - P.stockMax); return u < gagnes ? u + 1 : undefined; });
      if (!pris.ok) refuser(`Pas de booster gratuit pour l'instant : il s'en gagne un toutes les ${P.boosterToutes} minutes passées sur le stream`);
    } else {
      const paye = await db.tx(`joueurs/${moi.uid}/reflets`, v => (v || 0) >= p.prix ? v - p.prix : undefined);
      if (!paye.ok) refuser(`Il te manque ${mR(p.prix - (paye.valeur || 0))}`);
    }
    /* à partir d'ici le booster est payé : au moindre souci, on rembourse ce qui n'a pas été donné */
    const obtenus = [], maj = {}, illimites = {}; let gagneOr = null, resultat;
    try {
      for (let i = 0; i < p.nb; i++){
        if (ors().length){
          const [id, c] = ors()[Math.floor(rng() * ors().length)], cle = saisonOr(c, id);
          if (rng() < chanceOr(c)){
            /* le joueur est marqué pour cette saison d'abord, en transaction : impossible d'en obtenir deux de la même saison, même en ouvrant deux boosters en même temps */
            const marque = await db.tx(`joueurs/${moi.uid}/craneOr/${cle}`, v => v ? undefined : { id, t: Date.now() });
            mesOrs = { ...mesOrs, [cle]: marque.valeur || true };
            if (marque.ok){
              const t = await db.tx(`public/emis/${id}`, n => (n || 0) < tirageMax(c) ? (n || 0) + 1 : undefined);
              if (t.ok){ emis[id] = t.valeur; const copie = { id, no: t.valeur, chrome: false, lie: true, proprio: moi.uid, t: Date.now() };
                const cuid = nouvelId(); await db.update('', { [`copies/${cuid}`]: copie, [`etats/${cuid}`]: tirerEtat(rng), [`joueurs/${moi.uid}/craneOr/${cle}/copie`]: cuid });
                obtenus.push({ ...copie, uid: cuid }); gagneOr = c; continue; }
              emis[id] = tirageMax(c); await db.del(`joueurs/${moi.uid}/craneOr/${cle}`); delete mesOrs[cle];
            }
          }
        }
        const garantie = p.garantie && i === p.nb - 1 && !obtenus.some(x => ORDRE_R.indexOf(cat.chauves[x.id].rarete) >= 1) ? p.garantie : null;
        const rar = tirerRarete(rng, r => dispo(r).length, garantie, tauxDe(p.taux ? { taux: p.taux } : cat.reglages)); if (!rar) break;
        const liste = dispo(rar), [id, c] = liste[Math.floor(rng() * liste.length)];
        let no = 0;
        if (Number.isFinite(tirageMax(c))){
          /* carte limitée : le compteur se prend en transaction, pour ne jamais dépasser le tirage */
          const t = await db.tx(`public/emis/${id}`, n => (n || 0) < tirageMax(c) ? (n || 0) + 1 : undefined);
          if (!t.ok){ emis[id] = tirageMax(c); i--; if (!ORDRE_R.some(r => dispo(r).length)) break; continue; }
          emis[id] = no = t.valeur;
        } else illimites[id] = (illimites[id] || 0) + 1;   /* carte illimitée : un simple compteur, sans attente */
        const copie = { id, no, chrome: rng() < chromeDe(cat.reglages), proprio: moi.uid, t: Date.now() };
        const cuid = nouvelId(); maj[`copies/${cuid}`] = copie; maj[`etats/${cuid}`] = tirerEtat(rng); obtenus.push({ ...copie, uid: cuid });
      }
      /* tout s'écrit en une seule fois : les cartes, leur état caché, les compteurs et les stats */
      for (const [id, n] of Object.entries(illimites)) maj[`public/emis/${id}`] = db.INC(n);
      maj[`joueurs/${moi.uid}/stats/packs`] = db.INC(1);
      if (p.gratuit) maj[`joueurs/${moi.uid}/stats/gratuits`] = db.INC(1);
      const rembourse = p.gratuit ? 0 : Math.round(p.prix * (p.nb - obtenus.length) / p.nb);
      if (rembourse) maj[`joueurs/${moi.uid}/reflets`] = db.INC(rembourse);
      if (!obtenus.length){
        if (p.gratuit) await db.tx(`joueurs/${moi.uid}/gratuits`, v => Math.max(0, (v || 0) - 1));
        else await db.inc(`joueurs/${moi.uid}/reflets`, p.prix);
        refuser('Tous les chauves sont épuisés : direction le Marché');
      }
      await db.update('', maj);
      resultat = { copies: obtenus, rembourse };
    } catch (e){
      if (e instanceof Refus) throw e;
      /* rien n'a été écrit (l'écriture groupée est la dernière étape) : le booster est entièrement rendu */
      if (p.gratuit) await db.tx(`joueurs/${moi.uid}/gratuits`, v => Math.max(0, (v || 0) - 1)).catch(() => {});
      else await db.inc(`joueurs/${moi.uid}/reflets`, p.prix).catch(() => {});
      console.error(e);
      refuser('Le Salon est très demandé, réessaie dans un instant : ton booster t\'a été rendu', 503);
    }
    const top = obtenus.reduce((a, b) => (ORDRE_R.indexOf(cat.chauves[b.id].rarete) + (b.chrome ? .5 : 0)) > (ORDRE_R.indexOf(cat.chauves[a.id].rarete) + (a.chrome ? .5 : 0)) ? b : a);
    const ct = cat.chauves[top.id];
    await Promise.all([
      gagneOr ? versFil(db, moi.nom, `a trouvé le Crâne d'or ${ct.nom} ! Sa propre carte arrive la saison prochaine`, 'or') : versFil(db, moi.nom, `a obtenu ${ct.nom}${top.chrome ? ' Chromé' : ''}`, ct.rarete),
      ct.rarete !== 'commun' || top.chrome ? versOverlay(db, { type: 'pack', qui: moi.nom, chauve: top.id, nom: ct.nom, rarete: ct.rarete, no: top.no, tirage: ct.illimite ? 0 : tirageMax(ct), chrome: top.chrome, img: ct.img, cadre: ct.cadre || '', couleur: ct.couleur || '', sans: ct.sans || null }) : null,
      majScore(db, moi.uid, cat),
    ]);
    return resultat;
  },

  /* ---------- marché ---------- */
  async vendre(db, moi, { copie, depart, duree }){
    depart = entier(depart, 1) ?? refuser('Indique un prix de départ d\'au moins 1');
    const d = JEU.durees[entier(duree)] || refuser('Durée inconnue');
    const eid = nouvelId();
    if ((await db.get(`copies/${copie}/lie`))) refuser('Un Crâne d\'or est lié à ton compte : il ne se vend pas');
    const verrou = await db.tx(`copies/${copie}`, x => x && x.proprio === moi.uid && !x.vente ? { ...x, vente: eid } : undefined);
    if (!verrou.ok) refuser(verrou.valeur?.vente ? 'Ce chauve est déjà en vente ou dans un échange' : 'Ce chauve ne t\'appartient pas');
    const x = verrou.valeur, c = (await db.get(`public/catalogue/chauves/${x.id}`)) || {};
    await db.set(`public/encheres/${eid}`, { copie, id: x.id, no: x.no, chrome: !!x.chrome, note: x.note || null, vendeur: moi.uid, vendeurNom: moi.nom, depart, offre: 0, meneur: '', meneurNom: '', fin: Date.now() + d.ms, fini: false, debut: Date.now(), nb: 0 });
    await versFil(db, moi.nom, `met aux enchères ${c.nom || x.id}${x.note ? ` PCA ${x.note.n}` : ''}`, c.rarete);
    return { eid };
  },

  async miser(db, moi, { eid, montant }){
    montant = entier(montant, 1) ?? refuser('Mise invalide');
    const e = (await db.get(`public/encheres/${eid}`)) || refuser('Enchère introuvable', 404);
    if (e.fini || Date.now() >= e.fin) refuser('Cette enchère est terminée');
    if (e.vendeur === moi.uid) refuser('Tu ne peux pas enchérir sur ton propre chauve');
    if (montant < miseMin(e)) refuser(`Mise minimale : ${mR(miseMin(e))}`);
    const delta = e.meneur === moi.uid ? montant - e.offre : montant;
    const paye = await db.tx(`joueurs/${moi.uid}/reflets`, v => (v || 0) >= delta ? v - delta : undefined);
    if (!paye.ok) refuser(`Il te manque ${mR(delta - (paye.valeur || 0))}`);
    const maintenant = Date.now();
    const r = await db.tx(`public/encheres/${eid}`, cur => {
      if (!cur || cur.fini || maintenant >= cur.fin || cur.meneur !== e.meneur || cur.offre !== e.offre) return undefined;
      const mises = [...(cur.mises || []), { uid: moi.uid, nom: moi.nom, m: montant, t: maintenant }].slice(-JEU.historiqueMax);
      const relance = cur.fin - maintenant <= JEU.relance;
      return { ...cur, offre: montant, meneur: moi.uid, meneurNom: moi.nom, nb: (cur.nb || 0) + 1, mises, fin: relance ? maintenant + JEU.prolongation : cur.fin, relances: (cur.relances || 0) + (relance ? 1 : 0) };
    });
    if (!r.ok){
      await db.inc(`joueurs/${moi.uid}/reflets`, delta);
      const cur = r.valeur;
      refuser(!cur || cur.fini || maintenant >= cur.fin ? 'Cette enchère vient de se terminer' : `Quelqu'un a misé juste avant toi. Nouvelle mise minimale : ${mR(miseMin(cur))}`, 409);
    }
    const c = (await db.get(`public/catalogue/chauves/${e.id}`)) || { nom: e.id };
    if (e.meneur && e.meneur !== moi.uid){
      await db.inc(`joueurs/${e.meneur}/reflets`, e.offre);
      await notifier(db, e.meneur, `${moi.nom} a surenchéri sur ${c.nom} : ${mR(montant)}. Tes ${mR(e.offre)} te sont rendus.`, 'surenchere', eid);
    }
    if (e.vendeur) await notifier(db, e.vendeur, `Nouvelle mise sur ton ${c.nom} : ${mR(montant)} par ${moi.nom}`, 'mise', eid);
    await db.inc(`joueurs/${moi.uid}/stats/encheres`, 1);
    await versOverlay(db, { type: 'mise', qui: moi.nom, chauve: e.id, nom: c.nom, rarete: c.rarete, no: e.no, tirage: c.illimite ? 0 : tirageMax(c), chrome: e.chrome, img: c.img, cadre: c.cadre || '', couleur: c.couleur || '', sans: c.sans || null, montant, fin: r.valeur.fin });
    return { enchere: r.valeur };
  },

  async 'annuler-vente'(db, moi, { eid }){
    const r = await db.tx(`public/encheres/${eid}`, cur => cur && cur.vendeur === moi.uid && !cur.fini && !cur.meneur ? { ...cur, fini: true, annulee: true, fin: Date.now() } : undefined);
    if (!r.ok) refuser(r.valeur?.meneur ? 'Impossible : quelqu\'un a déjà misé' : 'Enchère introuvable ou terminée');
    await db.update(`copies/${r.valeur.copie}`, { vente: null });
    return { ok: true };
  },

  /* n'importe qui peut clôturer une enchère dont l'heure est passée */
  async cloturer(db, moi, { eid }){ return { resultat: await cloturer(db, eid) }; },
  async regler(db){ return { cloturees: await regler(db) }; },


  /* ---------- succès, collections, vitrine ---------- */
  async succes(db, moi, { id }){
    const s = SUCCES.find(x => x.id === id) || refuser('Succès inconnu');
    const cat = await catalogue(db), j = await joueur(db, moi.uid);
    if (mesures(j, await copiesDe(db, moi.uid), cat)[s.mesure] < s.cible) refuser('Ce succès n\'est pas encore rempli');
    const r = await db.tx(`joueurs/${moi.uid}/succes/${id}`, v => v ? undefined : Date.now());
    if (!r.ok) refuser('Déjà récupéré');
    await db.inc(`joueurs/${moi.uid}/reflets`, s.gain); await majScore(db, moi.uid, cat);
    return { gain: s.gain };
  },

  async collection(db, moi, { id }){
    const cat = await catalogue(db), co = cat.collections?.[id] || refuser('Collection inconnue');
    if (!collectionsCompletes(await copiesDe(db, moi.uid), cat).includes(id)) refuser('Collection incomplète');
    const r = await db.tx(`joueurs/${moi.uid}/collRecup/${id}`, v => v ? undefined : Date.now());
    if (!r.ok) refuser('Déjà récupérée');
    await db.inc(`joueurs/${moi.uid}/reflets`, co.gain || 0);
    return { gain: co.gain || 0 };
  },

  async vitrine(db, moi, { copies = [], devise = '' }){
    if (!Array.isArray(copies) || copies.length > JEU.vitrineMax) refuser(`Ta vitrine accueille ${JEU.vitrineMax} chauves au maximum`);
    const miennes = new Set((await copiesDe(db, moi.uid)).map(x => x.uid));
    if (copies.some(c => !miennes.has(c))) refuser('Un de ces chauves ne t\'appartient plus');
    await db.update(`joueurs/${moi.uid}`, { vitrine: [...new Set(copies)], devise: String(devise).slice(0, 80) });
    return { ok: true };
  },

  async 'notifs-lues'(db, moi){
    const n = (await db.get(`notifs/${moi.uid}`)) || {};
    const maj = Object.fromEntries(Object.entries(n).filter(([, x]) => !x.lu).map(([k]) => [`${k}/lu`, true]));
    if (Object.keys(maj).length) await db.update(`notifs/${moi.uid}`, maj);
    return { ok: true };
  },

  /* ---------- échanges ---------- */
  async 'echange-proposer'(db, moi, { a, donne = [], demande = [], reflets = 0 }){
    reflets = entier(reflets) ?? refuser('Montant invalide');
    if (!a || a === moi.uid) refuser('Choisis un autre joueur');
    const autre = await db.get(`joueurs/${a}`) || refuser('Joueur introuvable', 404);
    if (!Array.isArray(donne) || !Array.isArray(demande) || donne.length > JEU.echangeMaxChauves || demande.length > JEU.echangeMaxChauves) refuser(`${JEU.echangeMaxChauves} chauves au maximum de chaque côté`);
    if (!donne.length && !demande.length) refuser('Ajoute au moins un chauve à l\'échange');
    if (!donne.length && !reflets) refuser('Propose au moins un chauve ou des cheveux');
    const infos = async (liste, proprio) => Promise.all(liste.map(async cuid => {
      const x = await db.get(`copies/${cuid}`);
      if (!x || x.proprio !== proprio || x.vente) refuser('Un des chauves n\'est plus disponible');
      if (x.lie) refuser('Un Crâne d\'or est lié au compte de son propriétaire : il ne s\'échange pas');
      return { uid: cuid, id: x.id, no: x.no, chrome: !!x.chrome, note: x.note || null };
    }));
    const tid = nouvelId(), echange = { de: moi.uid, deNom: moi.nom, a, aNom: autre.nom, donne: await infos(donne, moi.uid), demande: await infos(demande, a), reflets, statut: 'attente', t: Date.now() };
    await db.set(`echanges/${tid}`, echange);
    await notifier(db, a, `${moi.nom} te propose un échange`, 'echange', tid);
    return { tid };
  },

  async 'echange-repondre'(db, moi, { tid, accepte }){
    const e = (await db.get(`echanges/${tid}`)) || refuser('Échange introuvable', 404);
    if (e.a !== moi.uid) refuser('Cet échange ne t\'est pas adressé', 403);
    if (!accepte){
      const r = await db.tx(`echanges/${tid}/statut`, s => s === 'attente' ? 'refuse' : undefined);
      if (!r.ok) refuser('Cet échange est déjà réglé');
      await Promise.all([db.update(`echanges/${tid}`, { regle: Date.now() }), notifier(db, e.de, `${moi.nom} a refusé ton échange`, 'echange', tid)]);
      return { statut: 'refuse' };
    }
    const lock = await db.tx(`echanges/${tid}/statut`, s => s === 'attente' ? 'en-cours' : undefined);
    if (!lock.ok) refuser('Cet échange est déjà réglé');
    await db.update(`echanges/${tid}`, { verrou: Date.now() });
    /* on verrouille tous les chauves en même temps ; au moindre souci on relâche tout */
    const tag = `echange:${tid}`, tous = [...(e.donne || []).map(x => [x, e.de]), ...(e.demande || []).map(x => [x, e.a])];
    const verrous = await Promise.all(tous.map(([x, proprio]) => db.tx(`copies/${x.uid}`, c => c && c.proprio === proprio && !c.vente ? { ...c, vente: tag } : undefined).catch(() => ({ ok: false }))));
    const pris = tous.filter((_, k) => verrous[k].ok).map(([x]) => x.uid);
    const annuler = async msg => {
      await Promise.all(pris.map(c => db.tx(`copies/${c}/vente`, v => v === tag ? null : undefined)));
      await db.update(`echanges/${tid}`, { statut: 'caduc', regle: Date.now() });
      await signaler(db, [e.de]);
      refuser(msg);
    };
    if (pris.length < tous.length) await annuler('Un des chauves n\'est plus disponible : échange annulé');
    let paye = false;
    try {
      if (e.reflets){
        const p = await db.tx(`joueurs/${e.de}/reflets`, v => (v || 0) >= e.reflets ? v - e.reflets : undefined);
        if (!p.ok) await annuler(`${e.deNom} n'a plus assez de cheveux : échange annulé`);
        paye = true;
      }
      /* l'échange se fait en une seule écriture : les chauves changent de main, l'échange passe à « accepté » */
      const maj = { [`echanges/${tid}/statut`]: 'accepte', [`echanges/${tid}/regle`]: Date.now(), [`joueurs/${e.de}/stats/echanges`]: db.INC(1), [`joueurs/${e.a}/stats/echanges`]: db.INC(1) };
      if (e.reflets) maj[`joueurs/${e.a}/reflets`] = db.INC(e.reflets);
      for (const x of e.donne || []){ maj[`copies/${x.uid}/proprio`] = e.a; maj[`copies/${x.uid}/vente`] = null; }
      for (const x of e.demande || []){ maj[`copies/${x.uid}/proprio`] = e.de; maj[`copies/${x.uid}/vente`] = null; }
      await db.update('', maj);
    } catch (err){
      if (err instanceof Refus) throw err;
      if (paye) await db.inc(`joueurs/${e.de}/reflets`, e.reflets).catch(() => {});
      await annuler('Le Salon est très demandé : échange annulé, rien n\'a bougé. Réessaie dans un instant');
    }
    const cat = await catalogue(db);
    await Promise.all([
      notifier(db, e.de, `${moi.nom} a accepté ton échange`, 'echange', tid), versFil(db, e.deNom, `et ${moi.nom} ont conclu un échange`, 'rare'),
      majScore(db, e.de, cat), majScore(db, e.a, cat), invaliderEchanges(db, tous.map(([x]) => x.uid), [e.de, e.a]),
    ]);
    return { statut: 'accepte' };
  },

  async 'echange-annuler'(db, moi, { tid }){
    const r = await db.tx(`echanges/${tid}`, e => e && e.de === moi.uid && e.statut === 'attente' ? { ...e, statut: 'annule', regle: Date.now() } : undefined);
    if (!r.ok) refuser('Impossible d\'annuler cet échange');
    await signaler(db, [r.valeur.a]);
    return { statut: 'annule' };
  },

  /* ---------- atelier (admin) ---------- */
  async 'admin-init'(db, moi){
    exigerAdmin(moi);
    const cat = await db.get('public/catalogue');
    if (cat?.chauves && Object.keys(cat.chauves).length){
      if (!cat.boosters) await db.set('public/catalogue/boosters', CATALOGUE_BASE.boosters);
      return { deja: true };
    }
    await db.set('public/catalogue', CATALOGUE_BASE);
    await db.update('public/emis', Object.fromEntries(Object.keys(CATALOGUE_BASE.chauves).map(id => [id, 0])));
    return { ok: true };
  },
  async 'admin-chauve'(db, moi, { nom, coll, rarete, tirage, classe = '', desc = '', image, booster, illimite, pct, saison }){
    exigerAdmin(moi);
    nom = String(nom || '').trim().slice(0, 40) || refuser('Donne un nom à ton chauve');
    if (!RARETES[rarete]) refuser('Rareté inconnue');
    if (rarete === 'or' && !coll) coll = '';
    else if (!(await db.get(`public/catalogue/collections/${coll}`))) refuser('Collection inconnue');
    if (!/^data:image\/(webp|jpeg|png);base64,/.test(image || '')) refuser('Ajoute une illustration');
    if (image.length > 900_000) refuser('Illustration trop lourde (900 Ko maximum)');
    let id = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || nouvelId();
    if (await db.get(`public/catalogue/chauves/${id}`)) id += '-' + nouvelId().slice(-4);
    await db.set(`images/${id}`, image);
    await db.set(`public/catalogue/chauves/${id}`, { nom, coll, rarete, illimite: illimite && rarete !== 'or' ? true : null, pct: rarete === 'or' ? lirePct(pct ?? JEU.pctCraneOr) : null, saison: rarete === 'or' ? String(saison || '').trim().slice(0, 40) || null : null, tirage: entier(tirage, 1) || RARETES[rarete].tirage, classe: String(classe).slice(0, 30), desc: String(desc).slice(0, 160), img: `/api/image?id=${id}&v=${Date.now().toString(36)}`, ordre: Date.now() });
    await db.set(`public/emis/${id}`, 0);
    if (booster && await db.get(`public/catalogue/boosters/${booster}`)) await db.tx(`public/catalogue/boosters/${booster}/chauves`, l => [...new Set([...(l || []), id])]);
    await versFil(db, 'Le Salon', `accueille un nouveau chauve : ${nom}`, rarete);
    return { id };
  },
  async 'admin-collection'(db, moi, { nom, desc = '', gain = 300 }){
    exigerAdmin(moi);
    nom = String(nom || '').trim().slice(0, 40) || refuser('Donne un nom à la collection');
    const id = 'c-' + nouvelId();
    await db.set(`public/catalogue/collections/${id}`, { nom, desc: String(desc).slice(0, 120), gain: entier(gain) ?? 0, ordre: Date.now() });
    return { id };
  },
  /* crée un booster, ou modifie celui dont on donne l'id */
  async 'admin-booster'(db, moi, { id, nom, prix, nb, garantie = '', actif = true, image, gratuit = false, taux = null }){
    exigerAdmin(moi);
    const existant = id ? (await db.get(`public/catalogue/boosters/${id}`)) || refuser('Booster inconnu') : null;
    nom = String(nom || '').trim().slice(0, 40) || refuser('Donne un nom au booster');
    prix = entier(prix, 0) ?? refuser('Prix invalide');
    nb = entier(nb, 1); if (!nb || nb > 10) refuser('Un booster contient de 1 à 10 cartes');
    if (garantie && !RARETES[garantie]) refuser('Rareté garantie inconnue');
    if (!existant && !image) refuser('Ajoute l\'image du booster');
    if (image){
      if (!/^data:image\/(webp|jpeg|png);base64,/.test(image)) refuser('Image invalide');
      if (image.length > 900_000) refuser('Image trop lourde (900 Ko maximum)');
    }
    if (!id){ id = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || nouvelId(); if (await db.get(`public/catalogue/boosters/${id}`)) id += '-' + nouvelId().slice(-4); }
    /* pourcentages propres à ce booster (total 100 %), sinon les pourcentages généraux */
    let t = null;
    if (taux && typeof taux === 'object'){ t = {}; let total = 0; for (const k of ORDRE_R.filter(k => k !== 'or')){ t[k] = lirePct(taux[k] ?? 0) / 100; total += t[k]; }
      if (Math.abs(total - 1) > .00001) refuser(`Le total des raretés du booster doit faire 100 % (actuellement ${Math.round(total * 1e5) / 1e3} %)`); }
    const maj = { nom, prix: gratuit ? 0 : prix, nb, garantie, actif: !!actif, gratuit: !!gratuit || null, taux: t };
    if (image){ await db.set(`images/b-${id}`, image); maj.img = `/api/image?id=b-${id}&v=${Date.now().toString(36)}`; }
    if (!existant){ maj.ordre = Date.now(); maj.chauves = []; }
    await db.update(`public/catalogue/boosters/${id}`, maj);
    return { id };
  },
  /* choisit les cartes qu'un booster peut contenir */
  async 'admin-booster-cartes'(db, moi, { id, chauves = [] }){
    exigerAdmin(moi);
    const cat = await catalogue(db); if (!cat.boosters?.[id]) refuser('Booster inconnu');
    if (!Array.isArray(chauves) || chauves.some(c => !cat.chauves?.[c])) refuser('Un de ces chauves n\'existe pas');
    await db.set(`public/catalogue/boosters/${id}/chauves`, [...new Set(chauves)]);
    return { nb: new Set(chauves).size };
  },
  /* modifie un chauve existant : seuls les champs envoyés changent */
  async 'admin-chauve-modifier'(db, moi, { id, nom, coll, rarete, tirage, desc, image, cadre, couleur, boosters, retire, illimite, sans, pct, saison }){
    exigerAdmin(moi);
    const cat = await catalogue(db), c = cat.chauves?.[id] || refuser('Chauve inconnu'), maj = {};
    if (nom !== undefined) maj.nom = String(nom).trim().slice(0, 40) || refuser('Donne un nom à ton chauve');
    if (coll !== undefined){ if (coll === '' && (rarete ?? c.rarete) === 'or') maj.coll = ''; else { if (!cat.collections?.[coll]) refuser('Collection inconnue'); maj.coll = coll; } }
    if (rarete !== undefined){ if (!RARETES[rarete]) refuser('Rareté inconnue'); maj.rarete = rarete; }
    if (sans !== undefined){ const l = (Array.isArray(sans) ? sans : []).filter(k => ['nom', 'rar', 'coll', 'no'].includes(k)); maj.sans = l.length ? [...new Set(l)] : null; }
    if (saison !== undefined) maj.saison = String(saison || '').trim().slice(0, 40) || null;
    if (pct !== undefined){ maj.pct = lirePct(pct); maj.chance = null; }
    if ((rarete ?? c.rarete) === 'or'){ if (illimite) refuser('Un Crâne d\'or ne peut pas être illimité'); maj.illimite = null; }
    if (illimite !== undefined && (rarete ?? c.rarete) !== 'or') maj.illimite = illimite ? true : null;
    if (tirage !== undefined && !illimite){
      const t = entier(tirage, 1) ?? refuser('Tirage invalide'), emis = (await db.get(`public/emis/${id}`)) || 0;
      if (t < emis) refuser(`Impossible : ${emis} exemplaires existent déjà`);
      maj.tirage = t;
    }
    if (desc !== undefined) maj.desc = String(desc).slice(0, 160);
    if (cadre !== undefined){ if (cadre && !RARETES[cadre]) refuser('Bord inconnu'); maj.cadre = cadre || null; }
    if (couleur !== undefined){ if (couleur && !/^#[0-9a-f]{6}$/i.test(couleur)) refuser('Couleur invalide'); maj.couleur = couleur || null; }
    if (retire !== undefined) maj.retire = !!retire;
    if (image){
      if (!/^data:image\/(webp|jpeg|png);base64,/.test(image)) refuser('Image invalide');
      if (image.length > 900_000) refuser('Illustration trop lourde (900 Ko maximum)');
      await db.set(`images/${id}`, image); maj.img = `/api/image?id=${id}&v=${Date.now().toString(36)}`;
    }
    if (Object.keys(maj).length) await db.update(`public/catalogue/chauves/${id}`, maj);
    if (Array.isArray(boosters)) for (const [bid, b] of Object.entries(cat.boosters || {})){
      const dedans = (b.chauves || []).includes(id), voulu = boosters.includes(bid);
      if (dedans !== voulu) await db.set(`public/catalogue/boosters/${bid}/chauves`, voulu ? [...(b.chauves || []), id] : b.chauves.filter(x => x !== id));
    }
    return { ok: true };
  },
  /* supprime définitivement un chauve que personne ne possède ; sinon il faut le retirer */
  async 'admin-chauve-supprimer'(db, moi, { id, force = false }){
    exigerAdmin(moi);
    const cat = await catalogue(db), c = cat.chauves?.[id] || refuser('Chauve inconnu');
    const copies = Object.entries((await db.get('copies', { orderBy: 'id', equalTo: id })) || {});
    /* les exemplaires revendus au Barbier n'appartiennent plus à personne : ils ne bloquent pas */
    const possedes = copies.filter(([, x]) => x.proprio && x.proprio !== 'barbier'), joueurs = [...new Set(possedes.map(([, x]) => x.proprio))];
    if (possedes.length && !force) refuser(`${possedes.length} exemplaire${possedes.length > 1 ? 's' : ''} chez ${joueurs.length} joueur${joueurs.length > 1 ? 's' : ''} : confirme la suppression forcée`, 409);
    /* suppression forcée : enchères annulées (meneur remboursé), exemplaires détruits, propriétaires dédommagés de la cote */
    for (const [eid, e] of Object.entries((await db.get('public/encheres')) || {})) if (e.id === id){
      if (!e.fini && e.meneur && e.offre){ await db.inc(`joueurs/${e.meneur}/reflets`, e.offre); await notifier(db, e.meneur, `L'enchère sur ${c.nom} est annulée : tes ${mR(e.offre)} te sont rendus`, 'vente', eid); }
      await db.del(`public/encheres/${eid}`);
    }
    for (const [cuid, x] of copies){
      await db.del(`copies/${cuid}`);
      if (!x.proprio || x.proprio === 'barbier') continue;
      const prix = cote(x, c); await db.inc(`joueurs/${x.proprio}/reflets`, prix);
      await notifier(db, x.proprio, `${c.nom} a été retiré du jeu : tu reçois ${mR(prix)} en dédommagement`, 'vente', id);
    }
    for (const uid of joueurs){
      const v = await db.get(`joueurs/${uid}/vitrine`), ids = new Set(copies.map(([k]) => k));
      if (Array.isArray(v) && v.some(k => ids.has(k))) await db.set(`joueurs/${uid}/vitrine`, v.filter(k => !ids.has(k)));
      await majScore(db, uid);
    }
    for (const [bid, b] of Object.entries(cat.boosters || {})) if ((b.chauves || []).includes(id)) await db.set(`public/catalogue/boosters/${bid}/chauves`, b.chauves.filter(x => x !== id));
    await db.del(`public/catalogue/chauves/${id}`); await db.del(`public/emis/${id}`); await db.del(`images/${id}`);
    return { ok: true, detruits: possedes.length };
  },
  async 'admin-collection-modifier'(db, moi, { id, nom, desc = '', gain = 0 }){
    exigerAdmin(moi);
    if (!(await db.get(`public/catalogue/collections/${id}`))) refuser('Collection inconnue');
    nom = String(nom || '').trim().slice(0, 40) || refuser('Donne un nom à la collection');
    await db.update(`public/catalogue/collections/${id}`, { nom, desc: String(desc).slice(0, 120), gain: entier(gain) ?? 0 });
    return { ok: true };
  },
  async 'admin-collection-supprimer'(db, moi, { id }){
    exigerAdmin(moi);
    const cat = await catalogue(db); if (!cat.collections?.[id]) refuser('Collection inconnue');
    const n = Object.values(cat.chauves || {}).filter(c => c.coll === id).length;
    if (n) refuser(`${n} chauve${n > 1 ? 's sont' : ' est'} encore dans cette collection : déplace-${n > 1 ? 'les' : 'le'} d'abord`);
    await db.del(`public/catalogue/collections/${id}`);
    return { ok: true };
  },
  async 'admin-booster-supprimer'(db, moi, { id }){
    exigerAdmin(moi);
    if (!(await db.get(`public/catalogue/boosters/${id}`))) refuser('Booster inconnu');
    await db.del(`public/catalogue/boosters/${id}`); await db.del(`images/b-${id}`);
    return { ok: true };
  },
  /* pourcentages de tirage par rareté (total 100 %) et chance d'être Chromé */
  async 'admin-reglages'(db, moi, { taux = {}, chrome }){
    exigerAdmin(moi);
    const t = {}; let total = 0;
    for (const k of ORDRE_R.filter(k => k !== 'or')){ t[k] = lirePct(taux[k] ?? RARETES[k].taux * 100); total += t[k]; }
    if (Math.abs(total - 100) > .001) refuser(`Le total des raretés doit faire 100 % (actuellement ${Math.round(total * 1000) / 1000} %)`);
    await db.update('public/catalogue/reglages', { taux: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 100])), chrome: lirePct(chrome ?? JEU.tauxChrome * 100) / 100 });
    return { ok: true };
  },
  /* Broyeur : poussière gagnée par rareté, prix de fabrication (vide = ne se fabrique pas), multiplicateur des Chromés */
  async 'admin-broyeur'(db, moi, { gain = {}, prix = {}, chrome }){
    exigerAdmin(moi);
    const g = {}, pr = {};
    for (const k of ORDRE_R.filter(k => k !== 'or' && k !== 'unique')){
      const v = entier(gain[k] ?? JEU.broyeur.gain[k] ?? 0); if (v === null) refuser('Poussière invalide'); g[k] = v;
      if (k === 'unique' || prix[k] === '' || prix[k] === null || prix[k] === false) continue;
      const w = entier(prix[k] ?? JEU.broyeur.prix[k], 1); if (w !== null) pr[k] = w;
    }
    const m = Number(chrome ?? JEU.broyeur.chrome); if (!Number.isFinite(m) || m < 1 || m > 20) refuser('Multiplicateur Chromé invalide (entre 1 et 20)');
    await db.set('public/catalogue/reglages/broyeur', { gain: g, prix: Object.keys(pr).length ? pr : { aucun: 0 }, chrome: m });
    return { ok: true };
  },
  /* alertes de l'overlay : rareté minimale annoncée, et rareté minimale pour annoncer un Chromé ('aucun' pour couper) */
  async 'admin-alertes'(db, moi, { min, chrome }){
    exigerAdmin(moi);
    const ok = v => v === 'aucun' || (ORDRE_R.includes(v) && v !== 'or');
    if (!ok(min) || !ok(chrome)) refuser('Réglage d\'alerte invalide');
    await db.set('public/catalogue/reglages/alertes', { min, chrome });
    return { ok: true };
  },

  /* ---------- mode maintenance : seul l'admin voit le site et peut jouer ----------
     Les enchères sont mises en pause : à la réouverture, elles récupèrent le temps passé en maintenance. */
  async 'admin-maintenance'(db, moi, { actif, message = '' }){
    exigerAdmin(moi);
    const avant = (await db.get('public/maintenance')) || {};
    if (actif){
      if (avant.actif) { await db.update('public/maintenance', { message: String(message).slice(0, 200) }); return { actif: true }; }
      await db.set('public/maintenance', { actif: true, message: String(message).slice(0, 200), depuis: Date.now() });
      return { actif: true };
    }
    if (!avant.actif) return { actif: false };
    const pause = Date.now() - (avant.depuis || Date.now());
    /* chaque enchère encore ouverte retrouve le temps qu'elle a perdu pendant la maintenance */
    const ouvertes = (await db.get('public/encheres', { orderBy: 'fini', equalTo: false })) || {};
    const maj = { 'public/maintenance': null };
    for (const [eid, e] of Object.entries(ouvertes)) maj[`public/encheres/${eid}/fin`] = Math.max(e.fin, avant.depuis || 0) + pause;
    await db.update('', maj);
    return { actif: false, prolongees: Object.keys(ouvertes).length };
  },

  /* ---------- remise à zéro (avant le lancement) ----------
     cible : 'moi', 'tout', ou l'uid d'un joueur. Le catalogue, les boosters, les réglages, les images et la clé de l'overlay ne bougent jamais. */
  async 'admin-reset'(db, moi, { cible = 'moi', confirmation = '' }){
    exigerAdmin(moi);
    if (String(confirmation).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') !== 'REMISE A ZERO') refuser('Écris REMISE A ZERO pour confirmer');
    const neuf = j => ({ login: j.login || '', nom: j.nom || '', avatar: j.avatar || '', reflets: JEU.depart, stats: {}, score: 0, grade: 'Chevelu', vitrine: [], devise: '', cree: j.cree || Date.now() });
    if (cible === 'tout'){
      const joueurs = (await db.get('joueurs')) || {};
      await db.update('', { copies: null, etats: null, echanges: null, notifs: null, overlay: null,
        'public/emis': null, 'public/pop': null, 'public/pca': null, 'public/fil': null, 'public/encheres': null, 'prive/presence/dernier': null });
      await db.set('joueurs', Object.fromEntries(Object.entries(joueurs).map(([u, j]) => [u, { ...neuf(j), signal: (j.signal || 0) + 1 }])));
      return { joueurs: Object.keys(joueurs).length };
    }
    const uid = cible === 'moi' ? moi.uid : String(cible);
    const j = await db.get(`joueurs/${uid}`); if (!j) refuser('Joueur introuvable', 404);
    const siennes = await copiesDe(db, uid), ids = new Set(siennes.map(x => x.uid));
    /* enchères en cours où il vend ou mène : annulées, l'enchérisseur d'un autre est remboursé */
    const ench = (await db.get('public/encheres', { orderBy: 'fini', equalTo: false })) || {};
    for (const [eid, e] of Object.entries(ench)){
      if (e.vendeur !== uid && e.meneur !== uid) continue;
      const r = await db.tx(`public/encheres/${eid}`, cur => cur && !cur.fini ? { ...cur, fini: true, annulee: true, fin: Date.now() } : undefined);
      if (!r.ok) continue;
      if (e.meneur && e.meneur !== uid) await db.inc(`joueurs/${e.meneur}/reflets`, e.offre || 0);
      if (!ids.has(e.copie)) await db.update(`copies/${e.copie}`, { vente: null });
    }
    /* échanges en attente avec lui : annulés */
    for (const champ of ['de', 'a']){
      const l = (await db.get('echanges', { orderBy: champ, equalTo: uid })) || {};
      for (const [tid, e] of Object.entries(l)) if (e.statut === 'attente') await db.update(`echanges/${tid}`, { statut: 'annule' });
    }
    /* ses exemplaires disparaissent et rendent leur place dans le tirage */
    const maj = { [`joueurs/${uid}`]: { ...neuf(j), signal: (j.signal || 0) + 1 }, [`notifs/${uid}`]: null };
    for (const x of siennes){ maj[`copies/${x.uid}`] = null; maj[`etats/${x.uid}`] = null; }
    await db.update('', maj);
    for (const x of siennes){
      await db.inc(`public/emis/${x.id}`, -1);
      if (x.note?.n) await db.inc(`public/pop/${x.id}/${x.note.n}`, -1);
    }
    return { copies: siennes.length };
  },

  /* ---------- Broyeur ---------- */
  async broyer(db, moi, { copies = [] }){
    if (!Array.isArray(copies) || !copies.length || copies.length > 200) refuser('Choisis entre 1 et 200 doublons');
    const [cat, miennes] = await Promise.all([catalogue(db), copiesDe(db, moi.uid)]);
    /* seuls les doublons se broient : il reste toujours au moins un exemplaire de chaque chauve */
    const demande = [...new Set(copies)], par = {}, pris = {};
    for (const x of miennes) par[x.id] = (par[x.id] || 0) + 1;
    for (const cuid of demande){
      const x = miennes.find(y => y.uid === cuid);
      if (!x || !cat.chauves?.[x.id]) refuser('Un de ces chauves ne t\'appartient pas');
      if (horsBroyeur(cat.chauves[x.id])) refuser(`${cat.chauves[x.id].nom} ne se broie pas : les uniques et les Crânes d'or n'entrent jamais dans le Broyeur`);
      if (x.vente || x.lie || x.pca) refuser(`${cat.chauves[x.id].nom} est en vente, au labo ou lié à ton compte`);
      pris[x.id] = (pris[x.id] || 0) + 1;
      if (pris[x.id] >= par[x.id]) refuser(`Tu dois garder au moins un ${cat.chauves[x.id].nom}`);
    }
    /* chaque doublon est retiré en transaction (deux broyages simultanés ne paient qu'une fois), tous en même temps */
    const r = await Promise.all(demande.map(cuid => db.tx(`copies/${cuid}`, y => y && y.proprio === moi.uid && !y.vente && !y.lie ? null : undefined).catch(() => ({ ok: false }))));
    const broyes = demande.filter((_, k) => r[k].ok);
    if (!broyes.length) refuser('Rien n\'a pu être broyé');
    const poussiere = broyes.reduce((t, cuid) => { const x = miennes.find(y => y.uid === cuid); return t + poussiereDe(x, cat.chauves[x.id], cat.reglages); }, 0), n = broyes.length;
    const j = await joueur(db, moi.uid), vit = (j.vitrine || []).filter(c => !broyes.includes(c));
    const maj = { [`joueurs/${moi.uid}/poussiere`]: db.INC(poussiere), [`joueurs/${moi.uid}/stats/broyes`]: db.INC(n) };
    for (const cuid of broyes) maj[`etats/${cuid}`] = null;
    if (vit.length !== (j.vitrine || []).length) maj[`joueurs/${moi.uid}/vitrine`] = vit;
    await db.update('', maj);
    await Promise.all([majScore(db, moi.uid, cat), invaliderEchanges(db, broyes, [moi.uid])]);
    return { broyes: n, poussiere };
  },
  async fabriquer(db, moi, { id }){
    const cat = await catalogue(db), c = cat.chauves?.[id];
    if (!c || c.retire) refuser('Chauve inconnu');
    const prix = broyeurDe(cat.reglages).prix[c.rarete];
    if (horsBroyeur(c) || !prix) refuser(`Les chauves ${RARETES[c.rarete].nom.toLowerCase()} ne se fabriquent pas`);
    const paye = await db.tx(`joueurs/${moi.uid}/poussiere`, v => (v || 0) >= prix ? v - prix : undefined);
    if (!paye.ok) refuser(`Il te manque ${fmtN(prix - (paye.valeur || 0))} poussières de crâne`);
    const t = await db.tx(`public/emis/${id}`, n => (n || 0) < tirageMax(c) ? (n || 0) + 1 : undefined);
    if (!t.ok){ await db.inc(`joueurs/${moi.uid}/poussiere`, prix); refuser('Ce chauve est épuisé : plus aucun exemplaire à fabriquer'); }
    const copie = { id, no: t.valeur, chrome: false, fabrique: true, proprio: moi.uid, t: Date.now() };
    const cuid = nouvelId(); await db.set(`copies/${cuid}`, copie); await db.set(`etats/${cuid}`, tirerEtat(rng));
    await db.inc(`joueurs/${moi.uid}/stats/fabriques`, 1);
    await versFil(db, moi.nom, `a fabriqué ${c.nom} au Broyeur`, c.rarete);
    await majScore(db, moi.uid, cat);
    return { copie: { ...copie, uid: cuid }, prix };
  },

  /* ---------- liste de souhaits ---------- */
  async souhait(db, moi, { id, garder = true }){
    const cat = await catalogue(db); if (!cat.chauves?.[id]) refuser('Chauve inconnu');
    const r = await db.tx(`joueurs/${moi.uid}/souhaits`, v => {
      const l = (Array.isArray(v) ? v : []).filter(x => x !== id && cat.chauves?.[x]);
      if (garder){ if (l.length >= JEU.souhaitsMax) return undefined; l.push(id); }
      return l;
    });
    if (!r.ok) refuser(`Ta liste de souhaits est pleine (${JEU.souhaitsMax} chauves) : retires-en un d'abord`);
    return { souhaits: r.valeur || [] };
  },
  /* ---------- PCA ---------- */
  async 'pca-envoyer'(db, moi, { copie }){
    const x = (await db.get(`copies/${copie}`)) || refuser('Chauve introuvable', 404);
    if (x.proprio !== moi.uid) refuser('Ce chauve ne t\'appartient pas');
    if (x.note) refuser('Ce chauve est déjà sous coque');
    if (x.vente) refuser('Ce chauve est déjà au labo, en vente ou dans un échange');
    const c = (await db.get(`public/catalogue/chauves/${x.id}`)) || {}, t = JEU.pca[c.rarete] || JEU.pca.commun;
    const paye = await db.tx(`joueurs/${moi.uid}/reflets`, v => (v || 0) >= t.prix ? v - t.prix : undefined);
    if (!paye.ok) refuser(`Il te manque ${mR(t.prix - (paye.valeur || 0))}`);
    const fin = Date.now() + t.duree * 60e3;
    const v = await db.tx(`copies/${copie}`, y => y && y.proprio === moi.uid && !y.vente && !y.note ? { ...y, vente: 'pca', pca: { debut: Date.now(), fin } } : undefined);
    if (!v.ok){ if (t.prix) await db.inc(`joueurs/${moi.uid}/reflets`, t.prix); refuser('Ce chauve n\'est plus disponible'); }
    return { fin, prix: t.prix };
  },
  async 'pca-reveler'(db, moi, { copie }){
    const x = (await db.get(`copies/${copie}`)) || refuser('Chauve introuvable', 404);
    if (x.proprio !== moi.uid || !x.pca) refuser('Ce chauve n\'est pas au labo');
    if (Date.now() < x.pca.fin) refuser('L\'expertise n\'est pas terminée');
    /* l'état a été fixé à la sortie du booster ; les anciens exemplaires reçoivent le leur maintenant */
    const etat = (await db.get(`etats/${copie}`)) || tirerEtat(rng);
    const cert = (await db.tx('public/pca/certificats', n => (n || 100000) + 1)).valeur;
    const note = { ...etat, cert, t: Date.now() };
    const r = await db.tx(`copies/${copie}`, y => y && y.proprio === moi.uid && y.pca && !y.note ? { ...y, note, pca: null, vente: null } : undefined);
    if (!r.ok) refuser('Expertise déjà révélée');
    await db.del(`etats/${copie}`);
    await db.inc(`public/pop/${x.id}/${note.n}`, 1); await db.inc(`joueurs/${moi.uid}/stats/expertises`, 1);
    /* compteurs gardés même si la carte est vendue ou broyée ensuite */
    const tag = note.n === 10 ? 'pca10' : note.n === 1 ? 'pca1' : null;
    if (note.n >= 9) await db.inc(`joueurs/${moi.uid}/stats/pca9`, 1);
    if (tag) await db.inc(`joueurs/${moi.uid}/stats/${tag}`, 1);
    if (blackLabel({ ...x, note })) await db.inc(`joueurs/${moi.uid}/stats/black`, 1);
    const c = (await db.get(`public/catalogue/chauves/${x.id}`)) || {}, bl = blackLabel({ ...x, note });
    if (note.n >= 9) await versFil(db, moi.nom, `obtient un PCA ${note.n}${bl ? ' Étiquette noire' : ''} sur ${c.nom}${x.chrome ? ' Chromé' : ''}`, note.n === 10 ? 'legendaire' : 'epique');
    if (note.n === 10) await versOverlay(db, { type: 'pca', qui: moi.nom, chauve: x.id, nom: c.nom, rarete: c.rarete, chrome: !!x.chrome, img: c.img, cadre: c.cadre || '', couleur: c.couleur || '', sans: c.sans || null, note: note.n, black: bl });
    await majScore(db, moi.uid);
    return { note, black: bl };
  },
  /* l'admin peut terminer une expertise tout de suite (révélation en live) */
  async 'admin-pca-terminer'(db, moi, { copie }){
    exigerAdmin(moi);
    const r = await db.tx(`copies/${copie}`, y => y?.pca ? { ...y, pca: { ...y.pca, fin: Date.now() } } : undefined);
    if (!r.ok) refuser('Ce chauve n\'est pas au labo');
    return { ok: true };
  },
  /* ---------- présence sur le stream ---------- */
  /* appelée par l'overlay toutes les minutes ; ne crédite qu'une fois par intervalle, et seulement si le live tourne */
  async presence(db, moi, { cle, simul }, env = {}){
    const conf = (await db.get('prive/presence')) || {};
    if (!conf.cle || cle !== conf.cle) refuser('Clé de présence invalide', 403);
    const P = JEU.presence, iv = P.intervalle * 60e3, maintenant = Date.now();
    const pas = await db.tx('prive/presence/dernier', v => !v || maintenant - v >= iv - 20e3 ? maintenant : undefined);
    if (!pas.ok) return { attente: Math.round((pas.valeur + iv - maintenant) / 1000) };
    let ids;
    if (env.DEV === '1' && Array.isArray(simul)) ids = simul.map(String);
    else {
      const tw = await jetonTwitch(db, env); if (!tw){ await db.del('prive/presence/dernier'); refuser('Twitch n\'est pas connecté pour la présence : passe par l\'Atelier', 409); }
      const h = { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tw.acces}` };
      const live = (await (await fetch(`https://api.twitch.tv/helix/streams?user_id=${tw.id}`, { headers: h })).json()).data?.length;
      if (!live) return { horsLigne: true };
      ids = []; let curseur = '';
      do { const r = await (await fetch(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${tw.id}&moderator_id=${tw.id}&first=1000${curseur ? `&after=${curseur}` : ''}`, { headers: h })).json();
        ids.push(...(r.data || []).map(u => u.user_id)); curseur = r.pagination?.cursor || ''; } while (curseur && ids.length < 20000);
    }
    /* seuls les spectateurs qui ont déjà un compte sur le site sont crédités */
    const inscrits = new Set(Object.keys((await db.get('joueurs', { shallow: 'true' })) || {}));
    const gain = Math.round(P.parHeure * P.intervalle / 60), cibles = [...new Set(ids)].map(id => `tw_${id}`).filter(u => inscrits.has(u)), maj = {};
    for (const u of cibles){ maj[`joueurs/${u}/reflets`] = { '.sv': { increment: gain } }; maj[`joueurs/${u}/presenceMin`] = { '.sv': { increment: P.intervalle } }; }
    if (cibles.length) await db.update('', maj);
    await db.update('prive/presence', { credites: cibles.length, spectateurs: ids.length });
    return { credites: cibles.length, spectateurs: ids.length, gain };
  },
  async 'admin-presence'(db, moi, { nouvelleCle }){
    exigerAdmin(moi);
    let conf = (await db.get('prive/presence')) || {};
    if (nouvelleCle || !conf.cle){ conf.cle = [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join(''); await db.update('prive/presence', { cle: conf.cle }); }
    const tw = await db.get('prive/twitch');
    return { cle: conf.cle, dernier: conf.dernier || 0, credites: conf.credites || 0, spectateurs: conf.spectateurs || 0, twitch: tw ? { login: tw.login } : null };
  },
  async 'admin-retirer'(db, moi, { id, retire = true }){
    exigerAdmin(moi);
    if (!(await db.get(`public/catalogue/chauves/${id}`))) refuser('Chauve inconnu');
    await db.update(`public/catalogue/chauves/${id}`, { retire: !!retire });
    return { ok: true };
  },
};
/* actions possibles sans être connecté */
export const PUBLIQUES = new Set(['cloturer', 'regler', 'presence']);

function exigerAdmin(moi){ if (!moi.admin) refuser('Réservé au maître du Salon', 403); }

/* ---------- clôture des enchères ---------- */
export async function cloturer(db, eid){
  if (await enMaintenance(db)) return 'maintenance';
  /* « regle: 'attente' » est posé en même temps que « fini » : si le règlement est interrompu, regler() le reprend */
  const r = await db.tx(`public/encheres/${eid}`, cur => !cur || cur.fini || Date.now() < cur.fin ? undefined : { ...cur, fini: true, regle: 'attente' });
  if (!r.ok) return r.valeur ? (r.valeur.fini ? 'deja' : 'en-cours') : 'introuvable';
  return reglerVente(db, eid, r.valeur);
}
/* règlement d'une enchère terminée, en une seule écriture groupée (le chauve, l'argent et les stats bougent ensemble) */
async function reglerVente(db, eid, e){
  const c = (await db.get(`public/catalogue/chauves/${e.id}`)) || { nom: e.id, rarete: 'commun' };
  if (!e.meneur){
    await db.update('', { [`copies/${e.copie}/vente`]: null, [`public/encheres/${eid}/regle`]: true });
    await notifier(db, e.vendeur, `Aucune offre pour ton ${c.nom} : il revient dans ta collection`, 'vente', eid);
    return 'sans-offre';
  }
  const net = Math.round(e.offre * (1 - JEU.taxe));
  await db.update('', {
    [`copies/${e.copie}/proprio`]: e.meneur, [`copies/${e.copie}/vente`]: null, [`public/encheres/${eid}/regle`]: true,
    [`joueurs/${e.vendeur}/reflets`]: db.INC(net), [`joueurs/${e.vendeur}/stats/ventes`]: db.INC(1), [`joueurs/${e.vendeur}/stats/gainsVentes`]: db.INC(net),
    [`joueurs/${e.meneur}/stats/adjuges`]: db.INC(1),
  });
  const cat = await catalogue(db);
  await Promise.all([
    notifier(db, e.vendeur, `${c.nom} vendu à ${e.meneurNom} : +${mR(net)} (taxe du Marché déduite)`, 'vente', eid),
    notifier(db, e.meneur, `Adjugé ! ${c.nom} est à toi pour ${mR(e.offre)}`, 'adjuge', eid),
    versFil(db, e.meneurNom, `a remporté ${c.nom} pour ${Math.floor(e.offre).toLocaleString('fr-FR')}`, c.rarete),
    versOverlay(db, { type: 'adjuge', qui: e.meneurNom, vendeur: e.vendeurNom, chauve: e.id, nom: c.nom, rarete: c.rarete, no: e.no, tirage: c.illimite ? 0 : tirageMax(c), chrome: e.chrome, img: c.img, cadre: c.cadre || '', couleur: c.couleur || '', sans: c.sans || null, montant: e.offre }),
    majScore(db, e.vendeur, cat), majScore(db, e.meneur, cat), invaliderEchanges(db, [e.copie], [e.vendeur]),
  ]);
  return 'adjuge';
}
/* les échanges en attente qui comptaient sur des chauves partis (vendus, échangés, broyés) sont annulés tout de suite */
export async function invaliderEchanges(db, copies, joueurs){
  const partis = new Set(copies); if (!partis.size) return;
  const listes = await Promise.all([...new Set(joueurs)].flatMap(u => [db.get('echanges', { orderBy: 'de', equalTo: u }), db.get('echanges', { orderBy: 'a', equalTo: u })]));
  const vus = new Set();
  for (const l of listes) for (const [tid, e] of Object.entries(l || {})){
    if (vus.has(tid) || e.statut !== 'attente') continue; vus.add(tid);
    if (![...(e.donne || []), ...(e.demande || [])].some(x => partis.has(x.uid))) continue;
    const r = await db.tx(`echanges/${tid}/statut`, s => s === 'attente' ? 'caduc' : undefined);
    if (r.ok){ await db.update(`echanges/${tid}`, { regle: Date.now() }); await signaler(db, [e.a]); await notifier(db, e.de, `Ton échange avec ${e.aNom} est annulé : un des chauves n'est plus disponible`, 'echange', tid); }
  }
}
export const enMaintenance = async db => !!(await db.get('public/maintenance/actif'));
export async function regler(db){
  if (await enMaintenance(db)) return 0;   /* pendant la maintenance, aucune enchère ne se termine */
  const ouvertes = (await db.get('public/encheres', { orderBy: 'fini', equalTo: false })) || {}, maintenant = Date.now();
  const echues = Object.entries(ouvertes).filter(([, e]) => e.fin <= maintenant).map(([k]) => k);
  await Promise.all(echues.map(eid => cloturer(db, eid)));
  if (Math.random() < .1) await reparer(db, maintenant);
  return echues.length;
}
/* filet de sécurité, de temps en temps : reprend un règlement interrompu et efface les vieilles enchères */
async function reparer(db, maintenant){
  const finies = (await db.get('public/encheres', { orderBy: 'fini', equalTo: true })) || {};
  for (const [eid, e] of Object.entries(finies)){
    if (e.regle === 'attente' && e.fin < maintenant - 120e3){
      const r = await db.tx(`public/encheres/${eid}/regle`, v => v === 'attente' ? 'reprise' : undefined);
      if (r.ok) await reglerVente(db, eid, e);
    }
  }
  const vieilles = Object.entries(finies).filter(([, e]) => e.fin < maintenant - 7 * 864e5 && e.regle !== 'attente').map(([k]) => [k, null]);
  if (vieilles.length) await db.update('public/encheres', Object.fromEntries(vieilles));
  /* un échange resté « en cours » (accord interrompu) : on relâche ses chauves */
  const enCours = (await db.get('echanges', { orderBy: 'statut', equalTo: 'en-cours' }).catch(() => null)) || {};
  for (const [tid, e] of Object.entries(enCours)){
    if ((e.verrou || e.t) > maintenant - 120e3) continue;
    const tag = `echange:${tid}`;
    for (const x of [...(e.donne || []), ...(e.demande || [])]) await db.tx(`copies/${x.uid}/vente`, v => v === tag ? null : undefined);
    await db.tx(`echanges/${tid}/statut`, s => s === 'en-cours' ? 'attente' : undefined);
  }
  /* les échanges réglés depuis plus de 7 jours sont effacés (chacun télécharge la liste des échanges) */
  const regles = await Promise.all(['accepte', 'refuse', 'annule', 'caduc'].map(st => db.get('echanges', { orderBy: 'statut', equalTo: st }).catch(() => null)));
  const anciens = regles.flatMap(l => Object.entries(l || {})).filter(([, e]) => (e.regle || e.t) < maintenant - 7 * 864e5).map(([k]) => [k, null]);
  if (anciens.length) await db.update('echanges', Object.fromEntries(anciens));
}
