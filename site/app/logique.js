// @ts-check
// Logique pure du conteneur (sans DOM ni grist) : testable avec Node (tests/app.test.js).
import { liste } from '../commun/donnees.js';
import { compteConnecte } from '../commun/droits.js';

// Écrans connus : clé de la table Navigation (colonne Widget) → dossier du widget et libellé par défaut.
// À ADAPTER (APP § 9) : un écran par widget de l'application. La clé est celle de Navigation.Widget,
// l'icône est dans ICONES de index.html (même clé). Exemple : Personnes, Projets, Administration.
/** @type {Record<string, { dossier: string, libelle: string }>} */
export const ECRANS = {
  plan: { dossier: 'plan', libelle: "Plan d'inspection" },
  rapports: { dossier: 'rapports', libelle: 'Rapports' },
  modeles: { dossier: 'modeles', libelle: 'Modèles & phrases' },
  annuaire: { dossier: 'annuaire', libelle: 'Annuaire' },
  admin: { dossier: 'admin', libelle: 'Administration' },
  // Ajouté par le conteneur (pas de ligne Navigation) pour qui n'a pas l'Administration : même widget, onglet Mon compte.
  compte: { dossier: 'admin', libelle: 'Mon compte' },
};
// Tables qui changent rarement (ex. annuaire d'établissements de plusieurs centaines de lignes) : le conteneur garde
// leur lecture jusqu'à une écriture, un retour sur l'écran ou le bouton ↻ ; la relecture des 15 s ne les relit pas.
// À ADAPTER (APP § 9) : noms de tables, [] si aucune.
/** @type {string[]} */
export const TABLES_STABLES = ['Etablissements', 'Professeurs', 'Types_rapport', 'Rubriques', 'Competences_MD', 'Parametres'];

// Reprise d'une application d'avant la v2 (SPEC § 9) : noms sous lesquels ses anciens écrans cherchent le relais
// (ex. 'laboHote'). Ils n'utilisent que api(fenetre) : ready, onRecords, fetchTable, applyUserActions, comme le relais
// actuel. Ces écrans tournent ainsi tels quels dans le conteneur, en attendant d'être repris un par un.
// À ADAPTER : [] pour une application neuve.
/** @type {string[]} */
export const ANCIENS_NOMS_RELAIS = [];

// Écran connu ? (clés propres seulement : « toString », « __proto__ »… ne sont pas des écrans)
/** @param {any} cle @returns {boolean} */
export const estEcran = cle => typeof cle === 'string' && Object.prototype.hasOwnProperty.call(ECRANS, cle);

// Menu par défaut si la table Navigation est absente ou vide (Administration réservée aux admins).
export const MENU_DEFAUT = Object.entries(ECRANS).filter(([k]) => k !== 'compte').map(([Widget, e], i) => ({
  Libelle: e.libelle, Widget, Ordre: (i + 1) * 10, Roles: Widget === 'admin' ? ['L', 'Administrateur·trice'] : [], Visible: true,
}));

// Compte connecté, d'après les lignes lisibles de Utilisateurs :
// { tous: true } si les règles d'accès ne sont pas encore saisies (Moi vaut « vrai » partout : mise en place),
// { moi } si le compte est reconnu et actif,
// { aucun: true, raison: 'inactif' } si le compte est reconnu mais inactif (sa ligne reste lisible),
// { aucun: true, raison: 'anonyme' } si la lecture de Permissions est REFUSÉE (règle `user.IsLoggedIn` → R : seul un
// visiteur non connecté, possible avec le partage public, SPEC § 5.7, ne la lit pas),
// { aucun: true, raison: 'inconnu' } sinon : compte absent de Utilisateurs (ou non connecté, si la règle de
// Permissions n'est pas encore saisie).
/**
 * @param {Ligne[] | null | undefined} utilisateurs @param {boolean} [permissionsRefusees]
 * @returns {{ tous?: true, moi?: Ligne, aucun?: true, raison?: 'inactif' | 'inconnu' | 'anonyme' }}
 */
export function compteMenu(utilisateurs, permissionsRefusees = false) {
  const { regles, moi } = compteConnecte(utilisateurs);
  if (!regles) return { tous: true };
  if (permissionsRefusees) return { aucun: true, raison: 'anonyme' };
  if (moi) return moi.Actif ? { moi } : { aucun: true, raison: 'inactif' };
  return { aucun: true, raison: 'inconnu' };
}

// Page de connexion de Grist, qui ramène ensuite à `retour` (adresse de la page Application). Grist attend dans `next`
// un chemin du même site : on ne garde que chemin et paramètres ; adresse illisible → racine du site.
/** @param {string} origine @param {string} retour @returns {string} */
export function lienConnexion(origine, retour) {
  let chemin = '/';
  try { const u = new URL(retour, origine); if (u.origin === new URL(origine).origin) chemin = u.pathname + u.search; } catch (e) { chemin = '/'; }
  return `${String(origine).replace(/\/+$/, '')}/login?next=${encodeURIComponent(chemin)}`;
}

// Pseudo-rôle de Navigation.Roles : entrée visible aussi pour une personne connectée SANS compte d'accès (ligne
// Utilisateurs), ex. l'écran « ma fiche » (SPEC § 5.6). Ses données restent limitées par les règles d'accès.
export const ROLE_CONNECTE = 'Toute personne connectée';

// Entrées du menu visibles pour « moi » : écran connu, Visible coché, rôle compatible (Roles vide = tout le monde ;
// tous = sans filtre de rôle), triées par Ordre ; un même écran n'apparaît qu'une fois.
// sansCompte : personne sans compte d'accès (compteMenu → raison 'inconnu') : entrées ROLE_CONNECTE seulement.
/**
 * @param {Array<{ [col: string]: any }>} lignes @param {Ligne | null | undefined} moi @param {boolean} [tous] @param {boolean} [sansCompte]
 * @returns {{ cle: string, libelle: string }[]}
 */
export function menuVisible(lignes, moi, tous = false, sansCompte = false) {
  const mesRoles = moi && moi.Actif ? liste(moi.Roles) : [];
  const vus = new Set();
  return lignes
    .filter(l => l.Visible && estEcran(l.Widget))
    .filter(l => {
      const r = liste(l.Roles);
      if (sansCompte) return r.includes(ROLE_CONNECTE);
      return tous || !r.length || r.includes(ROLE_CONNECTE) || r.some(x => mesRoles.includes(x));
    })
    .sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0))
    .filter(l => !vus.has(l.Widget) && vus.add(l.Widget))
    .map(l => ({ cle: l.Widget, libelle: String(l.Libelle || '').trim() || ECRANS[l.Widget].libelle }));
}

// « Mon compte » en dernier pour qui n'a pas l'écran Administration (qui le contient déjà).
/** @param {{ cle: string, libelle: string }[]} entrees */
export function ajouterMonCompte(entrees) {
  return entrees.some(e => e.cle === 'admin' || e.cle === 'compte')
    ? entrees : [...entrees, { cle: 'compte', libelle: ECRANS.compte.libelle }];
}

// « Voir en tant que » (Grist, propriétaires du document) : adresse de la page Grist qui porte ce conteneur, reconstituée
// car le navigateur ne transmet que le site (referrer réduit, SPEC § 6.6). `baseUrl` : jeton d'accès de l'API
// (…[/o/<espace>]/api/docs/<document>) ; `sections` : lignes de _grist_Views_section ; `urlConteneur` : https://…/app
// (avec ou sans barre finale dans la section) ;
// `espaceDefaut` : préfixe d'espace si le jeton n'en donne pas (/o/docs sur grist.numerique.gouv.fr). '' si introuvable.
// `nomDoc` : nom du document ; Grist exige un libellé entre l'identifiant et « p/ » (sinon « p » serait pris pour ce
// libellé et la page pour une table) — sa valeur exacte est indifférente.
/**
 * @param {string | undefined} baseUrl @param {Ligne[]} sections @param {string} urlConteneur @param {string} espaceDefaut
 * @param {string} [nomDoc] @returns {string}
 */
export function adressePageGrist(baseUrl, sections, urlConteneur, espaceDefaut, nomDoc) {
  const d = adresseDocument(baseUrl, espaceDefaut, nomDoc);
  const s = (sections || []).find(x => sectionDuConteneur(x, urlConteneur));
  return d && s && s.parentId ? `${d}/p/${s.parentId}` : '';
}
// Adresse du document (…/o/<espace>/<document>/<libellé>), sans page ; '' si le jeton ne la donne pas.
/** @param {string | undefined} baseUrl @param {string} espaceDefaut @param {string} [nomDoc] @returns {string} */
export function adresseDocument(baseUrl, espaceDefaut, nomDoc) {
  const i = String(baseUrl || '').indexOf('/api/docs/');
  if (i < 0) return '';
  let prefixe = String(baseUrl).slice(0, i);
  const doc = String(baseUrl).slice(i + '/api/docs/'.length).split(/[/?#]/)[0];
  if (!/\/o\/[^/]+$/.test(prefixe)) prefixe += espaceDefaut || '';
  const libelle = String(nomDoc || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  return doc ? `${prefixe}/${doc}/${libelle}` : '';
}

// Bouton Accueil (n° 3, repris de grist-dataviz-app) : la page d'accueil reçoit le document d'où l'on vient et ses
// pages, pour que ses liens y mènent (sinon : démonstration). Fragment « #g=… » (jamais envoyé au serveur), JSON
// compact encodé en base64url : illisible à l'œil, mais pas secret (l'accueil, public, sait le décoder).
// Numéro de page (vue) de chaque dossier du site, d'après les sections du document : { app: 12, admin: 11, … }.
/** @param {Ligne[]} sections @param {string} origine @param {string[]} dossiers @returns {Record<string, number>} */
export function pagesDuSite(sections, origine, dossiers) {
  /** @type {Record<string, number>} */
  const pages = {};
  for (const dossier of dossiers) {
    const s = (sections || []).find(x => sectionDuConteneur(x, `${origine}/${dossier}`));
    if (s && Number.isInteger(s.parentId) && s.parentId > 0) pages[dossier] = s.parentId;
  }
  return pages;
}
/** @param {string} accueil @param {string} adresseDoc @param {Record<string, number>} pages @returns {string} */
export function lienAccueil(accueil, adresseDoc, pages) {
  if (!adresseDoc) return accueil;
  const octets = new TextEncoder().encode(JSON.stringify({ d: adresseDoc, p: pages || {} }));
  let b = '';
  for (const o of octets) b += String.fromCharCode(o);
  return accueil + '#g=' + btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Section dont le widget personnalisé a pour URL le conteneur : « …/app », « …/app/ », « …/app/?… » (toutes colonnes).
/** @param {object} section @param {string} urlConteneur @returns {boolean} */
export function sectionDuConteneur(section, urlConteneur) {
  const base = String(urlConteneur).replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(base + '(?![\\w-])').test(JSON.stringify(section));
}
// Lien vers la page en mode épuré, vue en tant que `email` ('' = soi-même).
/** @param {string} adresse @param {string} email @returns {string} */
export function lienVoirEnTantQue(adresse, email) {
  return adresse + '?style=singlePage' + (email ? '&aclAsUser_=' + encodeURIComponent(email) : '');
}

// Adresse d'un widget du même site, marquée comme hébergée par le conteneur.
/** @param {string} origine @param {string} cle @returns {string} */
export function adresseEcran(origine, cle) {
  if (!estEcran(cle)) throw new Error('Écran inconnu : ' + cle);
  return `${origine}/${ECRANS[cle].dossier}/?hote=app`;
}
