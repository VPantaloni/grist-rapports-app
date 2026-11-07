// @ts-check
// Campagnes (périodes : une par année scolaire, une seule active) : SPEC § 5.5. Repris de grist-formateurs-app et
// grist-rdvc-app. Logique pure, testée avec Node (tests/campagnes.test.js) ; l'onglet Campagnes de l'Administration et
// les écrans (campagne affichée par défaut) s'en servent.
import { liste, refIds } from './donnees.js';

/**
 * @typedef {object} DeclarationCampagnes
 * @property {string} table                                   ex. 'Campagnes'
 * @property {string} code                                    colonne du code (ex. '2026-2027', unique)
 * @property {string} active                                  colonne Booléen : une seule campagne active
 * @property {string} [ouverture]                             colonnes Date facultatives
 * @property {string} [cloture]
 * @property {boolean} [anneeScolaire]                        code au format AAAA-AAAA (défaut : oui)
 * @property {{ table: string, colonne: string }[]} [rattachees]  lignes d'une campagne (référence) : comptées, et une
 *                                                            campagne qui en a ne peut pas être supprimée
 * @property {{ table: string, colonne: string }[]} [listes]  listes de références → campagnes (ex. domaines proposés) :
 *                                                            reprises d'une campagne à la suivante
 */

const RE_ANNEE = /^(\d{4})-(\d{4})$/;
// Année scolaire « 2026-2027 » (deux années qui se suivent).
/** @param {any} t */
export const anneeValide = t => { const m = RE_ANNEE.exec(String(t || '').trim()); return !!m && +m[2] === +m[1] + 1; };

// Code de la campagne suivante : après la plus récente (« 2026-2027 » → « 2027-2028 ») ; sinon l'année scolaire en cours
// (à partir d'août).
/** @param {string[]} codes @param {Date} [maintenant] @returns {string} */
export function codeSuivant(codes, maintenant = new Date()) {
  const debuts = codes.filter(anneeValide).map(c => +String(c).trim().slice(0, 4));
  const d = debuts.length ? Math.max(...debuts) + 1 : maintenant.getFullYear() - (maintenant.getMonth() < 7 ? 1 : 0);
  return `${d}-${d + 1}`;
}

// Campagnes triées de la plus récente à la plus ancienne (ordre des codes).
/** @param {Ligne[]} campagnes @param {DeclarationCampagnes} decl */
export const trierCampagnes = (campagnes, decl) =>
  [...campagnes].sort((a, b) => String(b[decl.code] || '').localeCompare(String(a[decl.code] || ''), 'fr'));

// Campagne active (affichée par défaut dans les écrans), ou à défaut la plus récente ; null si aucune.
/** @param {Ligne[]} campagnes @param {DeclarationCampagnes} decl @returns {Ligne | null} */
export function campagneActive(campagnes, decl) {
  return campagnes.find(c => c[decl.active] === true) || trierCampagnes(campagnes, decl)[0] || null;
}

// Nombre de lignes rattachées à chaque campagne : Map id → nombre (toutes tables déclarées).
/** @param {DeclarationCampagnes} decl @param {Record<string, Ligne[]>} donnees @returns {Map<number, number>} */
export function nombresRattaches(decl, donnees) {
  /** @type {Map<number, number>} */
  const n = new Map();
  for (const r of decl.rattachees || []) for (const l of donnees[r.table] || []) for (const id of refIds(l[r.colonne])) n.set(id, (n.get(id) || 0) + 1);
  return n;
}

// État : 'active', 'close' (des lignes rattachées), ou 'en préparation'.
/** @param {Ligne} c @param {number} rattaches @param {DeclarationCampagnes} decl */
export const etatCampagne = (c, rattaches, decl) => (c[decl.active] === true ? 'active' : rattaches ? 'close' : 'en préparation');

// Vérifie une campagne avant enregistrement (f : champs saisis) ; renvoie les erreurs.
/** @param {Record<string, any>} f @param {Ligne[]} campagnes @param {number | null} id @param {DeclarationCampagnes} decl */
export function validerCampagne(f, campagnes, id, decl) {
  /** @type {string[]} */
  const erreurs = [];
  const code = String(f[decl.code] || '').trim();
  if (!code) erreurs.push('Code obligatoire.');
  else if (decl.anneeScolaire !== false && !anneeValide(code)) erreurs.push('Code : année scolaire au format 2026-2027.');
  if (code && campagnes.some(c => c.id !== id && String(c[decl.code] || '').trim() === code)) erreurs.push('Cette campagne existe déjà.');
  if (decl.ouverture && decl.cloture && f[decl.ouverture] && f[decl.cloture] && f[decl.cloture] < f[decl.ouverture]) {
    erreurs.push('La clôture précède l\'ouverture.');
  }
  return erreurs;
}

// Activer une campagne : les autres actives sont désactivées dans le même envoi (une seule active à tout moment).
/** @param {Ligne[]} campagnes @param {number} id @param {DeclarationCampagnes} decl */
export function actionsActiver(campagnes, id, decl) {
  return campagnes.filter(c => (c.id === id) !== (c[decl.active] === true))
    .map(c => ['UpdateRecord', decl.table, c.id, { [decl.active]: c.id === id }]);
}
// Fermer : plus aucune campagne active.
/** @param {Ligne[]} campagnes @param {DeclarationCampagnes} decl */
export function actionsFermer(campagnes, decl) {
  return campagnes.filter(c => c[decl.active] === true).map(c => ['UpdateRecord', decl.table, c.id, { [decl.active]: false }]);
}

// Reprise des listes : la campagne `nouvelle` est ajoutée à chaque ligne qui propose déjà `source` (ex. domaines,
// formations du catalogue). Rien n'est retiré.
/** @param {DeclarationCampagnes} decl @param {number} nouvelle @param {number} source @param {Record<string, Ligne[]>} donnees */
export function actionsReprise(decl, nouvelle, source, donnees) {
  /** @type {any[][]} */
  const actions = [];
  for (const l of decl.listes || []) {
    for (const ligne of donnees[l.table] || []) {
      const ids = liste(ligne[l.colonne]);
      if (ids.includes(source) && !ids.includes(nouvelle)) actions.push(['UpdateRecord', l.table, ligne.id, { [l.colonne]: ['L', ...ids, nouvelle] }]);
    }
  }
  return actions;
}

// Contrôles (onglet Contrôles) : nombre de campagnes actives, codes invalides ou en double, dates incohérentes.
/** @param {Ligne[]} campagnes @param {DeclarationCampagnes} decl */
export function controlesCampagnes(campagnes, decl) {
  const o = decl.ouverture || '', f = decl.cloture || '';
  const actives = campagnes.filter(c => c[decl.active] === true);
  const vus = new Map(), doublons = [];
  for (const c of campagnes) { const k = String(c[decl.code] || '').trim(); if (vus.has(k)) doublons.push(k); else vus.set(k, c.id); }
  return [
    { niveau: 'erreur', titre: 'Plusieurs campagnes actives (une seule attendue)', lignes: actives.length > 1 ? actives.map(c => String(c[decl.code])) : [] },
    { niveau: 'alerte', titre: 'Aucune campagne active', lignes: campagnes.length && !actives.length ? ['Les écrans affichent la plus récente.'] : [] },
    { niveau: 'erreur', titre: 'Campagnes en double', lignes: doublons },
    { niveau: 'alerte', titre: 'Codes de campagne invalides (format 2026-2027)',
      lignes: decl.anneeScolaire === false ? [] : campagnes.filter(c => !anneeValide(c[decl.code])).map(c => `« ${c[decl.code] ?? ''} »`) },
    { niveau: 'alerte', titre: 'Clôture avant l\'ouverture',
      lignes: o && f ? campagnes.filter(c => c[o] && c[f] && c[f] < c[o]).map(c => String(c[decl.code])) : [] },
  ];
}
