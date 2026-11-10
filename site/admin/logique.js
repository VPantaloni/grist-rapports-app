// @ts-check
// Logique pure de l'Administration (sans DOM ni grist) : testable avec Node (tests/admin.test.js).
import { liste, nomFiche } from '../commun/donnees.js';
import { matriceDroits as matrice } from '../commun/droits.js';
import { PREFIXE } from '../commun/config.js';

// ===== À ADAPTER (APP § 4 et § 8) =====
// Tables de données présentes dans la matrice Permissions (pas Utilisateurs, Permissions, Navigation).
export const TABLES_DONNEES = ['Personnes', 'Etablissements', 'Professeurs', 'Types_rapport', 'Rubriques', 'Phrases',
  'Competences_MD', 'Parametres', 'Rapports', 'Signatures', 'Visites', 'Maitres_delegues', 'Bilans_MD', 'Stagiaires', 'Tutorats', 'Grilles_PSTG', 'Retours_PSTG',
  'EDT', 'Calendrier', 'EdT_memo', 'Modeles_mail'];
// Table des fiches vers laquelle pointe Utilisateurs.Personne ('' si l'application n'en a pas).
export const TABLE_FICHES = 'Personnes';
// Rôles qui exigent une fiche (leurs droits « Limité » portent sur « mes » lignes).
export const ROLES_AVEC_FICHE = ['IA-IPR', 'CMi'];
// Mêmes valeurs que les choix de Utilisateurs.Roles et Permissions.Role.
export const ROLES = ['Administrateur·trice', 'IA-IPR', 'CMi'];
// Légende des rôles (onglets Accès et Permissions) : qui reçoit chaque rôle, en une phrase.
/** @type {Record<string, string>} */
export const DESCRIPTIONS_ROLES = {
  'Administrateur·trice': 'administrateur·trices de l\'application : comptes, permissions, imports, modèles',
  'IA-IPR': 'relit, commente, signe, valide et transmet les rapports ; règle les modèles et la bibliothèque de phrases',
  'CMi': 'chargé·e de mission : rédige et signe ses rapports, propose des phrases',
};
// Contrôles des tables de fiches (onglet Contrôles, commun/controles.js) : doublons par e-mail, doublons probables par
// nom (dans un même `groupe` si indiqué), fiches sans e-mail.
/** @type {import('../commun/controles.js').ControleFiches[]} */
export const CONTROLES_FICHES = [
  { table: 'Personnes', libelle: 'personnes', email: 'Email', nom: ['Prenom', 'Nom'] },
];
// Portées « Limité » définies dans les règles d'accès (APP § 8) ; ailleurs, Limité vaut Non.
// Une entrée par règle d'accès « Limité » saisie dans Grist.
/** @type {Record<string, string>} */
// Matrice par défaut (APP § 8) : [Lire, Créer, Modifier, Supprimer] par rôle et par table. Sert au bouton « Appliquer
// les droits par défaut » de l'onglet Permissions et au fichier d'exemple Permissions.csv (même contenu, testé).
/** @type {Record<string, Record<string, string[]>>} */
export const MATRICE_DEFAUT = (() => {
  const O = 'Oui', N = 'Non', L = 'Limité';
  /** @type {Record<string, [string[], string[]]>} table : [IA-IPR, CMi] */
  const m = {
    Personnes: [[O, N, L, N], [O, N, L, N]],
    Etablissements: [[O, N, N, N], [O, N, N, N]],
    Professeurs: [[O, N, N, N], [O, N, N, N]],
    Types_rapport: [[O, N, O, N], [O, N, N, N]],
    Rubriques: [[O, O, O, O], [O, N, N, N]],
    Phrases: [[O, O, O, O], [O, L, L, L]],
    Competences_MD: [[O, O, O, O], [O, N, N, N]],
    Parametres: [[O, N, O, N], [O, N, N, N]],
    Rapports: [[O, O, O, N], [O, L, L, L]],
    Signatures: [[L, L, L, L], [L, L, L, L]],
    Visites: [[O, O, O, O], [L, N, L, N]],
    Maitres_delegues: [[O, O, O, O], [N, N, N, N]],   // suivi des MD : IA-IPR seul·es
    Bilans_MD: [[O, O, O, O], [N, N, N, N]],
    Stagiaires: [[O, O, O, O], [O, N, N, N]],         // liste des stagiaires : IA-IPR ; CMi en lecture
    Tutorats: [[O, O, O, O], [O, N, N, N]],
    Grilles_PSTG: [[O, O, O, O], [O, N, N, N]],
    Retours_PSTG: [[O, O, O, O], [O, N, N, N]],     // suivi des stagiaires : IA-IPR ; CMi en lecture
    EDT: [[O, O, O, O], [O, N, N, N]],              // emplois du temps : versés par les IA-IPR (Siiprien)
    Calendrier: [[O, O, O, O], [O, N, N, N]],
    EdT_memo: [[O, O, O, O], [O, L, L, L]],         // plannings : chaque CMi les siens
    Modeles_mail: [[O, O, O, O], [O, N, N, N]],
  };
  return {
    'Administrateur·trice': Object.fromEntries(Object.keys(m).map(t => [t, [O, O, O, O]])),
    'IA-IPR': Object.fromEntries(Object.entries(m).map(([t, v]) => [t, v[0]])),
    CMi: Object.fromEntries(Object.entries(m).map(([t, v]) => [t, v[1]])),
  };
})();
// Actions pour appliquer la matrice par défaut à un rôle : lignes manquantes créées, lignes différentes corrigées.
/** @param {string} role @param {Ligne[]} permissions @returns {any[]} */
export function actionsMatriceDefaut(role, permissions) {
  const defaut = MATRICE_DEFAUT[role] || {};
  const { index } = indexPermissions(permissions);
  const lignes = index[role] || {};
  /** @type {any[]} */
  const actions = [];
  for (const [t, [Lire, Creer, Modifier, Supprimer]] of Object.entries(defaut)) {
    const v = { Lire, Creer, Modifier, Supprimer };
    const l = lignes[t];
    if (!l) actions.push(['AddRecord', 'Permissions', null, { Role: role, Table: t, ...v }]);
    else if (Object.entries(v).some(([k, x]) => l[k] !== x)) actions.push(['UpdateRecord', 'Permissions', l.id, v]);
  }
  return actions;
}

export const PORTEES = {
  'Personnes:M': 'sa propre fiche',
  'Phrases:C': 'ses phrases, non validées',
  'Phrases:M': 'ses phrases, non validées',
  'Phrases:S': 'ses phrases, non validées',
  'Rapports:C': 'ses rapports, en brouillon',
  'Rapports:M': 'ses rapports, en brouillon ou à reprendre (jusqu\'à la soumission)',
  'Rapports:S': 'ses rapports, en brouillon',
  'Signatures:L': 'sa signature',
  'Signatures:C': 'sa signature',
  'Signatures:M': 'sa signature',
  'Signatures:S': 'sa signature',
  'Visites:L': 'ses visites du plan',
  'Visites:M': 'ses visites : date calée et notes seulement',
  'EdT_memo:C': 'ses plannings',
  'EdT_memo:M': 'ses plannings',
  'EdT_memo:S': 'ses plannings',
};
// Onglet Import (SPEC § 4.5, commun/import.js) : deux fichiers possibles. Le fichier académique des professeur·es (une
// ligne par affectation, colonnes de l'établissement comprises) remplit Etablissements puis Professeurs ; le fichier
// open data des établissements (geocode…) remplit Etablissements seulement (Professeurs non concernée : sans nom). Liste blanche : la date de naissance,
// le téléphone, les notes… ne sont jamais lus. L'Annuaire de l'éducation (d'après l'UAI) l'emporte pour le nom complet,
// la commune, le code postal, le département, l'e-mail et la position ; le fichier reste utilisé si l'UAI n'y est pas.
/** @type {import('../commun/import.js').DeclarationImport | null} */
export const IMPORT = {
  nomModele: `${PREFIXE}-modele-import.csv`,
  colonnes: {
    civilite: { type: 'choix', valeurs: ['M.', 'Mme'], equivalences: { MM: 'Mme', MME: 'Mme', Madame: 'Mme', M: 'M.', MR: 'M.', Monsieur: 'M.' },
      libelle: 'civilité (MM = Mme)', exemple: 'Mme' },
    nom: { type: 'texte', libelle: 'nom d\'usage (fichier des professeur·es)', exemple: 'GERMAIN' },
    prenom: { type: 'texte', libelle: 'prénom (fichier des professeur·es)', exemple: 'Sophie' },
    statut: { type: 'texte', libelle: 'statut (Titulaire, CDD, CDI)', exemple: 'Titulaire' },
    grade: { type: 'texte', libelle: 'grade', exemple: 'CERT. CL N' },
    echelon: { type: 'entier', min: 0, max: 15, libelle: 'échelon', exemple: '7' },
    typenomination: { type: 'texte', synonymes: ['type_nomination'], libelle: 'type de nomination (STG, STR, AIS = stagiaire)', exemple: 'SER' },
    entreegrade: { type: 'date', synonymes: ['entree_grade'], libelle: 'entrée dans le grade (agrégé·es internes stagiaires)', exemple: '01/09/2026' },
    modeacces: { type: 'texte', synonymes: ['mode_acces'], libelle: 'mode d\'accès au grade (CONC INTER = concours interne)', exemple: 'CONC INTER' },
    discipline: { type: 'texte', synonymes: ['nom_disc_affect', 'nomdiscaffect'], libelle: 'discipline d\'affectation', exemple: 'MATHEMATIQUES' },
    email: { type: 'email', synonymes: ['mail_ouvert', 'mailouvert', 'mail'], libelle: 'e-mail', exemple: 'sophie.germain@exemple.example' },
    uai: { type: 'texte', obligatoire: true, synonymes: ['rne'], libelle: 'UAI (Rne) de l\'affectation', exemple: '0450939B' },
    etabnom: { type: 'texte', synonymes: ['etab_nom'], libelle: 'nom de l\'établissement', exemple: 'ALAIN FOURNIER' },
    etabsecteur: { type: 'choix', valeurs: ['Public', 'Privé'], equivalences: { 'SECTEUR PUBLIC': 'Public', 'SECTEUR PRIVE': 'Privé', PU: 'Public', PR: 'Privé' },
      synonymes: ['etab_secteur'], libelle: 'secteur', exemple: 'SECTEUR PUBLIC' },
    etabadresse: { type: 'texte', synonymes: ['etab_adresse', 'Adresse : désignation de la voie'], libelle: 'adresse de l\'établissement' },
    etabcodepostal: { type: 'texte', synonymes: ['etab_code_postal', 'Adresse : code postal'], libelle: 'code postal', exemple: '45100' },
    etabville: { type: 'texte', synonymes: ['etab_ville'], libelle: 'commune', exemple: 'ORLEANS' },
    etabdepartement: { type: 'texte', synonymes: ['etab_departement', 'Libellé du département ou de la collectivité'], libelle: 'département' },
    etabbassin: { type: 'texte', synonymes: ['etab_bassin'], libelle: 'bassin' },
    mel: { type: 'email', libelle: 'e-mail de l\'établissement (Annuaire de l\'éducation)' },
    telephone: { type: 'texte', libelle: 'téléphone de l\'établissement (Annuaire de l\'éducation)' },
    lat: { type: 'decimal', min: -90, max: 90, synonymes: ['Latitude WGS84'], libelle: 'latitude' },
    lon: { type: 'decimal', min: -180, max: 180, synonymes: ['Longitude WGS84'], libelle: 'longitude' },
    sigle: { type: 'texte', synonymes: ['Sigle de l\'UAI'], libelle: 'sigle (CLG, LYC…), fichier des établissements', exemple: 'CLG' },
  },
  annuaire: { uai: 'uai', priorite: 'annuaire', colonnes: { etabnom: 'nom', etabville: 'commune', etabcodepostal: 'codePostal', etabdepartement: 'libelleDepartement', mel: 'email', telephone: 'telephone', lat: 'lat', lon: 'lon' } },
  tables: [
    // Établissements : rapprochés par UAI ; le fichier (complété par l'Annuaire de l'éducation) fait référence.
    { table: 'Etablissements', cle: ['UAI'], fusion: 'remplacer', champs: { UAI: 'uai', Nom: 'etabnom', Sigle: 'sigle', Secteur: 'etabsecteur', Adresse: 'etabadresse', Code_postal: 'etabcodepostal',
      Commune: 'etabville', Mel: 'mel', Telephone: 'telephone', Departement: 'etabdepartement', Bassin: 'etabbassin', Lat: 'lat', Lon: 'lon' } },
    // Professeur·es : une ligne par affectation (nom + prénom + UAI) ; le fichier de l'année fait référence.
    { table: 'Professeurs', cle: ['Nom', 'Prenom', 'UAI'], fusion: 'remplacer', champs: { Civilite: 'civilite', Nom: 'nom', Prenom: 'prenom',
      Statut: 'statut', Grade: 'grade', Echelon: 'echelon', Type_nomination: 'typenomination', Entree_grade: 'entreegrade',
      Mode_acces: 'modeacces', Discipline: 'discipline',
      UAI: 'uai', Email: 'email' } },
  ],
};
// Onglet Export (SPEC § 4.6, commun/export.js) : une archive .zip avec un CSV lisible par table, import.csv
// (réimportable par l'onglet Import, si `reimport` et IMPORT sont déclarés) et LISEZMOI.txt. null = pas d'onglet.
/** @type {{ application: string, prefixe: string, tables: string[], reimport: boolean } | null} */
export const EXPORT = { application: "Rapports et suivis", prefixe: PREFIXE, tables: TABLES_DONNEES.filter(t => t !== 'Signatures'), reimport: false };

// Onglet Campagnes (SPEC § 5.5, commun/campagnes.js) : une campagne par période (année scolaire), une seule active.
// null = pas d'onglet. Exemple (recensement annuel) :
// { table: 'Campagnes', code: 'Code', active: 'Active', ouverture: 'Ouverture', cloture: 'Cloture',
//   rattachees: [{ table: 'Reponses', colonne: 'Campagne' }],     // lignes d'une campagne (comptées)
//   listes: [{ table: 'Domaines', colonne: 'Campagnes' }] }       // listes reprises d'une campagne à la suivante
/** @type {import('../commun/campagnes.js').DeclarationCampagnes | null} */
export const CAMPAGNES = null;

// Lieux à placer sur une carte (Contrôles → « Positions », n° 13) : table, colonne du nom affiché, colonnes de
// l'adresse mises bout à bout, colonne de la commune (contrôle du résultat), colonnes de la position. null = pas de bloc.
// Exemple (gabarit carte) : { table: 'Communes', nom: 'Nom', adresse: ['Nom'], commune: 'Nom', lat: 'Lat', lon: 'Lon' }
/** @type {{ table: string, nom: string, adresse: string[], commune?: string, lat: string, lon: string } | null} */
export const LIEUX = null;
// ===== fin des réglages =====

/** @type {[keyof DroitsTable, string][]} */
export const ACTIONS = [['L', 'Lire'], ['C', 'Créer'], ['M', 'Modifier'], ['S', 'Supprimer']];
// Action → colonne de la table Permissions.
/** @type {Record<keyof DroitsTable, string>} */
export const COLONNES_ACTION = { L: 'Lire', C: 'Creer', M: 'Modifier', S: 'Supprimer' };
export const NIVEAUX = ['Non', 'Oui', 'Limité'];

// Liste "Table:Action:Niveau" → { Table: { L, C, M, S } } pour les tables de la matrice.
/** @param {any} droits @returns {Record<string, DroitsTable>} */
export const matriceDroits = droits => matrice(droits, TABLES_DONNEES);

// Même calcul que la formule Utilisateurs.Droits (aperçu avant enregistrement).
/** @param {string[]} roles @param {boolean} actif @param {Ligne[]} permissions @returns {string[]} */
export function droitsCalcules(roles, actif, permissions) {
  if (!actif) return [];
  const droits = new Set();
  for (const role of roles) {
    for (const p of permissions.filter(x => x.Role === role)) {
      for (const [action, col] of Object.entries(COLONNES_ACTION)) {
        if (p[col] === 'Oui' || p[col] === 'Limité') droits.add(`${p.Table}:${action}:${p[col]}`);
      }
    }
  }
  return [...droits].sort();
}

// Niveau suivant au clic dans la matrice : Non → Oui → Limité (si portée définie) → Non.
/** @param {string} niveau @param {string} table @param {string} action @returns {string} */
export function niveauSuivant(niveau, table, action) {
  const possibles = PORTEES[`${table}:${action}`] ? NIVEAUX : ['Non', 'Oui'];
  const i = possibles.indexOf(niveau);
  return possibles[(i + 1) % possibles.length];
}

// { role: { table: ligne Permissions } } + doublons.
/** @param {Ligne[]} permissions @returns {{ index: Record<string, Record<string, Ligne>>, doublons: string[] }} */
export function indexPermissions(permissions) {
  /** @type {Record<string, Record<string, Ligne>>} */
  const index = {};
  /** @type {string[]} */
  const doublons = [];
  for (const p of permissions) {
    index[p.Role] = index[p.Role] || {};
    if (index[p.Role][p.Table]) doublons.push(`${p.Role} × ${p.Table}`);
    else index[p.Role][p.Table] = p;
  }
  return { index, doublons };
}

/** @param {any} e */
const normEmail = e => String(e || '').trim().toLowerCase();

// Vérifie une fiche utilisateur·trice avant enregistrement ; renvoie la liste des erreurs.
/**
 * @param {{ Email: string, Roles: string[], Personne: number }} f @param {Ligne[]} utilisateurs
 * @param {number | null} id @returns {string[]}
 */
export function validerUtilisateur(f, utilisateurs, id) {
  /** @type {string[]} */
  const erreurs = [];
  const email = String(f.Email || '');
  if (!email.trim()) erreurs.push('E-mail obligatoire.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erreurs.push('E-mail invalide (pas d\'espace, un seul @).');
  if (utilisateurs.some(u => u.id !== id && normEmail(u.Email) === normEmail(email))) erreurs.push('Cet e-mail existe déjà.');
  if (!f.Roles.length) erreurs.push('Au moins un rôle.');
  const exigeFiche = f.Roles.filter(r => ROLES_AVEC_FICHE.includes(r));
  if (TABLE_FICHES && exigeFiche.length && !f.Personne) {
    erreurs.push(`${exigeFiche.join(', ')} : fiche obligatoire (droits « Limité » sur ses propres lignes).`);
  }
  return erreurs;
}

// Incohérences entre comptes, fiches et matrice.
// Renvoie [{ niveau: 'erreur'|'alerte'|'info', titre, lignes: [texte] }].
/**
 * @param {{ utilisateurs: Ligne[], permissions: Ligne[], personnes: Ligne[] }} donnees
 * @returns {{ niveau: 'erreur' | 'alerte' | 'info', titre: string, lignes: string[] }[]}
 */
export function controles({ utilisateurs, permissions, personnes }) {
  /** @type {{ niveau: 'erreur' | 'alerte' | 'info', titre: string, lignes: string[] }[]} */
  const res = [];
  const actifs = utilisateurs.filter(u => u.Actif);
  /** @param {'erreur' | 'alerte' | 'info'} niveau @param {string} titre @param {string[]} lignes */
  const ajouter = (niveau, titre, lignes) => res.push({ niveau, titre, lignes });

  ajouter('erreur', 'Aucun compte administrateur·trice actif',
    actifs.some(u => liste(u.Roles).includes('Administrateur·trice')) ? [] : ['Seul·e le ou la propriétaire du document garde la main (règle D1).']);

  /** @type {Record<string, string>} */
  const vus = {};
  /** @type {string[]} */
  const doublons = [];
  for (const u of utilisateurs) {
    const k = normEmail(u.Email);
    if (vus[k]) doublons.push(`${u.Email} (déjà : ${vus[k]})`); else vus[k] = u.Email;
  }
  ajouter('erreur', 'E-mails en double (majuscules ignorées)', doublons);
  ajouter('erreur', 'E-mails vides ou invalides',
    utilisateurs.filter(u => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(u.Email || ''))).map(u => `ligne ${u.id} : « ${u.Email || ''} »`));

  const { index, doublons: dbl } = indexPermissions(permissions);
  /** @type {string[]} */
  const manquantes = [];
  for (const r of ROLES) for (const t of TABLES_DONNEES) if (!(index[r] && index[r][t])) manquantes.push(`${r} × ${t}`);
  ajouter('erreur', 'Permissions : lignes manquantes (droits = Non)', manquantes);
  ajouter('erreur', 'Permissions : lignes en double', dbl);
  /** @type {string[]} */
  const limSansPortee = [], vides = [];
  for (const p of permissions) for (const [a, col] of Object.entries(COLONNES_ACTION)) {
    if (p[col] === 'Limité' && !PORTEES[`${p.Table}:${a}`]) limSansPortee.push(`${p.Role} × ${p.Table} : ${col}`);
    if (!NIVEAUX.includes(p[col])) vides.push(`${p.Role} × ${p.Table} : ${col} = « ${p[col] ?? ''} »`);
  }
  ajouter('alerte', 'Permissions : « Limité » sans portée définie (vaut Non)', limSansPortee);
  ajouter('alerte', 'Permissions : valeurs vides ou inconnues (valent Non)', vides);

  if (TABLE_FICHES) ajouter('alerte', `Comptes ${ROLES_AVEC_FICHE.join(', ')} sans fiche`,
    actifs.filter(u => !u.Personne && liste(u.Roles).some(r => ROLES_AVEC_FICHE.includes(r))).map(u => u.Email));

  // À ADAPTER : contrôles propres à l'application (ex. responsables d'un projet actif sans compte actif).
  // Lire les tables utiles dans charger() (D.xxx), les passer ici et ajouter('erreur' | 'alerte' | 'info', titre, lignes).

  ajouter('info', 'E-mail du compte différent de celui de la fiche personne', utilisateurs.filter(u => {
    const p = personnes.find(x => x.id === u.Personne);
    return p && p.Email && normEmail(p.Email) !== normEmail(u.Email);
  }).map(u => `${u.Email} ≠ fiche : ${personnes.find(x => x.id === u.Personne)?.Email}`));

  ajouter('info', 'Comptes inactifs', utilisateurs.filter(u => !u.Actif).map(u => u.Email));
  return res;
}

// --- Chiffrement (SPEC § 5.8, commun/chiffrement.js ; déclaration CHIFFREMENT de config.js) ---
// Contrôles : état de la table Chiffrement, valeurs restées en clair dans un champ chiffré, valeurs indéchiffrables.
// etat : etatChiffrement(…) ; enClair, echecs : [{ table, id, col }] (dechiffrerLignes) ; revele : clé disponible.
/**
 * @param {{ statut: string, nb?: number, manquantes?: string[], erreur?: string }} etat
 * @param {{ table: string, id: number, col: string }[]} enClair @param {{ table: string, id: number, col: string }[]} echecs
 * @param {boolean} revele @param {{ table: string, id: number }[]} [sansCode]
 * @returns {{ niveau: 'erreur' | 'alerte' | 'info', titre: string, lignes: string[] }[]}
 */
export function controlesChiffrement(etat, enClair, echecs, revele, sansCode = []) {
  const cellule = /** @param {{ table: string, id: number, col: string }} c */ c => `${c.table}.${c.col}, ligne ${c.id}`;
  const statut = {
    absente: 'table Chiffrement absente : onglet Chiffrement → « Créer la table »',
    erreur: `table Chiffrement illisible (${etat.erreur || 'règles d\'accès'}) : elle doit être lisible par les comptes actifs`,
    incomplete: `table Chiffrement incomplète${etat.manquantes && etat.manquantes.length ? ` (colonnes manquantes : ${etat.manquantes.join(', ')})` : ''}`,
    vide: 'aucune phrase secrète : onglet Chiffrement → « Créer la phrase »',
    plusieurs: `${etat.nb} lignes dans la table Chiffrement : une seule doit rester (la plus récente est sans doute la bonne)`,
  }[etat.statut];
  return [
    { niveau: 'erreur', titre: 'Chiffrement : table et phrase', lignes: statut ? [statut] : [] },
    { niveau: 'alerte', titre: 'Valeurs en clair dans des champs chiffrés (onglet Chiffrement → « Chiffrer »)', lignes: enClair.map(cellule) },
    { niveau: 'erreur', titre: 'Valeurs indéchiffrables avec la phrase actuelle', lignes: echecs.map(cellule) },
    { niveau: 'alerte', titre: 'Lignes sans pseudonyme (onglet Chiffrement → « Chiffrer »)', lignes: sansCode.map(c => `${c.table}, ligne ${c.id}`) },
    { niveau: 'info', titre: 'Données masquées : valeurs indéchiffrables et doublons des fiches chiffrées non contrôlés (bouton Révéler)',
      lignes: revele || statut ? [] : ['Révéler les données pour faire ces contrôles.'] },
  ];
}
// Valeurs en clair → UpdateRecord avec ces mêmes valeurs (à chiffrer par chiffrerActions, puis regrouperMaj).
/** @param {Record<string, Ligne[]>} donnees lignes brutes, telles que lues @param {{ table: string, id: number, col: string }[]} enClair */
export function actionsEnClair(donnees, enClair) {
  /** @type {Map<string, any[]>} */
  const parLigne = new Map();
  for (const c of enClair) {
    const l = (donnees[c.table] || []).find(x => x.id === c.id);
    if (!l) continue;
    const k = `${c.table}|${c.id}`;
    if (!parLigne.has(k)) parLigne.set(k, ['UpdateRecord', c.table, c.id, {}]);
    /** @type {any[]} */ (parLigne.get(k))[3][c.col] = l[c.col];
  }
  return [...parLigne.values()];
}

export { nomFiche };
