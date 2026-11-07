// @ts-check
// Accès à Grist depuis un écran : chargement de l'API, lecture, écriture, liens avec le conteneur app/.
// SPEC § 3.2, 3.3, 3.5, 3.6 et 6.2. Rien ne s'exécute à l'import.
import { columnsToRows } from './donnees.js';
import { message, toast } from './interface.js';
import { journaliser, messageSimple } from './journal.js';

// Relais du conteneur app/ (même site), ou null : page Grist seule, où le parent est d'un autre site (accès refusé).
/** @returns {AppHote | null} */
export function hote() {
  try { return (window.parent !== window && window.parent.appHote) || null; }
  catch (e) { return null; }
}

/** @param {string} src @returns {Promise<void>} */
function chargerScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => (window.grist ? resolve() : reject(new Error('API absente')));
    s.onerror = () => { s.remove(); reject(new Error('Échec du chargement : ' + src)); };
    document.head.appendChild(s);
  });
}

// Origine de la page Grist qui affiche le widget (referrer, puis ancestorOrigins), ou '' si inconnue.
/** @returns {string} */
export function origineGrist() {
  try { if (document.referrer) return new URL(document.referrer).origin; } catch (e) { /* referrer invalide */ }
  try { if (location.ancestorOrigins && location.ancestorOrigins[0]) return location.ancestorOrigins[0]; } catch (e) { /* non disponible */ }
  return '';
}

// Charge l'API Grist (window.grist) : 0. relais du conteneur, 1. origine de la page Grist, 2. grist.numerique.gouv.fr,
// 3. docs.getgrist.com. Renvoie false si aucune ne répond.
/** @returns {Promise<boolean>} */
export async function chargerApiGrist() {
  const h = hote();
  if (h) { window.grist = h.api(window); return true; }
  const origines = [origineGrist(), 'https://grist.numerique.gouv.fr', 'https://docs.getgrist.com'].filter(Boolean);
  for (const o of [...new Set(origines)]) {
    try { await chargerScript(o + '/grist-plugin-api.js'); return true; } catch (e) { /* origine suivante */ }
  }
  return false;
}

// Démarrage commun : hors de Grist ou API introuvable, affiche un message clair et renvoie false (l'écran s'arrête,
// sans appeler grist.ready) ; sinon renvoie true. window.__GRIST_MOCK__ : tests avec une fausse API.
/** @returns {Promise<boolean>} */
export async function initialiserGrist() {
  if (window.self === window.top && !window.__GRIST_MOCK__) {
    message('Ce widget s\'utilise dans Grist : vue « Personnalisé » → URL personnalisée.', true);
    return false;
  }
  if (!window.__GRIST_MOCK__ && !(await chargerApiGrist())) {
    message('Impossible de charger l\'API Grist. Vérifie ta connexion, puis recharge la page.', true);
    return false;
  }
  return true;
}

// Promesse limitée dans le temps : rejetée si elle n'a pas répondu après `ms` millisecondes. Grist peut ne jamais
// répondre (visiteur non connecté, document inaccessible) : sans limite, la page resterait blanche.
/** @template T @param {Promise<T>} promesse @param {number} ms @returns {Promise<T>} */
export function avecDelai(promesse, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Grist ne répond pas (${Math.round(ms / 1000)} s).`)), ms);
    Promise.resolve(promesse).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// Lit une table par son nom ; renvoie { lignes } ou { erreur } (table absente, refusée par les règles d'accès, ou Grist
// sans réponse après 15 s).
/** @param {string} tableId @returns {Promise<{ lignes: Ligne[], erreur?: undefined } | { lignes?: undefined, erreur: string }>} */
export async function lireTable(tableId) {
  try { return { lignes: columnsToRows(await avecDelai(grist.docApi.fetchTable(tableId), 15000)) }; }
  catch (e) { return { erreur: (e && e.message) || String(e) }; }
}

// Écrit (applyUserActions) ; toast de réussite, puis `relire()` après une écriture réussie (SPEC § 3.6). En cas
// d'échec : message simple (refus des règles d'accès, ou autre erreur) et détail au journal (journal.js).
// Renvoie la réponse de Grist (retValues…), ou null en cas d'échec.
/**
 * @param {any[]} actions @param {string} [ok] @param {() => any} [relire]
 * @returns {Promise<{ retValues?: any[] } | null>}
 */
export async function ecrire(actions, ok, relire) {
  let res;
  try { res = await grist.docApi.applyUserActions(actions); }
  catch (e) { toast(messageSimple(journaliser(e, actions).type), true); return null; }
  if (ok) toast(ok);
  if (relire) await relire();
  return res || {};
}

// Lecture sans chevauchement : un seul appel de `fn` à la fois ; un appel pendant la lecture la relance ensuite.
/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {() => Promise<T | undefined>}
 */
export function sansChevauchement(fn) {
  /** @type {Promise<T | undefined> | null} */
  let enCours = null;
  let encore = false;
  /** @returns {Promise<T | undefined>} */
  const lancer = () => {
    if (enCours) { encore = true; return enCours; }
    enCours = (async () => {
      try { return await fn(); }
      finally { enCours = null; if (encore) { encore = false; lancer(); } }
    })();
    return enCours;
  };
  return lancer;
}

// Relecture régulière (SPEC § 3.5) : toutes les 15 s, onglet visible et `occupe()` faux (saisie en cours…).
// Dans le conteneur, rien : c'est le conteneur qui prévient l'écran affiché (un seul minuteur pour tous les écrans).
/** @param {() => any} relire @param {() => boolean} [occupe] */
export function relectureReguliere(relire, occupe = () => false) {
  if (hote()) return;
  setInterval(() => { if (!document.hidden && !occupe()) relire(); }, 15000);
}

// Bouton ↻ : relire depuis Grist, sans le cache du conteneur (tables stables comprises).
/** @param {() => any} relire */
export function relireSansCache(relire) {
  const h = hote();
  if (h && h.viderCache) h.viderCache();
  return relire();
}

// Détecteur de changement : vrai si les données diffèrent de l'appel précédent (empreinte JSON). Une relecture qui ne
// change rien ne refait pas l'affichage (pas de clignotement, pas de perte de défilement).
/** @returns {(donnees: any) => boolean} */
export function detecteurChangement() {
  let precedente = '';
  return donnees => {
    const e = JSON.stringify(donnees);
    if (e === precedente) return false;
    precedente = e;
    return true;
  };
}

// Regroupe les rafales d'appels (onRecords, retour sur l'onglet) : `fn` une seule fois, `delai` ms après le dernier.
/** @param {() => any} fn @param {number} [delai] @returns {() => void} */
export function regrouper(fn, delai = 150) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let minuterie;
  return () => { clearTimeout(minuterie); minuterie = setTimeout(fn, delai); };
}

// --- Lien entre écrans (conteneur app/ seulement, SPEC § 6.2) ---
// Relais du conteneur s'il peut ouvrir l'écran `cle` (présent dans le menu de la personne), sinon null.
/** @param {string} cle @returns {AppHote | null} */
export function hoteEcran(cle) {
  const h = hote();
  return cle && h && h.peutOuvrir && h.peutOuvrir(cle) ? h : null;
}
// Plein écran d'un écran (à appeler sur un clic) : dans le conteneur, menu masqué et plein écran du navigateur tenté ;
// seul, plein écran du navigateur tenté pour la page. Renvoie 'navigateur', 'conteneur' ou 'ecran' (rien obtenu de plus
// que la mise en page de l'écran). Les cadres (Grist, conteneur) doivent autoriser « fullscreen » pour le navigateur.
/** @param {boolean} actif @returns {Promise<string>} */
export async function pleinEcranConteneur(actif) {
  const h = hote();
  if (h && h.pleinEcran) { try { return await h.pleinEcran(window, actif); } catch (e) { return 'ecran'; } }
  return basculerPleinEcranNavigateur(document, actif);
}
// Plein écran du navigateur pour un document (la page de l'écran, ou celle du conteneur) : 'navigateur' si obtenu.
/** @param {Document} doc @param {boolean} actif @returns {Promise<string>} */
export async function basculerPleinEcranNavigateur(doc, actif) {
  try {
    if (!actif) { if (doc.fullscreenElement) await doc.exitFullscreen(); return 'ecran'; }
    if (!doc.fullscreenEnabled) return 'ecran';
    if (!doc.fullscreenElement) await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return 'navigateur';
  } catch (e) { return 'ecran'; }   // refusé : cadre sans « allow fullscreen », ou pas de clic récent
}
// Demande qui a ouvert cet écran (ex. { projet: 12 }), prise une seule fois ; null hors conteneur.
/** @returns {any} demande (ex. { projet: 12 }) ou null */
export function demandeConteneur() {
  const h = hote();
  return h && h.prendreDemande ? h.prendreDemande(window) : null;
}

// --- État partagé entre les écrans (conteneur app/, SPEC § 6.2) ---
// Hors conteneur, l'état reste propre à la page (même interface).
/** @type {Map<string, any>} */
const etatLocal = new Map();
/** @param {string} cle @returns {any} */
export function lireEtat(cle) {
  const h = hote();
  return h && h.lireEtat ? h.lireEtat(cle) : etatLocal.get(cle);
}
/** @param {string} cle @param {any} valeur */
export function ecrireEtat(cle, valeur) {
  const h = hote();
  if (h && h.ecrireEtat) h.ecrireEtat(cle, valeur, window); else etatLocal.set(cle, valeur);
}
// rappel(valeur) quand un autre écran (ou le conteneur) change la valeur.
/** @param {string} cle @param {(valeur: any) => void} rappel */
export function suivreEtat(cle, rappel) {
  const h = hote();
  if (h && h.suivreEtat) h.suivreEtat(window, cle, rappel);
}
