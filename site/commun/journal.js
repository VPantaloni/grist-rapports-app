// @ts-check
// Journal des refus et des erreurs d'écriture (SPEC § 3.6) : la personne voit un message simple, le détail est gardé
// ici et se lit dans l'Administration (onglet Mon compte, Diagnostic). Testable avec Node (tests/commun.test.js).
// Rien de personnel : on garde le type d'action, la table, le n° de ligne et le nom des colonnes, jamais les valeurs.
// Conservé dans ce navigateur (localStorage, 50 entrées au plus), pour toutes les pages de l'application.
import { PREFIXE } from './config.js';

const CLE = PREFIXE + 'Journal';
export const TAILLE_JOURNAL = 50;

/** @typedef {{ quand: string, ecran: string, type: 'refus' | 'erreur', message: string, actions: string }} EntreeJournal */

// Refus des règles d'accès (ou du partage), d'après le message de Grist ; sinon autre erreur.
/** @param {any} message @returns {'refus' | 'erreur'} */
export function classerErreur(message) {
  return /blocked|denied|access|acc[eè]s|refus|only owners or editors|no write|not allowed/i.test(String(message || ''))
    ? 'refus' : 'erreur';
}

// Message montré à la personne (le détail va au journal).
/** @param {'refus' | 'erreur'} type @returns {string} */
export function messageSimple(type) {
  return type === 'refus'
    ? 'Action refusée par les règles d\'accès du document. Le détail est dans l\'Administration (Mon compte → Diagnostic).'
    : 'L\'enregistrement a échoué. Recharge la page, puis réessaie ; le détail est dans l\'Administration (Mon compte → Diagnostic).';
}

// Résumé des actions sans leurs valeurs : « UpdateRecord Projets #3 (Titre, Statut) ; RemoveRecord Projets #4 ».
/** @param {any[]} actions @returns {string} */
export function resumerActions(actions) {
  return (Array.isArray(actions) ? actions : []).map(a => {
    if (!Array.isArray(a)) return '?';
    const [type, table, id, champs] = a;
    const ligne = typeof id === 'number' ? ` #${id}` : Array.isArray(id) ? ` (${id.length} lignes)` : '';
    const colonnes = champs && typeof champs === 'object' && !Array.isArray(champs) ? ` (${Object.keys(champs).join(', ')})` : '';
    return `${String(type)} ${String(table ?? '')}${ligne}${colonnes}`.trim();
  }).join(' ; ');
}

// Nouvelle liste : l'entrée en tête, au plus `max` entrées.
/** @param {EntreeJournal[]} liste @param {EntreeJournal} entree @param {number} [max] @returns {EntreeJournal[]} */
export function ajouterEntree(liste, entree, max = TAILLE_JOURNAL) {
  return [entree, ...(Array.isArray(liste) ? liste : [])].slice(0, max);
}

/** @returns {EntreeJournal[]} */
export function lireJournal() {
  try { const l = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(l) ? l : []; }
  catch (e) { return []; }
}

/** @param {any} erreur @param {any[]} actions @param {string} [ecran] @returns {EntreeJournal} */
export function journaliser(erreur, actions, ecran = '') {
  const message = String((erreur && erreur.message) || erreur || '').slice(0, 500);
  /** @type {EntreeJournal} */
  const entree = { quand: new Date().toISOString(), ecran: ecran || pageCourante(), type: classerErreur(message), message,
    actions: resumerActions(actions) };
  try { localStorage.setItem(CLE, JSON.stringify(ajouterEntree(lireJournal(), entree))); } catch (e) { /* stockage indisponible */ }
  console.warn('[journal]', entree);
  return entree;
}

export function viderJournal() {
  try { localStorage.removeItem(CLE); } catch (e) { /* stockage indisponible */ }
}

// Écran courant : dossier de la page (…/projets/ → projets).
function pageCourante() {
  try { return location.pathname.split('/').filter(Boolean)[0] || 'accueil'; } catch (e) { return ''; }
}
