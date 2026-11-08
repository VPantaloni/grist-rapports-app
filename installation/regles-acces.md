# Règles d'accès — fiche de saisie pas à pas

> **Publié** avec l'application (dossier `installation/`) : n'y écrire **aucun e-mail réel** ni secret ; la sécurité
> vient des règles saisies dans Grist, pas du secret de cette fiche.
>
> À suivre dans Grist, une case à la fois : chaque règle a sa case à cocher, ses droits et sa condition **à
> copier-coller** (ne pas retaper : points médians, guillemets, majuscules). Exemple : le fil rouge du kit
> (`Personnes`, `Projets`, rôle Contributeur·trice « Limité » sur `Projets`). Les parties **[À ADAPTER]** se remplissent
> avec APP § 8 (dossier `specifications/`, local). Le pourquoi de chaque règle : SPEC § 5.

> **Voie scriptée** : l'écran `installer/` (SPEC § 7 bis, volet 3) écrit ces mêmes règles d'après
> `installation/schema.json` (règles propres à l'application : rubrique `regles`). Cette fiche sert alors à les
> **vérifier** (menu du document → Règles d'accès) et à faire le § 8.

## 0. Avant de commencer

- [ ] **Sauvegarde** du document (menu du document → *Télécharger* → `.grist`) : on revient en arrière si besoin.
- [ ] Tables d'administration importées : `Utilisateurs` (avec `Droits` et `Moi`), `Permissions`, `Navigation`.
- [ ] **Ma ligne** dans `Utilisateurs` : mon e-mail Grist **exact** (majuscules comprises), rôle `Administrateur·trice`,
      `Actif` coché. Sinon, une fois les règles saisies, seul le statut de propriétaire me garde l'accès.
- [ ] **Partage** (bouton *Partager*) : **Éditeur·trice** pour toute personne qui écrit, **Lecteur·trice** pour les
      autres. Les règles ne font que **restreindre** : un·e lecteur·trice ne pourra jamais écrire. Partage public
      (« toute personne ayant le lien ») : **pas maintenant**, seulement si APP § 8 *Ouverture* le prévoit, et en
      dernier (§ 10).

**Où** : menu du document (icône de bouclier) → **Règles d'accès**. Rien n'est appliqué avant **Enregistrer**, en
haut de la page : enregistrer après chaque section.

**Comment Grist lit les règles** :
- il examine les règles d'une **colonne**, puis celles de la **table**, puis les **règles par défaut** ; dans chaque
  bloc, de haut en bas ; la **première** règle dont la condition est vraie **et** qui décide pour ce droit l'emporte ;
- une case **laissée vide** ne décide rien : la question passe à la règle suivante. Ne cocher **que** les droits
  indiqués ;
- lettres : **R** lire, **U** modifier, **C** créer, **D** supprimer, **S** structure (colonnes, tables, formules).

**Notation de cette fiche** : ✓ = autorisé (case verte), ✗ = refusé (case rouge), · = laissé vide. Cliquer sur une
lettre la fait passer de vide à autorisé, puis à refusé.

Attention : la matrice `Permissions` de l'application dit **L C M S** (Lire, Créer, Modifier, **Supprimer**) ; Grist dit
**R C U D**. Le « S » de la matrice (supprimer) devient donc le **D** de Grist ; le **S** de Grist (structure) n'est
jamais donné par la matrice.

## 1. Attribut utilisateur

- [ ] Bouton **Ajouter un attribut utilisateur** :

| Nom | Table | Attribut de l'utilisateur | Colonne |
|---|---|---|---|
| `Profil` | `Utilisateurs` | `user.Email` | `Email` |

Les conditions écrivent ensuite `user.Profil.Roles`, `user.Profil.Droits`, `user.Profil.Personne`, `user.Profil.Actif`.
Compte absent de `Utilisateurs` : `user.Profil` est vide (faux).

## 2. Règles par défaut (en bas de la page)

Sous les règles saisies, Grist affiche en **gris** ses règles intégrées (`user.Access in [EDITOR, OWNER]` → tout
autorisé ; `user.Access in [VIEWER]` → lire). Elles ne se modifient pas et s'appliquent quand aucune règle n'a décidé.

| ✔ | # | Condition (à copier) | R | U | C | D | S |
|---|---|---|---|---|---|---|---|
| [ ] | D1 | `user.Access == OWNER` | ✓ | ✓ | ✓ | ✓ | ✓ |
| [ ] | D2 | `not user.Profil or not user.Profil.Actif` | ✗ | ✗ | ✗ | ✗ | ✗ |
| [ ] | D3 | `"Administrateur·trice" in user.Profil.Roles` | ✓ | ✓ | ✓ | ✓ | · |
| [ ] | D4 | `True` | ✗ | ✗ | ✗ | ✗ | ✗ |

- **D1** : filet de sécurité, les propriétaires gardent tout (et seuls eux touchent à la structure).
- **D2** : compte inconnu ou inactif → rien, sauf ce qu'une règle de table lui donne avant (ex. « ma fiche », § 6).
  Elle vient **avant** D3 : D3 ne lit jamais un profil vide.
- **D4 est indispensable** : sans elle, les règles grises donnent **tout** à toute personne éditrice par le partage.
- [ ] **Enregistrer.**

## 3. Tables d'administration

Bouton **Ajouter des règles de table** → choisir la table. Pour une règle de colonne : dans le bloc de la table,
**Ajouter une règle de colonne** → choisir la colonne.

| ✔ | Table | Portée | Condition (à copier) | R | U | C | D |
|---|---|---|---|---|---|---|---|
| [ ] | `Utilisateurs` | colonne `Moi` | `rec.Email != user.Email` | ✗ | · | · | · |
| [ ] | `Utilisateurs` | toutes les colonnes | `rec.Email == user.Email` | ✓ | · | · | · |
| [ ] | `Permissions` | toutes les colonnes | `user.IsLoggedIn` | ✓ | · | · | · |
| [ ] | `Navigation` | toutes les colonnes | `True` | ✓ | · | · | · |
| [ ] | `Chiffrement` *(si l'application chiffre des champs, SPEC § 5.8)* | toutes les colonnes | `user.Profil and user.Profil.Actif` | ✓ | · | · | · |

- `Moi` : chacun·e ne voit `Moi` que sur sa ligne, admins compris ; c'est ainsi que l'application sait qui est
  connecté·e. Ne **rien** cocher d'autre sur cette règle : un U refusé empêcherait les admins de modifier les comptes.
- `Utilisateurs` et `Permissions` ne sont modifiables que par les admins (D3) : on ne peut pas se retirer
  l'administration par erreur depuis l'application.
- `Permissions` lisible par toute personne connectée : refusée, elle signale un visiteur **non connecté** (partage
  public, § 10), que l'application invite alors à se connecter.
- `Chiffrement` : sel et vérificateur, rien de secret ; lisible par les comptes actifs (pour révéler), modifiable par
  les admins seulement (D3).
- `Navigation` lisible par tous : libellés du menu seulement. Refusée, la page Application reste **blanche** (Grist
  n'affiche pas une page dont la table est refusée), sans même le bouton « Se connecter ».
- [ ] **Enregistrer.**

## 4. Tables de données : la matrice (T1 à T4)

Pour **chaque** table de données, quatre règles, dans cet ordre. Remplacer `T` par le **nom exact** de la table.

| ✔ | # | Condition (modèle) | R | U | C | D |
|---|---|---|---|---|---|---|
| | T1 | `user.Profil and "T:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| | T2 | `user.Profil and "T:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| | T3 | `user.Profil and "T:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| | T4 | `user.Profil and "T:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |

Prêtes à copier, une ligne par table de données (générées depuis `installation/schema.json`) :

<!-- schema:matrice -->
| ✔ | Table | Condition | R | U | C | D |
|---|---|---|---|---|---|---|
| [ ] | `Personnes` | `user.Profil and "Personnes:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Personnes` | `user.Profil and "Personnes:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Personnes` | `user.Profil and "Personnes:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Personnes` | `user.Profil and "Personnes:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Etablissements` | `user.Profil and "Etablissements:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Etablissements` | `user.Profil and "Etablissements:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Etablissements` | `user.Profil and "Etablissements:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Etablissements` | `user.Profil and "Etablissements:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Professeurs` | `user.Profil and "Professeurs:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Professeurs` | `user.Profil and "Professeurs:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Professeurs` | `user.Profil and "Professeurs:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Professeurs` | `user.Profil and "Professeurs:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Types_rapport` | `user.Profil and "Types_rapport:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Types_rapport` | `user.Profil and "Types_rapport:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Types_rapport` | `user.Profil and "Types_rapport:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Types_rapport` | `user.Profil and "Types_rapport:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Rubriques` | `user.Profil and "Rubriques:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Rubriques` | `user.Profil and "Rubriques:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Rubriques` | `user.Profil and "Rubriques:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Rubriques` | `user.Profil and "Rubriques:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Phrases` | `user.Profil and "Phrases:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Phrases` | `user.Profil and "Phrases:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Phrases` | `user.Profil and "Phrases:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Phrases` | `user.Profil and "Phrases:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Competences_MD` | `user.Profil and "Competences_MD:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Competences_MD` | `user.Profil and "Competences_MD:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Competences_MD` | `user.Profil and "Competences_MD:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Competences_MD` | `user.Profil and "Competences_MD:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Parametres` | `user.Profil and "Parametres:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Parametres` | `user.Profil and "Parametres:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Parametres` | `user.Profil and "Parametres:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Parametres` | `user.Profil and "Parametres:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Rapports` | `user.Profil and "Rapports:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Rapports` | `user.Profil and "Rapports:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Rapports` | `user.Profil and "Rapports:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Rapports` | `user.Profil and "Rapports:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Signatures` | `user.Profil and "Signatures:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Signatures` | `user.Profil and "Signatures:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Signatures` | `user.Profil and "Signatures:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Signatures` | `user.Profil and "Signatures:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Visites` | `user.Profil and "Visites:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Visites` | `user.Profil and "Visites:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Visites` | `user.Profil and "Visites:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Visites` | `user.Profil and "Visites:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Maitres_delegues` | `user.Profil and "Maitres_delegues:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Maitres_delegues` | `user.Profil and "Maitres_delegues:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Maitres_delegues` | `user.Profil and "Maitres_delegues:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Maitres_delegues` | `user.Profil and "Maitres_delegues:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
| [ ] | `Bilans_MD` | `user.Profil and "Bilans_MD:L:Oui" in user.Profil.Droits` | ✓ | · | · | · |
| [ ] | `Bilans_MD` | `user.Profil and "Bilans_MD:C:Oui" in user.Profil.Droits` | · | · | ✓ | · |
| [ ] | `Bilans_MD` | `user.Profil and "Bilans_MD:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Bilans_MD` | `user.Profil and "Bilans_MD:S:Oui" in user.Profil.Droits` | · | · | · | ✓ |
<!-- /schema:matrice -->

- [ ] **Enregistrer.**

## 5. Portées « Limité » (sous T1 à T4 de la même table)

Une portée par case « Limité » de la matrice (APP § 8, *Portées « Limité »*). Elle s'écrit avec l'état **avant**
(`rec`) et, pour créer ou modifier, l'état **après** (`newRec`) : on ne peut ni prendre la ligne d'un·e autre, ni
donner la sienne à quelqu'un d'autre en la modifiant.

Fil rouge **[À ADAPTER]** : un·e Contributeur·trice modifie les projets dont elle ou il est responsable.

| ✔ | Table | Portée | Condition (à copier) | R | U | C | D |
|---|---|---|---|---|---|---|---|
| [ ] | `Projets` | colonne `Responsables` | `user.Profil and "Projets:M:Limité" in user.Profil.Droits and user.Profil.Personne in rec.Responsables` | · | ✓ | · | · |
| [ ] | `Projets` | toutes les colonnes | `user.Profil and "Projets:M:Limité" in user.Profil.Droits and user.Profil.Personne in rec.Responsables and user.Profil.Personne in newRec.Responsables` | · | ✓ | · | · |

- La règle de **colonne** d'affectation (`Responsables`) ne regarde que l'état **avant** : on peut ajouter ou retirer
  un·e collègue d'un projet dont on est déjà responsable, mais pas **s'ajouter** à celui d'un·e autre pour ensuite le
  modifier.
- Affectation par **référence simple** (une seule personne) : `rec.Responsable == user.Profil.Personne` au lieu de
  `user.Profil.Personne in rec.Responsables` ; pour pouvoir prendre une ligne libre :
  `(not rec.Responsable or rec.Responsable == user.Profil.Personne)`.
- **Création** « Limité » : une condition sur `newRec` ne suit **aucune référence** (`newRec.Projet.Responsables` est
  refusé, même avec le vrai compte). Ajouter une **colonne d'aide** (formule) dans la table et tester celle-ci :
  `newRec.ResponsablesProjet`, `newRec.CampagneActive`.
- Lecture « Limité » : même modèle avec `rec` seulement, case R.
- [ ] **Enregistrer.**

## 6. Écran « ma fiche » (seulement si l'application l'utilise : SPEC § 5.6)

Toute personne connectée, même sans ligne dans `Utilisateurs`, remplit **sa** fiche. **F** = condition ci-dessous, à
écrire en entier dans chaque règle. Table des fiches **[À ADAPTER]** : `Personnes`, colonne `Email`.

F = `user.IsLoggedIn and (not user.Profil or user.Profil.Actif)`

| ✔ | Table | Portée | Condition (à copier) | R | U | C | D |
|---|---|---|---|---|---|---|---|
| [ ] | `Personnes` | toutes les colonnes | `user.IsLoggedIn and (not user.Profil or user.Profil.Actif) and rec.Email == user.Email` | ✓ | · | · | · |
| [ ] | `Personnes` | toutes les colonnes | `user.IsLoggedIn and (not user.Profil or user.Profil.Actif) and newRec.Email == user.Email` | · | · | ✓ | · |
| [ ] | `Personnes` | toutes les colonnes | `user.IsLoggedIn and (not user.Profil or user.Profil.Actif) and rec.Email == user.Email and newRec.Email == user.Email` | · | ✓ | · | · |
| [ ] | tables lues par l'écran (ex. `Etablissements`) | toutes les colonnes | `user.IsLoggedIn and (not user.Profil or user.Profil.Actif)` | ✓ | · | · | · |

Placer ces règles **sous** T1 à T4 de la table. Colonne que la personne ne doit pas modifier (statut, notes
internes) **[À ADAPTER]** : deux règles de colonne, dans cet ordre :

| ✔ | Table | Portée | Condition | R | U | C | D |
|---|---|---|---|---|---|---|---|
| [ ] | `Personnes` | colonne `[Statut]` | `user.Profil and "Personnes:M:Oui" in user.Profil.Droits` | · | ✓ | · | · |
| [ ] | `Personnes` | colonne `[Statut]` | `True` | · | ✗ | · | · |

Et dans la table des fiches : formule d'initialisation `user.Email` pour `Email` (« Appliquer aux nouvelles lignes »,
sans recalcul) ; `installation/formules/Personnes_Prenom.py` et `Personnes_Nom.py`. Dans `Navigation.Roles` : le choix
`Toute personne connectée`, et ce rôle sur la ligne de l'écran.

- [ ] **Enregistrer.**

## 7. Campagnes (seulement si l'application en a : SPEC § 5.5)

Lignes modifiables pendant la campagne active seulement : colonne d'aide `CampagneActive` (formule
`$Campagne.Active`) dans chaque table rattachée **[À ADAPTER]**, puis ajouter `and rec.CampagneActive and
newRec.CampagneActive` aux conditions de modification (U) et `and newRec.CampagneActive` aux conditions de création
(C) des rôles concernés.

## 8. Vérifier

- [ ] Administration → **Mon compte** : « Identification réussie », mes droits conformes à la matrice.
- [ ] **Voir en tant que…** (page des règles d'accès) pour chaque rôle de `Utilisateurs` : écrans, tables lisibles,
      boutons actifs (recette § 5). Ce mode simule les **lectures** ; certaines **écritures** y sont refusées à tort
      ou prennent l'e-mail du propriétaire : les écritures se vérifient avec un **vrai compte**.
- [ ] Un compte **inactif** (`Actif` décoché) : « Aucun écran disponible », aucune donnée.
- [ ] Un **autre vrai compte**, absent de `Utilisateurs`, dans une fenêtre privée : rien (ou « Ma fiche » seulement,
      § 6), y compris dans **« Données sources »** (bas du panneau de gauche de Grist).
- [ ] Recette § 4 cochée.

## 9. Pièges déjà rencontrés

| Constat | Cause | Remède |
|---|---|---|
| Un compte éditeur·trice voit et modifie tout | D4 absente : les règles grises de Grist décident | ajouter D4 `True` → tout refusé |
| Page Application blanche pour un compte inconnu | `Navigation` refusée | `Navigation` : `True` → R |
| « Blocked by row create access rules » à la création | condition qui suit une référence depuis `newRec` | colonne d'aide (formule) dans la table |
| Écriture refusée en « Voir en tant que » mais pas avec le vrai compte | limites de ce mode | tester les écritures avec un vrai compte |
| Un visiteur non connecté (fenêtre privée) lit des données | accès public actif, et D4 absente ou règle sans `user.IsLoggedIn` | désactiver l'accès public ; ajouter D4, revoir les règles ; refaire le test |
| Compte non reconnu | e-mail de `Utilisateurs` différent de `user.Email` (majuscules) | copier l'e-mail exact (avatar → Paramètres du profil) |
| Rôle jamais reconnu (`"Administrateur·trice" in …` faux) | point médian retapé (`.` ou `•`) | coller les rôles depuis cette fiche ou APP § 8 |
| Les admins ne peuvent plus modifier les comptes | règle de colonne `Moi` avec un U refusé | ne laisser que R refusé sur cette règle |
| Erreur sur `user.Profil.Roles` pour un compte inconnu | règle qui lit le profil avant D2 | commencer la condition par `user.Profil and …` |

## 10. Seulement si l'ouverture est « toute personne connectée, par le lien » (APP § 8, SPEC § 5.7)

À faire **après** toutes les sections précédentes, règles enregistrées :

- [ ] D4 présente (§ 2) ; toute règle qui donne un droit hors du profil commence par `user.IsLoggedIn` (§ 6).
- [ ] `Permissions` : `user.IsLoggedIn` → R (§ 3).
- [ ] *Partager* → *Accès public* : **activé** ; ligne « Accès public » : **Éditeur·trice**.
- [ ] Fenêtre privée, **sans connexion**, lien de la page d'accueil : « Connecte-toi à Grist », aucune donnée, et
      rien dans « Données sources ». **Sinon : désactiver l'accès public tout de suite**, puis corriger.
- [ ] Même test avec un autre vrai compte connecté, absent de `Utilisateurs` : seulement ce que prévoit APP § 8.
- [ ] Diffuser le lien de la **page d'accueil** du site, pas celui du document.
