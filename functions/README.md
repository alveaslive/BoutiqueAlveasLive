# La Chauverie

Site de collection de chauves : packs révélés à la tondeuse, Chauvedex, collections, marché aux enchères en direct, échanges entre viewers, vitrines publiques, succès, classement des Déplumés et overlay OBS.

Même architecture que le PokéBot : **Cloudflare Pages + Functions** pour la connexion Twitch et toutes les actions, **Firebase Realtime Database** pour les données en direct. Les navigateurs ne font que **lire** la base ; tout ce qui touche aux reflets et aux chauves passe par les Functions, qui vérifient tout. Impossible de tricher depuis la console du navigateur.

## Organisation

```
public/              ← ce que Cloudflare sert
  index.html         le site
  overlay.html       l'overlay OBS
  js/regles.js       LES RÈGLES (taux, prix, succès, grades…) : le seul fichier à modifier pour équilibrer
  js/app.js          le site côté navigateur
  js/temps-reel.js   écoute temps réel de Firebase (sans SDK)
  js/carte.js        la carte de chauve (même rendu sur le site et l'overlay)
  carte.css          le style des cartes : un cadre par rareté, Unique en pleine illustration
  img/               illustrations des 9 chauves de départ + logo
functions/api/[action].js   toutes les routes /api/…
lib/actions.js       les actions du jeu (packs, enchères, échanges, succès, atelier…)
lib/firebase.js      accès à Firebase (REST + transactions)
lib/session.js       session signée dans un cookie (comme pb_session)
database.rules.json  règles de sécurité Firebase
dev/serveur.mjs      émulateur local (site + API + base en mémoire)
tests/scenario.mjs   145 vérifications à plusieurs joueurs
tests/charge.mjs     test de charge : 25 joueurs en même temps + contrôle de cohérence
tests/charge-navigateur.cjs  6 navigateurs ouverts pendant que 19 joueurs jouent
```

## Installation

### 1. Firebase (nouveau projet)
Il faut un **projet Firebase dédié**. Celui du PokéBot est ouvert en écriture à la racine, et Firebase ne permet pas de verrouiller une partie de la base si la racine est ouverte.
1. Crée un projet, puis une Realtime Database (région `europe-west1`).
2. Onglet **Règles** : colle le contenu de `database.rules.json`, publie.
3. **Paramètres du projet → Comptes de service → Codes secrets de la base de données** : copie le code secret (c'est `FIREBASE_SECRET`). Google le dit « ancien » mais il fonctionne toujours.

### 2. Application Twitch
Sur https://dev.twitch.tv/console, crée une application :
- URL de redirection OAuth : `https://TON-SITE.pages.dev/api/callback` (et ton domaine perso si tu en as un) ;
- note le **Client ID** et génère un **Client Secret**.

### 3. Cloudflare Pages
1. Pousse ce dossier sur GitHub (compte alveaslive), puis crée un projet Pages relié au dépôt.
2. Réglages de build : aucune commande, **répertoire de sortie : `public`**. Le dossier `functions/` est détecté tout seul.
3. Variables d'environnement (Production) :

| Variable | Valeur |
|---|---|
| `TWITCH_CLIENT_ID` | Client ID Twitch |
| `TWITCH_CLIENT_SECRET` | Client Secret Twitch (chiffrée) |
| `FIREBASE_DB_URL` | `https://TON-PROJET-default-rtdb.europe-west1.firebasedatabase.app` |
| `FIREBASE_SECRET` | le code secret de la base (chiffrée) |
| `SESSION_SECRET` | une longue phrase aléatoire (chiffrée) |
| `ADMIN_TWITCH_IDS` | ton identifiant Twitch **numérique** (plusieurs : séparés par des virgules) |

Ton identifiant numérique : connecte-toi une première fois sur le site, puis regarde dans Firebase le nom de ta fiche sous `chauvalerie/joueurs` (`tw_123456789` → `123456789`).

### 4. Premier lancement
Connecte-toi avec Twitch, ouvre l'**Atelier** et clique **Semer le catalogue** : les 9 chauves et leurs 3 collections sont créés.

### 5. Overlay OBS
Source navigateur, 1920 × 1080 :
```
https://TON-SITE.pages.dev/overlay.html?bandeau=1&min=rare&mise=300
```
- `min` : rareté minimale des packs annoncés (`commun`, `rare`, `epique`, `legendaire`). Les Chromés passent dès `rare`.
- `cle` : la clé de présence (onglet Stream de l'Atelier) ; l'overlay crédite alors les cheveux de stream.
- `mise` : affiche les mises à partir de ce montant (`0` pour aucune).
- `bandeau=1` : bandeau défilant des enchères en cours.
- `test=1` : joue des exemples pour régler la scène.
Les adjugés sont toujours annoncés. Après chaque déploiement : clic droit sur la source → Actualiser le cache.

## Tester en local
```
node dev/serveur.mjs
```
Puis ouvre `http://localhost:8788/api/dev-login?login=alveas` (admin) et, dans une fenêtre de navigation privée, `http://localhost:8788/api/dev-login?login=bob`. Les deux fenêtres se voient enchérir en direct. La connexion de test n'existe qu'avec `DEV=1`, jamais en production.

Tests automatiques : `node tests/scenario.mjs` (enchères simultanées, remboursements, échanges, droits admin…).

## Boosters
Tout se gère dans l'**Atelier** (réservé à ton compte) :
- **Nouveau booster** : image (format vertical 2:3, sur fond noir : le noir devient transparent sur le site), nom, prix, nombre de cartes, rareté garantie, en vente ou non.
- **Cartes** : coche les chauves que le booster peut contenir.
- **Nouveau chauve** : le menu « Dans le booster » l'ajoute directement au booster choisi.
- **Modifier** (liste Catalogue) : tout se change après coup, avec aperçu de la carte en direct : illustration, nom, rareté, tirage, collection, tirage illimité, bord de carte (celui d'une autre rareté si tu veux), couleur du bord, textes affichés sur la carte (nom, rareté, collection, numéro : chacun se masque), description, boosters, retiré ou non. Un chauve se supprime tant que personne n'en possède ; sinon on le retire.
- **Collections** et **boosters** se modifient et se suppriment aussi (une collection doit être vide pour être supprimée).

À l'ouverture, le booster se déchire, les cartes sortent face cachée et se retournent de la moins rare à la plus rare. Un légendaire et un unique ont chacun leur mise en scène (voir `revelerLegendaire` et `revelerUnique` dans `public/js/app.js`).

Le booster de départ « Saison 1 » contient les 9 chauves, 5 cartes par booster. Un booster ne tire que parmi ses cartes, avec les taux par rareté de `public/js/regles.js`.

## Pourcentages
L'onglet **Pourcentages** de l'Atelier règle la chance de chaque rareté par carte tirée (total 100 %) et la chance d'être Chromée. Les valeurs par défaut sont dans `public/js/regles.js`.

## Crâne d'or
Catégorie spéciale (rareté « Crâne d'or » dans l'Atelier). Une carte par saison, à mettre dans le booster de la saison.
- Chance de tirage réglable carte par carte, en % par carte tirée (0,05 % par défaut, `pctCraneOr` dans `public/js/regles.js`). Un Crâne d'or peut n'être dans aucune collection.
- Champ **Saison** sur chaque Crâne d'or : un joueur n'obtient qu'**un seul** Crâne d'or par saison, mais peut gagner celui de la saison suivante. Il est marqué en transaction, donc même deux boosters ouverts en même temps n'en donnent jamais deux de la même saison.
- Le Crâne d'or est lié au compte : ni vente, ni échange. Il ne compte pas pour compléter une collection.
- Les gagnants s'affichent dans l'Atelier (onglet Cartes) et dans le Panthéon, dernière page de l'album du ChauveDex.

## Cheveux de stream
La monnaie s'appelle les **Cheveux**. Pas de cadeau quotidien : on en gagne en regardant le live.
- L'overlay OBS, ouvert avec `&cle=…`, relève la liste du chat toutes les 6 minutes. Chaque joueur inscrit présent reçoit 10 cheveux (100 par heure) et 6 minutes de présence. Hors live, rien n'est crédité.
- Un **booster de présence** (case à cocher dans le booster) est gratuit : 1 gagné toutes les 30 minutes de stream, 6 en réserve au maximum.
- Réglages dans `JEU.presence` (`public/js/regles.js`). L'autorisation Twitch et l'adresse de l'overlay sont dans l'Atelier, onglet **Stream**.
- Le jeton Twitch de la chaîne est gardé dans `prive/` (illisible par les navigateurs).

## PCA (Polisseurs de Crânes Agréés)
- Chaque exemplaire reçoit un **état caché** à sa sortie du booster (note de 1 à 10 et quatre sous-notes), stocké dans `etats/`, illisible par les navigateurs.
- L'onglet **PCA** envoie un exemplaire à l'expertise : prix et durée selon la rareté (`JEU.pca` dans `public/js/regles.js`). Pendant l'expertise, l'exemplaire ne peut être ni vendu ni échangé.
- La révélation affiche les sous-notes puis la note ; la carte revient **sous coque** pour toujours. Une 10 sur un Chromé est une **Black Label**.
- La note multiplie la cote (`NOTES` dans `regles.js`), compte dans le score et dans trois succès. Le rapport de population est public.
- En live, l'admin peut terminer une expertise tout de suite (« Terminer maintenant »).
- Les exemplaires tirés avant le PCA reçoivent leur état au moment de leur expertise.

## Broyeur
Les joueurs broient leurs doublons contre de la **poussière de crâne**, puis fabriquent le chauve de leur choix. On garde toujours au moins un exemplaire de chaque chauve. Un chauve fabriqué n'est jamais Chromé, compte dans le tirage maximum et a son état PCA caché. Les uniques et le Crâne d'or ne se broient ni ne se fabriquent jamais. Les valeurs se règlent dans l'Atelier, onglet **Broyeur** (prix vide = la rareté ne se fabrique pas).

## Liste de souhaits et « Qui le possède ? »
Depuis la fiche d'un chauve : « Ajouter à mes souhaits » (5 au maximum, affichés sur la vitrine). La fiche montre qui le possède, ceux qui l'ont en double en premier, avec un bouton Échanger qui ouvre l'échange avec la carte déjà cochée. Sur la vitrine d'un autre, « Tu l'as en double » propose directement l'échange.

## Alertes de grosses sorties
L'overlay annonce les grosses cartes sorties des boosters, réglables dans l'Atelier, onglet **Stream** (par défaut : légendaires et plus, Chromés épiques et plus ; le Crâne d'or est toujours annoncé). Légendaire, Unique et Crâne d'or ont chacun leur mise en scène. Pour essayer : `/overlay.html?test=legendaire`, `?test=unique`, `?test=or`.

## Mode maintenance
Atelier, onglet **Maintenance** : toi seul vois le site et peux jouer, les autres voient un écran d'attente (avec ton message) et le serveur refuse leurs actions. Les enchères en cours sont mises en pause et récupèrent le temps perdu à la réouverture. Les cheveux de présence sur le stream continuent d'être crédités. Un bandeau rouge te le rappelle sur chaque page, avec un bouton pour rouvrir.

## Remise à zéro
Atelier, onglet **Remise à zéro** : remet ton compte, celui d'un testeur ou tout le jeu à zéro (il faut écrire REMISE A ZERO pour confirmer). Les cartes effacées rendent leur place dans le tirage. Le catalogue, les boosters, les collections, les réglages, les images et la clé de l'overlay sont toujours gardés. « Tout le jeu » est à faire juste avant le lancement : les comptes restent inscrits et repartent avec les cheveux de bienvenue.

## Tenue en charge
- `npm run charge` lance 25 joueurs qui ouvrent des boosters, misent, échangent et broient en même temps (avec une latence réseau simulée), puis vérifie qu'aucune carte ne reste bloquée, qu'aucun cheveu ne se crée ou ne se perd et qu'aucun tirage n'est dépassé.
- Chaque onglet ouvert n'utilise que **2 connexions en direct** à Firebase (l'offre gratuite Spark en autorise 100 en même temps, l'overlay compris).
- Si une action est interrompue en plein milieu, le serveur la reprend tout seul (enchère non réglée, échange resté « en cours »). Les enchères et échanges terminés depuis plus de 7 jours sont effacés.

## Bon à savoir
- **Clôture des enchères** : Cloudflare Pages n'a pas de tâche planifiée. Une enchère échue est clôturée par le premier visiteur du site ou par la prochaine action de n'importe qui. Le résultat ne change pas : toute mise arrivée après l'heure de fin est refusée.
- **Mises simultanées** : chaque mise est une transaction. Si deux personnes misent en même temps, une seule passe ; l'autre est prévenue et récupère ses reflets.
- **Relance** : une mise dans les 10 dernières secondes relance le chrono à 1 minute (réglable dans `public/js/regles.js` : `relance` et `prolongation`).
- **Historique** : chaque enchère garde ses 50 dernières mises (qui, combien, à quelle heure), visibles en direct en cliquant sur la carte.
- **Joueurs identifiés par leur id Twitch**, pas leur pseudo : un changement de pseudo ne crée plus de doublon.
- **Illustrations ajoutées à l'Atelier** : stockées dans Firebase (900 Ko max chacune), servies par `/api/image` avec un cache long.
- Le navigateur garde 5 flux temps réel ouverts au maximum : les navigateurs limitent les connexions simultanées vers un même serveur.
