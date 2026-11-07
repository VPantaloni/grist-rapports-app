// @ts-check
// Logique pure de l'Administration (sans DOM ni grist) : testable avec Node (tests/admin.test.js).
import { liste, nomFiche } from '../commun/donnees.js';
import { matriceDroits as matrice } from '../commun/droits.js';
import { PREFIXE } from '../commun/config.js';

// ===== À ADAPTER (APP § 4 et § 8) =====
// Tables de données présentes dans la matrice Permissions (pas Utilisateurs, Permissions, Navigation).
export const TABLES_DONNEES = ['Personnes', 'Projets'];
// Table des fiches vers laquelle pointe Utilisateurs.Personne ('' si l'application n'en a pas).
export const TABLE_FICHES = 'Personnes';
// Rôles qui exigent une fiche (leurs droits « Limité » portent sur « mes » lignes).
export const ROLES_AVEC_FICHE = ['Contributeur·trice'];
// Mêmes valeurs que les choix de Utilisateurs.Roles et Permissions.Role.
export const ROLES = ['Administrateur·trice', 'Gestionnaire', 'Contributeur·trice', 'Lecteur·trice'];
// Légende des rôles (onglets Accès et Permissions) : qui reçoit chaque rôle, en une phrase.
/** @type {Record<string, string>} */
export const DESCRIPTIONS_ROLES = {
  'Administrateur·trice': 'administrateur·trices de l\'application : comptes, permissions, imports',
  'Gestionnaire': 'gère toutes les fiches et tous les projets',
  'Contributeur·trice': 'crée des projets et modifie ceux dont elle ou il est responsable',
  'Lecteur·trice': 'consulte seulement',
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
export const PORTEES = {
  'Projets:M': 'projet dont on est responsable',
};
// Onglet Import (SPEC § 4.5, commun/import.js) : colonnes du fichier (liste blanche) et tables à remplir, dans l'ordre.
// null = pas d'onglet Import. Exemple du fil rouge : une ligne par projet, avec l'e-mail de sa ou son responsable.
/** @type {import('../commun/import.js').DeclarationImport | null} */
export const IMPORT = {
  nomModele: `${PREFIXE}-modele-import.csv`,
  colonnes: {
    email: { type: 'email', synonymes: ['courriel', 'mel', 'responsable'], libelle: 'e-mail de la ou du responsable', exemple: 'camille.martin@exemple.example' },
    prenom: { type: 'texte', libelle: 'prénom de la ou du responsable', exemple: 'Camille' },
    nom: { type: 'texte', libelle: 'nom de la ou du responsable', exemple: 'Martin' },
    titre: { type: 'texte', obligatoire: true, synonymes: ['projet', 'intitule'], libelle: 'titre du projet', exemple: 'Atlas' },
    statut: { type: 'choix', valeurs: ['En cours', 'Terminé'], libelle: 'état du projet', exemple: 'En cours' },
    description: { type: 'texte', libelle: 'description du projet' },
  },
  tables: [
    // Personnes : rapprochées par e-mail ; une personne existante n'est que complétée (cases vides).
    { table: 'Personnes', cle: ['Email'], champs: { Email: 'email', Prenom: 'prenom', Nom: 'nom' } },
    // Projets : rapprochés par titre ; complétés ; une ligne par responsable (réunis par projet), par leur e-mail.
    { table: 'Projets', cle: ['Titre'], champs: { Titre: 'titre', Statut: 'statut', Description: 'description',
      Responsables: { ref: 'Personnes', par: 'email', liste: true } } },
  ],
};
// Onglet Export (SPEC § 4.6, commun/export.js) : une archive .zip avec un CSV lisible par table, import.csv
// (réimportable par l'onglet Import, si `reimport` et IMPORT sont déclarés) et LISEZMOI.txt. null = pas d'onglet.
/** @type {{ application: string, prefixe: string, tables: string[], reimport: boolean } | null} */
export const EXPORT = { application: "Rapports d'inspection", prefixe: PREFIXE, tables: ['Personnes', 'Projets'], reimport: true };

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
