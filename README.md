# Rapports d'inspection pour Grist

[Une phrase : ce que l'application permet de faire, et pour qui.]

> **Données de démonstration** : [inventées / issues de l'open data : source, licence, date]. Aucune donnée
> personnelle. Pour un usage réel, installer un document neuf avec ses propres données (§ 9).

## Sommaire
1. [L'application et ses widgets](#1-lapplication-et-ses-widgets)
2. [Installation rapide (modèle .grist)](#2-installation-rapide-modèle-grist)
3. [Tables Grist](#3-tables-grist)
4. [Installation manuelle](#4-installation-manuelle)
5. [Droits d'accès](#5-droits-daccès)
6. [Pages et widgets](#6-pages-et-widgets)
7. [Partager avec des collègues](#7-partager-avec-des-collègues)
8. [Sauvegarder, déplacer ou copier le document](#8-sauvegarder-déplacer-ou-copier-le-document)
9. [Utilisation](#9-utilisation)
10. [Dépannage](#10-dépannage)
11. [Limites connues](#11-limites-connues)

## 1. L'application et ses widgets

L'application s'ouvre sur **une seule page Grist**, sans l'interface de Grist (mode épuré). Un menu permet de passer
d'un écran à l'autre sans rechargement. Ce que chacun·e voit et peut modifier dépend de son rôle.

Page d'accueil : https://grist-rapports-app.vercel.app/

| Écran | Widget | Rôle |
|---|---|---|
| Application | `https://grist-rapports-app.vercel.app/app/` | Menu et écrans (page unique) |
| Administration | `https://grist-rapports-app.vercel.app/admin/` | Mon compte ; comptes, rôles, permissions, contrôles (admins) |
| [Écran] | `https://grist-rapports-app.vercel.app/[dossier]/` | [ …] |

## 2. Installation rapide (modèle .grist)

1. Télécharger [`grist-rapports-app-modele.grist`](installation/modele/grist-rapports-app-modele.grist).
2. Dans Grist : **Ajouter → Importer un document** → le fichier.
3. Table `Utilisateurs` : ajouter **sa propre ligne**. L'e-mail doit être **exactement** celui de son compte Grist,
   majuscules comprises. Rôle `Administrateur·trice`, Actif coché.
4. Ouvrir chaque page. Si Grist le demande, accorder l'**accès complet** au widget.
5. Partager le document (§ 7).

Le modèle contient les tables, les liaisons, les formules, les règles d'accès, les pages et les données de
démonstration. Il ne contient ni le partage, ni l'historique.

## 3. Tables Grist

[Schéma des liens.]

<!-- schema:tables -->
#### `Personnes` — fiches des personnes (annuaire) ; Utilisateurs.Personne y renvoie

| Colonne | Type | Rôle |
|---|---|---|
| `Prenom` | Texte | Prénom |
| `Nom` | Texte | Nom |
| `Email` | Texte | unique ; comparé à user.Email par les règles « ma fiche » |
| `Nom_complet` | Texte (formule) | colonne affichée des références |

#### `Projets` — projets suivis (gabarit liste / fiche)

| Colonne | Type | Rôle |
|---|---|---|
| `Titre` | Texte | unique |
| `Statut` | Choix | Statut |
| `Responsables` | Liste de références → Personnes | portée « Limité » des Contributeur·trices |
| `Echeance` | Date | Échéance |
| `Description` | Texte | Description |

#### `Utilisateurs` — comptes d'accès (SPEC § 5.2) ; absent ou inactif = aucun droit

| Colonne | Type | Rôle |
|---|---|---|
| `Email` | Texte | exactement user.Email, majuscules comprises |
| `Roles` | Liste de choix | Rôles |
| `Personne` | Référence → Personnes | fiche liée (droits « Limité ») |
| `Actif` | Booléen | Actif |
| `Droits` | Any (formule) | "Table:Action:Niveau", lu par les règles d'accès |
| `Moi` | Booléen (formule) | vrai seulement sur sa ligne (règle de colonne) : qui suis-je |

#### `Permissions` — matrice rôle × table de données (SPEC § 5.2)

| Colonne | Type | Rôle |
|---|---|---|
| `Role` | Choix | Rôle |
| `Table` | Choix | Table |
| `Lire` | Choix | Lire |
| `Creer` | Choix | Créer |
| `Modifier` | Choix | Modifier |
| `Supprimer` | Choix | Supprimer |

#### `Navigation` — menu de l'application (SPEC § 6.3)

| Colonne | Type | Rôle |
|---|---|---|
| `Libelle` | Texte | Libellé |
| `Widget` | Choix | Écran |
| `Ordre` | Numérique | Ordre |
| `Roles` | Liste de choix | vide = tout le monde |
| `Visible` | Booléen | Visible |
<!-- /schema:tables -->

## 4. Installation manuelle

[Temps A : import des CSV ; temps B : types et références, dans l'ordre ; temps C : formules ; ajout de son compte ;
contrôles. Rappeler les pièges (SPEC § 4.4) : `Moi` = colonne **formule** `True` (Booléen) ; délier l'identifiant du
libellé avant de changer un libellé ; vérifier que chaque formule longue est dans **sa** colonne.]

## 5. Droits d'accès

[Principe : sécurité par les règles d'accès Grist, adaptation des widgets ; rôles et matrice initiale ; règles à
saisir (attribut `Profil`, D1-D4, règles des tables, règles « Limité », tables d'administration) ; ordre d'examen (colonne, puis table, puis règles par défaut) et
cases vides qui passent la décision aux règles suivantes ; tests avec « Voir en tant que ».]

**Raccourci pour les propriétaires du document** : dans l'Administration, onglet *Mon compte*, cocher « Voir en tant
que » dans le menu de l'application (option de ce navigateur). Le menu propose alors la liste des comptes actifs, et
Grist recharge l'application vue par le compte choisi (retour par « moi (vue normale) » ou par le bandeau de Grist).
L'adresse de la page est calculée ; à défaut, l'application utilise `ADRESSE_SECOURS` (dans `app/index.html`), à
renseigner pour son document.

## 6. Pages et widgets

[Page « Application » (widget `app/`, table `Navigation`, accès complet) ; pages individuelles ; adresse à ouvrir :
`…/p/<n>?style=singlePage`.]

## 7. Partager avec des collègues

1. **Partager le document** : Éditeur pour qui écrit, Lecteur pour les autres.
2. **Déclarer chaque collègue** dans l'Administration (onglet *Accès*) : e-mail exact, rôles, fiche si besoin.
3. **Tester** avec *Règles d'accès → Voir en tant que*, puis envoyer le lien de la page d'accueil.

## 8. Sauvegarder, déplacer ou copier le document

- **Télécharger le document (.grist)** avant toute opération importante, et régulièrement. Il contient tout :
  données, formules, règles d'accès, pages et widgets. Le ranger dans un espace sûr et non public.
- **Dupliquer le document** avant une grosse modification ; **Historique des versions** pour revenir en arrière.
- Déplacer ou copier : *Importer un document* depuis le `.grist`. Le partage, l'adresse et l'historique ne suivent
  pas. Vérifier qui est propriétaire de l'espace, car un·e propriétaire a tous les droits. Mettre à jour les liens de la page d'accueil.

## 9. Utilisation

[Un paragraphe par écran.]

## 10. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| L'application est vide | pas connecté·e à Grist | se connecter, puis recharger |
| « Aucun écran disponible » + bouton « Se connecter » | pas connecté·e à Grist, ou compte absent de `Utilisateurs` | se connecter ; sinon ajouter le compte (e-mail exact) |
| « Aucun écran disponible : compte inactif » | compte inactif dans `Utilisateurs` | cocher Actif |
| Une action est refusée | règles d'accès ou partage (lecteur·trice) | Administration → Mon compte → Diagnostic : journal des refus (table, colonnes, message de Grist) |
| Administration : « `Moi` masqué partout » | e-mail différent de celui de Grist (majuscules, espace) | corriger l'e-mail dans `Utilisateurs` |
| Administration : « `Moi` n'y vaut pas vrai » ; application : « Aucun écran disponible » | `Moi` créée comme colonne de données | `Moi` → *Actions de colonne* → *Effacer et faire une colonne formule* → `True`, type Booléen |
| Un widget ne trouve plus une colonne après un changement de libellé | Grist a renommé l'identifiant avec le libellé | rendre son identifiant à la colonne, puis délier l'identifiant du libellé avant de le changer |
| Deux colonnes affichent le même texte (ex. titre = description) | formule longue collée dans la mauvaise colonne | recoller le bon fichier `installation/formules/<Table>_<Colonne>.py` dans chaque colonne |
| Une colonne `ID` est devenue `ID2` | `id` est réservé par Grist | renommer la colonne (`Numero`, `Code`) dans le CSV et les widgets |
| Cellules rouges ou références vers la mauvaise ligne | colonne affichée non unique (même nom d'une période à l'autre) | inclure la période dans la colonne affichée, puis refaire la conversion |
| Nouvelle version invisible | cache de Grist | recharger la page (vider le cache si besoin) |

## 11. Limites connues

- Ordinateur uniquement (pas de version mobile).
- [ …]
