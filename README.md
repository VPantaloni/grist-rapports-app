# Rapports et suivis pour Grist

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
| Plan d'inspection | `https://grist-rapports-app.vercel.app/plan/` | Visites à faire par CMi (IA-IPR), suivi des visites et des validations ; « Mes visites » avec les contacts des établissements (CMi) |
| Suivis | `https://grist-rapports-app.vercel.app/suivis/` | IA-IPR : suivi pluriannuel des maître·sses délégué·es (positionnement sur trois compétences, visite tous les trois ans) ; suivi des stagiaires à venir |
| Rapports | `https://grist-rapports-app.vercel.app/rapports/` | Rédaction, relecture, signatures, impression PDF et transmission des rapports |
| Modèles & phrases | `https://grist-rapports-app.vercel.app/modeles/` | Rubriques des modèles, phrases types, grilles de positionnement (MD, PSTG), paramètres |
| Annuaire | `https://grist-rapports-app.vercel.app/annuaire/` | CMi et IA-IPR : référent·es, initiales, accès à l'application |

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
#### `Personnes` — annuaire des CMi et IA-IPR ; Utilisateurs.Personne y renvoie

| Colonne | Type | Rôle |
|---|---|---|
| `Prenom` | Texte | Prénom |
| `Nom` | Texte | Nom |
| `Fonction` | Choix | Fonction |
| `Initiales` | Texte | unique ; fin du nom du PDF (AAAA_MM_JJ_NOM_Prenom_XX) |
| `Referent` | Référence → Personnes | CMi : son ou sa référent·e (copie du mail de transmission) |
| `Titre_signature` | Texte | au-dessus de la signature : « La chargée de mission », « L'IA-IPR »… (saisi, jamais calculé) |
| `Stagiaires` | Booléen | IA-IPR en copie du mail pour tout rapport PSTG |
| `Email` | Texte | unique ; adresse professionnelle |
| `nb_visites_dues` | Entier | CMi : nombre de visites attendues selon la lettre de mission (affiché sur son plan et dans le bilan) |
| `Nom_complet` | Texte (formule) | colonne affichée des références |

#### `Etablissements` — établissements de l'académie (annuaire de l'éducation, open data) ; importés depuis l'Administration

| Colonne | Type | Rôle |
|---|---|---|
| `UAI` | Texte | unique (= Rne) |
| `Nom` | Texte | libellé complet : « Collège Alain Fournier » |
| `Sigle` | Texte | CLG, LYC, LP… |
| `Secteur` | Choix | Secteur |
| `Adresse` | Texte | Adresse |
| `Code_postal` | Texte | Code postal |
| `Commune` | Texte | Commune |
| `Mel` | Texte | ce.<uai>@ac-orleans-tours.fr |
| `Telephone` | Texte | standard de l'établissement (Annuaire de l'éducation) |
| `Departement` | Texte | Département |
| `Bassin` | Texte | Bassin |
| `Lat` | Numérique | Latitude |
| `Lon` | Numérique | Longitude |
| `Libelle` | Texte (formule) | colonne affichée des références (unique par l'UAI) |

#### `Professeurs` — professeur·es de mathématiques de l'année (colonnes utiles du fichier académique, importé depuis l'Administration) ; les colonnes sensibles ne sont jamais importées

| Colonne | Type | Rôle |
|---|---|---|
| `Civilite` | Choix | Civilité |
| `Nom` | Texte | Nom |
| `Prenom` | Texte | Prénom |
| `Statut` | Texte | Titulaire, CDD, CDI |
| `Grade` | Texte | AGREGE CLN, CERT. CL N, AC2C1, MD1… |
| `Echelon` | Entier | Échelon |
| `Type_nomination` | Texte | STG, STR, AIS = stagiaire ; SER = en service |
| `Entree_grade` | Date | avec Mode_acces : repère les agrégé·es internes stagiaires (1er septembre de l'année) |
| `Mode_acces` | Texte | CONC INTER = concours interne |
| `Discipline` | Texte | Nom_disc_affect |
| `UAI` | Texte | Rne de l'affectation |
| `Email` | Texte | mail_ouvert |
| `Etablissement` | Référence → Etablissements (formule) | établissement d'après l'UAI |
| `Libelle` | Texte (formule) | colonne affichée (une ligne par affectation) |

#### `Types_rapport` — types de rapport : Classique, PSTG, MD

| Colonne | Type | Rôle |
|---|---|---|
| `Code` | Texte | unique : CLASSIQUE, PSTG, MD |
| `Libelle` | Texte | « Visite d'accompagnement (titulaire) »… |
| `Titre` | Texte | « RAPPORT DE VISITE, D'ACCOMPAGNEMENT ET DE CONSEILS » |
| `Positionnement` | Booléen | onglet de positionnement sur une grille de compétences (MD, PSTG) : outil interne, jamais imprimé dans le rapport |
| `Echelle` | Texte | niveaux du positionnement, du plus faible au plus fort, un par ligne « Niveau : description » ; vide = Parametres.echelle_md |
| `Ordre` | Numérique | Ordre |

#### `Rubriques` — rubriques des rapports, dans l'ordre ; une rubrique sert à un ou plusieurs types

| Colonne | Type | Rôle |
|---|---|---|
| `Code` | Texte | unique, stable (colonne affichée des références) : clé du texte dans Rapports.Contenu |
| `Titre` | Texte | titre (imprimé si « Titre imprimé ») ; deux rubriques peuvent avoir le même titre (ex. bilan par compétences, version MD) |
| `Types` | Liste de références → Types_rapport | Types de rapport |
| `Ordre` | Numérique | Ordre |
| `Forme` | Choix | Puces : une ligne = une puce à l'impression |
| `Consigne` | Texte | aide à la rédaction (texte rouge du modèle) : affichée, jamais imprimée |
| `Texte_depart` | Texte | texte proposé à la création du rapport |
| `Imprimee` | Booléen | Imprimée |
| `Titre_imprime` | Booléen | titre de la rubrique imprimé dans le rapport (en gras) ; sinon, seul son texte est imprimé |

#### `Phrases` — bibliothèque de phrases types (aide à la rédaction)

| Colonne | Type | Rôle |
|---|---|---|
| `Rubrique` | Référence → Rubriques | Rubrique |
| `Competence` | Choix | P1-P5 (Classique, PSTG) ou MD1-MD3 (MD) : code de la grille de positionnement |
| `Niveau` | Numérique | rang du niveau (1 = le plus faible ; PSTG 1-4, MD 1-3) : proposée d'office quand la compétence est positionnée à ce niveau ; vide = tous niveaux |
| `Nature` | Choix | Nature |
| `Texte` | Texte | {nom}, {civilite}, {prenom} remplacés à l'insertion |
| `Auteur` | Référence → Personnes | Auteur·e |
| `Partagee` | Booléen | phrase d'un·e CMi : décochée = dans sa seule bibliothèque ; cochée = proposée à la validation des IA-IPR |
| `Validee` | Booléen | validée par un·e IA-IPR : visible de tous |
| `Ordre` | Numérique | Ordre |

#### `Competences_MD` — grilles de positionnement (MD : 3 compétences ; PSTG : P1 à P5) : compétences et descripteurs par niveau

| Colonne | Type | Rôle |
|---|---|---|
| `Code` | Texte | unique : MD1, MD2…, P1…P5 (= Phrases.Competence) |
| `Libelle` | Texte | Compétence |
| `Types` | Liste de références → Types_rapport | grille du ou des types ; vide = grille des MD |
| `Descripteurs` | Texte | aide au positionnement : un paragraphe par niveau, commençant par « Niveau : » (ex. « À consolider : … ») |
| `Phrases_types` | Texte | une phrase par niveau, « Niveau : phrase » : proposée quand on choisit ce niveau, modifiable dans le rapport |
| `Domaine` | Texte | Domaine |
| `Ordre` | Numérique | Ordre |

#### `Parametres` — réglages de l'application (une ligne par clé)

| Colonne | Type | Rôle |
|---|---|---|
| `Cle` | Texte | unique : discipline, secretariat, mail_objet, mail_texte, echelle_md… |
| `Valeur` | Texte | Valeur |
| `Description` | Texte | Description |

#### `Rapports` — un rapport de visite ; identité recopiée à la création (le fichier des professeur·es change chaque année)

| Colonne | Type | Rôle |
|---|---|---|
| `Type` | Référence → Types_rapport | Type |
| `Professeur` | Référence → Professeurs | lien vers l'année en cours (peut se perdre au changement d'année) |
| `Prof_civilite` | Texte | Civilité |
| `Prof_nom` | Texte | Nom |
| `Prof_prenom` | Texte | Prénom |
| `Prof_statut` | Texte | Grade · Statut · échelon, composé à la création |
| `Stagiaire_hors_liste` | Booléen | PSTG choisi pour un·e professeur·e non STG (alerte Siiprien) |
| `UAI` | Texte | UAI |
| `Etab_nom` | Texte | Établissement |
| `Etab_commune` | Texte | Commune |
| `Date_visite` | Date | Date de la visite |
| `Heure` | Texte | HH:MM |
| `Classe` | Texte | Classe |
| `Effectif` | Entier | Effectif |
| `Theme` | Texte | Thème |
| `Contenu` | Texte | JSON { code de rubrique : texte } — chiffré |
| `Structure` | Texte | JSON des rubriques (titres, ordre, forme) figé à la création : un modèle modifié ne change pas les anciens rapports |
| `Positionnement` | Texte | JSON { code compétence : { niveau, phrase } } (MD, PSTG) — chiffré, jamais imprimé dans le rapport |
| `Commentaires` | Texte | JSON { code de rubrique : commentaire } — chiffré |
| `Statut` | Choix | Statut |
| `Auteur` | Référence → Personnes | portée « Limité » des CMi |
| `Valideur` | Référence → Personnes | référent·e de l'auteur·e par défaut |
| `Signature_cmi` | Texte | image (data URL) posée par le ou la CMi — chiffrée |
| `Signature_ipr` | Texte | image (data URL) posée par l'IA-IPR — chiffrée |
| `Signe_cmi_le` | Date | Signé CMi le |
| `Valide_le` | Date | Validé le |
| `Transmis_le` | Date | Transmis le |
| `Historique` | Texte | JSON [{ date, qui, action }] |
| `Importe` | Booléen | ancien rapport importé par copier-coller (IA-IPR) : transmis d'office, jamais retransmis, retouchable par les IA-IPR |
| `Annee` | Texte (formule) | Année scolaire |
| `Libelle` | Texte (formule) | colonne affichée (unique par l'id) |

#### `Signatures` — signature enregistrée de chaque compte ; chacun·e ne lit et n'écrit que la sienne

| Colonne | Type | Rôle |
|---|---|---|
| `Email` | Texte | exactement user.Email |
| `Image` | Texte | image PNG (data URL) |
| `Modifie_le` | Date | Modifiée le |

#### `Visites` — plan d'inspection : une visite à faire, attribuée à un·e CMi par un·e IA-IPR ; reliée au rapport rédigé

| Colonne | Type | Rôle |
|---|---|---|
| `Professeur` | Référence → Professeurs | lien vers l'année en cours (peut se perdre au changement d'année) |
| `Prof_nom` | Texte | recopié (ou saisi si absent de Professeurs) |
| `Prof_prenom` | Texte | Prénom |
| `UAI` | Texte | UAI |
| `Etab_nom` | Texte | recopié |
| `Stagiaire` | Référence → Stagiaires | visite d'un·e stagiaire : statut affiché calculé (corps, concours, quotité) |
| `Statut_plan` | Texte | ancienne saisie libre (« AGREG 50 % ») : n'est plus saisie ; le statut affiché est calculé (Stagiaires ou grade) |
| `CMi` | Référence → Personnes | portée « Limité » des CMi (ses visites) |
| `Mois_debut` | Date | 1er jour du mois de début de la période de visite |
| `Mois_fin` | Date | 1er jour du mois de fin de la période de visite |
| `Visite_inspe` | Date | Visite INSPE |
| `Date_prevue` | Date | fixée par le ou la CMi |
| `Notes` | Texte | Notes |
| `Rapport` | Référence → Rapports | rapport rédigé pour cette visite (relié à sa création) |
| `Annee` | Texte (formule) | Année scolaire |
| `Libelle` | Texte (formule) | colonne affichée (unique par l'id) |

#### `Maitres_delegues` — maître·sses délégué·es suivi·es (visite tous les trois ans) ; identité recopiée, le fichier des professeur·es changeant chaque année

| Colonne | Type | Rôle |
|---|---|---|
| `Professeur` | Référence → Professeurs | lien vers l'année en cours (peut se perdre au changement d'année) |
| `Civilite` | Texte | Civilité |
| `Nom` | Texte | Nom |
| `Prenom` | Texte | Prénom |
| `UAI` | Texte | UAI |
| `Etab_nom` | Texte | Établissement |
| `Etab_commune` | Texte | Commune |
| `En_poste` | Booléen | décoché : ancien·ne MD (masqué·e par défaut) |
| `Notes` | Texte | Notes |
| `Libelle` | Texte (formule) | colonne affichée (unique par l'id) |

#### `Bilans_MD` — bilans de positionnement des MD saisis pour les années passées (les rapports MD validés s'ajoutent d'office au suivi)

| Colonne | Type | Rôle |
|---|---|---|
| `MD` | Référence → Maitres_delegues | MD |
| `Annee` | Texte | « 2024-2025 » |
| `Date_visite` | Date | Date de la visite |
| `Visiteur` | Référence → Personnes | CMi ou IA-IPR |
| `Positionnement` | Texte | JSON { code compétence : { niveau, phrase } } — chiffré |
| `Libelle` | Texte (formule) | colonne affichée (unique par l'id) |

#### `Stagiaires` — professeur·es stagiaires suivi·es, une ligne par année ; identité recopiée du fichier des professeur·es (qui change chaque année)

| Colonne | Type | Rôle |
|---|---|---|
| `Annee` | Texte | « 2026-2027 » |
| `Professeur` | Référence → Professeurs | lien vers l'année en cours (facultatif : stagiaire absent·e du fichier) |
| `Civilite` | Texte | Civilité |
| `Nom` | Texte | Nom |
| `Prenom` | Texte | Prénom |
| `Email` | Texte | E-mail |
| `UAI` | Texte | UAI |
| `Etab_nom` | Texte | Établissement |
| `Etab_commune` | Texte | Commune |
| `Corps` | Choix | proposé d'après le Grade, modifiable |
| `Concours` | Choix | Concours |
| `Quotite` | Choix | Quotité |
| `Sans_tuteur` | Booléen | agrégation interne et quelques autres cas |
| `Situation` | Choix | Situation |
| `Avis` | Choix | avis de l'IA-IPR en fin d'année |
| `Avis_le` | Date | Avis donné le |
| `Avis_par` | Référence → Personnes | IA-IPR |
| `Suivi` | Choix | Écarté·e : repéré·e dans le fichier mais pas suivi·e (motif) |
| `Motif` | Texte | pourquoi écarté·e |
| `Notes` | Texte | Notes |
| `Libelle` | Texte (formule) | colonne affichée (unique par l'id) |

#### `Tutorats` — tuteur·trices des stagiaires (un·e ou deux par stagiaire) ; identité recopiée

| Colonne | Type | Rôle |
|---|---|---|
| `Stagiaire` | Référence → Stagiaires | Stagiaire |
| `Professeur` | Référence → Professeurs | lien vers l'année en cours (facultatif) |
| `Civilite` | Texte | Civilité |
| `Nom` | Texte | Nom |
| `Prenom` | Texte | Prénom |
| `Email` | Texte | adresse du tuteur ou de la tutrice (futurs formulaires) |
| `UAI` | Texte | UAI |
| `Etab_nom` | Texte | Établissement |
| `Ordre` | Numérique | 1 = tuteur·trice principal·e, 2 = co-tuteur·trice |
| `Libelle` | Texte (formule) | colonne affichée (unique par l'id) |

#### `Grilles_PSTG` — compétences des fiches du suivi des stagiaires (auto-positionnement, bilans intermédiaire et final) et descripteurs d'aide par niveau

| Colonne | Type | Rôle |
|---|---|---|
| `Code` | Texte | unique : P1…P5, CC1…CC14 |
| `Libelle` | Texte | Compétence |
| `Groupe` | Choix | P : compétences communes à tous les professeurs ; CC : à tous les professeurs et personnels d'éducation |
| `Auto_positionnement` | Booléen | figure dans la fiche d'auto-positionnement (octobre) |
| `Bilans` | Booléen | figure dans les fiches de bilan intermédiaire et final |
| `Descripteurs` | Texte | aide au positionnement : un paragraphe par niveau, du plus faible au plus fort, « I : … », « AD : … », « S : … », « R : … » |
| `Ordre` | Numérique | Ordre |

#### `Retours_PSTG` — retours sur un·e stagiaire au fil de l'année : tuteur·trice, auto-positionnement, bilans, visites (INSPÉ, CMi, IA-IPR) saisies à la main ; les visites tirées des rapports de l'application ne sont pas recopiées

| Colonne | Type | Rôle |
|---|---|---|
| `Stagiaire` | Référence → Stagiaires | Stagiaire |
| `Type` | Choix | Type |
| `Date` | Date | Date |
| `Par` | Texte | nom libre (tuteur·trice, formateur·trice INSPÉ…) |
| `Personne` | Référence → Personnes | CMi ou IA-IPR de l'annuaire |
| `Avis` | Choix | retours simples (3 couleurs) |
| `Positionnement` | Texte | JSON { code compétence : rang 1-4 } — chiffré |
| `Dispositif` | Booléen | auto-positionnement : accompagnement par un dispositif particulier envisagé |
| `Commentaire` | Texte | chiffré |
| `Libelle` | Texte (formule) | colonne affichée (unique par l'id) |

#### `EDT` — créneaux des emplois du temps (collage Siiprien « Emploi du temps / Tous » ou export d'EdT-widget), une ligne par cours ; versés par les IA-IPR

| Colonne | Type | Rôle |
|---|---|---|
| `Nom` | Texte | « M. NOM PRENOM (EDT) », « MM … » = Mme |
| `Horaire` | Texte | « 8h00 - 9h00 » |
| `Libelle` | Texte | discipline du cours |
| `Classe` | Texte | Classe |
| `Jour` | Texte | Lundi … Samedi |
| `Alternance` | Texte | H = chaque semaine ; Q1 = semaine A ; Q2 = semaine B ; S1, S2 = semestres |
| `UAI` | Texte | UAI |
| `Importe_le` | Date | Importé le |

#### `Calendrier` — calendrier scolaire : semaine A, B ou vacances (une ligne par semaine)

| Colonne | Type | Rôle |
|---|---|---|
| `Lundi` | Date | n'importe quel jour de la semaine |
| `Semaine` | Choix | Semaine |
| `Semestre` | Choix | vide : septembre-janvier = S1, février-juin = S2 |

#### `EdT_memo` — plannings préparés dans Emplois du temps (une ligne par créneau : visite, entretien, réunion) ; « Visite calée » cale aussi la date au plan

| Colonne | Type | Rôle |
|---|---|---|
| `UAI` | Texte | UAI |
| `Date` | Date | date de la visite (vide si non précisée) |
| `Jour` | Texte | Jour |
| `Professeur` | Texte | « Mme NOM PRENOM » ; réunion : liste des professeur·es |
| `Type` | Choix | Type |
| `Debut` | Texte | HH:MM |
| `Fin` | Texte | HH:MM |
| `Classe` | Texte | Classe |
| `Libelle` | Texte | discipline du cours visité |
| `Etat` | Choix | État |
| `Auteur` | Référence → Personnes | portée « Limité » des CMi |
| `Visite` | Référence → Visites | visite du plan calée par ce planning |
| `Enregistre_le` | Date | Enregistré le |

#### `Modeles_mail` — modèles de mails (Emplois du temps) : proposer, annoncer une visite… ; champs {etablissement}, {date}, {planning}…

| Colonne | Type | Rôle |
|---|---|---|
| `Code` | Texte | unique |
| `Titre` | Texte | libellé du bouton : « Proposer une visite » |
| `Pour` | Choix | rôle qui voit ce modèle |
| `A` | Liste de choix | À |
| `Copie` | Liste de choix | Copie |
| `Objet` | Texte | Objet |
| `Texte` | Texte | {etablissement}, {commune}, {date}, {planning}, {professeurs}, {signataire}, {fonction}, {ipr} |
| `Ordre` | Numérique | Ordre |

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

**Plan d'inspection** (`plan/`, table `Visites`). Les IA-IPR remplissent le plan : une visite par professeur·e, avec
le ou la CMi, la période (mois de début et de fin), la date de visite INSPE et le statut tel que dans le plan
(« AGREG 50 % »…). « Importer un plan » lit un copier-coller du tableur des collègues (NOM, Prénom, statut,
établissement, ville, période de visite, Visite INSPE, UAI) : chaque professeur·e est retrouvé·e par l'UAI et le nom,
les doublons et visites déjà au plan sont écartés. L'onglet **Suivi** compte les visites par état (à caler, calée,
en cours, en relecture, à reprendre, validé, transmis), donne un bilan par CMi et signale les rapports
rédigés hors plan (« Ajouter au plan »). Les CMi ne voient que **leurs** visites (« Mes visites ») : contacts de
l'établissement (e-mail `ce.<UAI>@ac-orleans-tours.fr`, téléphone), date à caler, notes, puis « Rédiger le rapport »,
qui ouvre l'écran Rapports déjà rempli et relie le rapport à la visite.

**Suivis** (`suivis/`, tables `Maitres_delegues` et `Bilans_MD`, IA-IPR seulement). Onglet **Suivi MD** : une ligne par
maître·sse délégué·e, une colonne par année (les cinq précédentes et l'année en cours), trois ronds colorés par visite
(niveau sur chacune des trois compétences de la grille MD). Les rapports MD validés s'y inscrivent d'office ; les
anciennes visites se saisissent en cliquant sur une case (visiteur·e, niveaux, phrases facultatives). Les MD du fichier
des professeur·es (grade « MD… ») sont proposé·es à l'ajout ; « + MD » ajoute un·e MD absent·e du fichier. Visite tous
les trois ans : « À visiter » signalé.

**Rapports**, **Modèles & phrases**, **Annuaire** : voir l'aide (?) de chaque écran.

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
