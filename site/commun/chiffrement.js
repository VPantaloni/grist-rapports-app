// @ts-check
// Chiffrement de certains champs dans le navigateur (SPEC § 5.8) : une phrase secrète partagée, jamais envoyée ni
// gardée ; dans Grist, chaque cellule chiffrée est un texte « v1:… » illisible, quel que soit le rôle (propriétaire
// compris). Repris de grist-dataviz-app. WebCrypto, sans bibliothèque : AES-GCM 256, clé dérivée par PBKDF2-SHA256
// (600 000 tours, sel au hasard), clé non exportable. Testé avec Node (tests/chiffrement.test.js).
// Déclaration : CHIFFREMENT dans config.js (null = module inactif).
import { PREFIXE } from './config.js';
import { lireEtat, ecrireEtat, suivreEtat } from './grist.js';

/**
 * @typedef {'texte' | 'nombre' | 'liste'} GenreChiffre
 * @typedef {object} DeclarationChiffrement
 * @property {Record<string, Record<string, GenreChiffre>>} champs   { Table: { Colonne: genre } }
 * @property {Record<string, string>} [codes]                       { Table: colonne du pseudonyme } (facultatif)
 * @typedef {{ id: number, Sel: string, Iterations: number, Version: number, Verificateur: string, Modifie?: any, Indice?: string }} LigneChiffrement
 */

export const VERSION = 1;
export const ITERATIONS = 600000;
export const PREFIXE_CHIFFRE = 'v1:';
const TEMOIN = 'Grist';
export const TABLE_CHIFFREMENT = 'Chiffrement';
export const PHRASE_LONGUEUR_MIN = 12;
export const COLONNES_CHIFFREMENT = [
  { id: 'Sel', type: 'Text' }, { id: 'Iterations', type: 'Int' }, { id: 'Version', type: 'Int' }, { id: 'Verificateur', type: 'Text' },
];
// Date de création ou du dernier changement de la phrase (rien de secret).
export const COLONNE_MODIFIE = { id: 'Modifie', type: 'Date' };
// Indice facultatif, affiché dans la fenêtre « Révéler » (lisible de tous les comptes : jamais la phrase elle-même).
export const COLONNE_INDICE = { id: 'Indice', type: 'Text' };
// Révélation : 6 heures sans activité (clic ou frappe), puis tout repasse en masqué.
export const DUREE_MS = 6 * 60 * 60 * 1000;   // 6 heures (APP § 11, 2026-11-07 ; 5 minutes dans le kit)

// --- Outils ---
export const cryptoDisponible = () => !!(globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.getRandomValues);
/** @param {Uint8Array} o */
export function octetsVersB64(o) {
  let s = '';
  for (let i = 0; i < o.length; i++) s += String.fromCharCode(o[i]);
  return btoa(s);
}
/** @param {string} t */
export function b64VersOctets(t) {
  const s = atob(t), o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}
// Phrase saisie : espaces de début et de fin retirés, forme Unicode normalisée (accents saisis de façons différentes).
/** @param {any} phrase */
export const normaliserPhrase = phrase => String(phrase ?? '').trim().normalize('NFC');

// --- Clé et chiffrement ---
// Paramètres d'une nouvelle phrase (ligne de la table Chiffrement, sans le vérificateur).
export function nouveauxParametres(iterations = ITERATIONS) {
  return { Sel: octetsVersB64(crypto.getRandomValues(new Uint8Array(16))), Iterations: iterations, Version: VERSION };
}
// Phrase + paramètres → clé AES non exportable (ses octets ne sont lisibles par personne). Lent à dessein (~0,5 s).
/** @param {string} phrase @param {{ Sel: string, Iterations: number, Version: number }} params @returns {Promise<CryptoKey>} */
export async function deriverCle(phrase, params) {
  const p = normaliserPhrase(phrase);
  if (!p) throw new Error('Phrase secrète vide.');
  if (!params || !params.Sel || !(Number(params.Iterations) > 0)) throw new Error('Paramètres de chiffrement incomplets.');
  if (Number(params.Version) !== VERSION) throw new Error('Version de chiffrement inconnue : ' + params.Version);
  const s = crypto.subtle;
  const base = await s.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await s.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64VersOctets(params.Sel), iterations: Number(params.Iterations) }, base, 256));
  const cle = await s.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
  bits.fill(0);
  return cle;
}
// Valeur → « v1:<base64 (12 octets d'IV + chiffré)> ». Le contexte (« Table.Colonne ») est authentifié : un texte
// copié dans une autre colonne ne se déchiffre pas.
/** @param {CryptoKey} cle @param {any} valeur @param {string} [contexte] */
export async function chiffrer(cle, valeur, contexte = '') {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(contexte) },
    cle, new TextEncoder().encode(JSON.stringify(valeur))));
  const tout = new Uint8Array(12 + ct.length);
  tout.set(iv); tout.set(ct, 12);
  return PREFIXE_CHIFFRE + octetsVersB64(tout);
}
// Texte chiffré → valeur. Erreur si le texte est abîmé, la clé fausse ou le contexte différent.
/** @param {CryptoKey} cle @param {any} texte @param {string} [contexte] */
export async function dechiffrer(cle, texte, contexte = '') {
  if (!estChiffre(texte)) throw new Error('Donnée non chiffrée ou format inconnu.');
  let tout;
  try { tout = b64VersOctets(texte.slice(PREFIXE_CHIFFRE.length)); } catch (e) { throw new Error('Donnée chiffrée abîmée.'); }
  if (tout.length < 12 + 16) throw new Error('Donnée chiffrée abîmée.');
  let clair;
  try {
    clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: tout.slice(0, 12), additionalData: new TextEncoder().encode(contexte) },
      cle, tout.slice(12));
  } catch (e) { throw new Error('Déchiffrement impossible (phrase incorrecte ou donnée modifiée).'); }
  return JSON.parse(new TextDecoder().decode(clair));
}
// Vérificateur rangé dans la table Chiffrement : dit « phrase incorrecte » avant de tout déchiffrer.
/** @param {CryptoKey} cle */
export const creerVerificateur = cle => chiffrer(cle, { temoin: TEMOIN }, TABLE_CHIFFREMENT);
/** @param {CryptoKey} cle @param {string} verificateur */
export async function verifierCle(cle, verificateur) {
  try { return (await dechiffrer(cle, verificateur, TABLE_CHIFFREMENT)).temoin === TEMOIN; } catch (e) { return false; }
}
// Phrase + ligne de la table Chiffrement → clé, ou null si la phrase est incorrecte.
/** @param {string} phrase @param {LigneChiffrement} ligne @returns {Promise<CryptoKey | null>} */
export async function ouvrirAvecPhrase(phrase, ligne) {
  const cle = await deriverCle(phrase, ligne);
  return (await verifierCle(cle, ligne.Verificateur)) ? cle : null;
}

// --- Table Chiffrement (une seule ligne) ---
// État : absente (pas dans _grist_Tables), erreur (lecture refusée), incomplete (colonnes manquantes), vide (aucune
// phrase), plusieurs (plus d'une ligne), prete (une ligne utilisable).
/**
 * @param {{ lignes?: Ligne[], colonnes?: string[], erreur?: string } | null} lecture @param {boolean} existe
 * @returns {{ statut: 'absente' | 'erreur' | 'incomplete' | 'vide' | 'plusieurs' | 'prete', ligne?: LigneChiffrement, manquantes?: string[], nb?: number, erreur?: string }}
 */
export function etatChiffrement(lecture, existe) {
  if (!existe) return { statut: 'absente' };
  if (!lecture || lecture.erreur) return { statut: 'erreur', erreur: lecture ? lecture.erreur : '' };
  const manquantes = COLONNES_CHIFFREMENT.map(c => c.id).filter(c => lecture.colonnes && !lecture.colonnes.includes(c));
  if (manquantes.length) return { statut: 'incomplete', manquantes };
  const lignes = lecture.lignes || [];
  if (!lignes.length) return { statut: 'vide' };
  if (lignes.length > 1) return { statut: 'plusieurs', nb: lignes.length };
  const l = ligneChiffrementValide(lignes);
  return l ? { statut: 'prete', ligne: l } : { statut: 'incomplete', manquantes: [] };
}
// Ligne de la table Chiffrement utilisable (une seule, complète), ou null.
/** @param {Ligne[] | null | undefined} lignes @returns {LigneChiffrement | null} */
export function ligneChiffrementValide(lignes) {
  if (!Array.isArray(lignes) || lignes.length !== 1) return null;
  const l = lignes[0];
  return l.Sel && l.Verificateur && Number(l.Iterations) > 0 ? /** @type {LigneChiffrement} */ (l) : null;
}
// Empreinte de la phrase en usage : change avec elle (sel, vérificateur).
/** @param {LigneChiffrement | null | undefined} l */
export const signatureChiffrement = l => (l ? `${l.Sel}|${l.Iterations}|${l.Version}|${l.Verificateur}` : '');

// Nouvelle phrase saisie deux fois → erreurs (vide = valable).
/** @param {string} p1 @param {string} p2 @returns {string[]} */
export function validerNouvellePhrase(p1, p2) {
  const a = normaliserPhrase(p1), b = normaliserPhrase(p2), err = [];
  if (!a) err.push('Saisis une phrase secrète.');
  else if ([...a].length < PHRASE_LONGUEUR_MIN) err.push(`Au moins ${PHRASE_LONGUEUR_MIN} caractères (une phrase de plusieurs mots est plus sûre).`);
  if (a && a !== b) err.push('Les deux saisies sont différentes.');
  return err;
}
// Changement : phrase actuelle saisie, nouvelle valable et différente.
/** @param {string} ancienne @param {string} p1 @param {string} p2 @returns {string[]} */
export function validerChangementPhrase(ancienne, p1, p2) {
  const err = [];
  if (!normaliserPhrase(ancienne)) err.push('Saisis la phrase actuelle.');
  err.push(...validerNouvellePhrase(p1, p2).map(e => (e === 'Saisis une phrase secrète.' ? 'Saisis la nouvelle phrase.' : e)));
  if (normaliserPhrase(ancienne) && normaliserPhrase(ancienne) === normaliserPhrase(p1)) err.push('La nouvelle phrase doit être différente de l\'actuelle.');
  return err;
}
/** @param {Date} [d] */
export const dateGrist = (d = new Date()) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000;
// Création de la table (sans page : elle ne sert qu'à l'application), en deux temps comme l'installateur : sur
// grist.numerique.gouv.fr, AddRawTable ne prend que le nom (« takes 2 positional arguments but 3 were given », SPEC
// § 7 bis). 1) la table ; 2) d'après ses colonnes relues : colonnes manquantes, retrait des colonnes par défaut (A, B, C).
export const actionCreerTable = () => ['AddRawTable', TABLE_CHIFFREMENT];
/** @param {string[]} colonnes colonnes actuelles de la table @returns {any[][]} */
export function actionsColonnesTable(colonnes) {
  const voulues = [...COLONNES_CHIFFREMENT, COLONNE_MODIFIE, COLONNE_INDICE];
  return [
    ...voulues.filter(c => !colonnes.includes(c.id)).map(c => ['AddColumn', TABLE_CHIFFREMENT, c.id, { type: c.type, isFormula: false }]),
    ...colonnes.filter(c => c !== 'manualSort' && !/^gristHelper_/.test(c) && !voulues.some(v => v.id === c))
      .map(c => ['RemoveColumn', TABLE_CHIFFREMENT, c]),
  ];
}
/** @param {string[] | undefined} colonnes colonnes actuelles de la table */
export const actionsColonneModifie = colonnes => ((colonnes || []).includes(COLONNE_MODIFIE.id) ? []
  : [['AddColumn', TABLE_CHIFFREMENT, COLONNE_MODIFIE.id, { type: COLONNE_MODIFIE.type, isFormula: false }]]);
/** @param {{ Sel: string, Iterations: number, Version: number }} params @param {string} verificateur @param {string[]} [colonnes] @param {Date} [aujourdhui] */
export const actionsNouvellePhrase = (params, verificateur, colonnes = [], aujourdhui = new Date()) => [...actionsColonneModifie(colonnes),
  ['AddRecord', TABLE_CHIFFREMENT, null, { ...params, Verificateur: verificateur, [COLONNE_MODIFIE.id]: dateGrist(aujourdhui) }]];

// Enregistrer l'indice (colonne créée si besoin). Refusé s'il contient la phrase (comparée sans casse ni espaces).
/** @param {LigneChiffrement} ligne @param {string} indice @param {string[]} colonnes */
export const actionsIndice = (ligne, indice, colonnes) => [
  ...((colonnes || []).includes(COLONNE_INDICE.id) ? [] : [['AddColumn', TABLE_CHIFFREMENT, COLONNE_INDICE.id, { type: COLONNE_INDICE.type, isFormula: false }]]),
  ['UpdateRecord', TABLE_CHIFFREMENT, ligne.id, { [COLONNE_INDICE.id]: String(indice || '').trim() }]];
/** @param {string} indice @param {string} phrase */
export const indiceTropProche = (indice, phrase) => { const i = normaliserPhrase(indice).toLowerCase().replace(/\s+/g, ''), p = normaliserPhrase(phrase).toLowerCase().replace(/\s+/g, '');
  return !!i && !!p && (i.includes(p) || (p.length >= 6 && i.length >= 6 && p.includes(i) && i.length >= p.length * 0.8)); };

// --- Champs chiffrés des tables ---
/** @param {any} v */
export const estChiffre = v => typeof v === 'string' && v.startsWith(PREFIXE_CHIFFRE);
/** @param {any} v */
const estVideGrist = v => v === null || v === undefined || v === '' || (Array.isArray(v) && (!v.length || (v[0] === 'L' && v.length === 1)));
// Valeur mise en forme avant chiffrement (texte, nombre ou null, liste de textes), et remise au format de Grist après.
/** @param {GenreChiffre} genre @param {any} v */
export function valeurAChiffrer(genre, v) {
  if (genre === 'nombre') {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const t = String(v ?? '').replace(/\s/g, '').replace(',', '.');
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : null;
  }
  if (genre === 'liste') {
    const a = Array.isArray(v) ? (v[0] === 'L' ? v.slice(1) : v[0] === 'C' ? [] : v) : (v === null || v === undefined || v === '' ? [] : [v]);
    return a.map(x => String(x ?? '').trim()).filter(Boolean);
  }
  return v === null || v === undefined || Array.isArray(v) ? '' : String(v).trim();
}
/** @param {GenreChiffre} genre @param {any} v */
export function valeurDechiffree(genre, v) {
  if (genre === 'nombre') return typeof v === 'number' && Number.isFinite(v) ? v : null;
  if (genre === 'liste') return Array.isArray(v) && v.length ? ['L', ...v.map(String)] : null;
  return v === null || v === undefined ? '' : String(v);
}

// Lignes lues dans Grist → copies déchiffrées ({ lignes, echecs, enClair }). Sans clé (masqué) : valeurs laissées
// chiffrées ; seules les valeurs en clair sont repérées (enClair : à chiffrer, onglet Contrôles). cache (Map,
// facultatif) : évite de déchiffrer deux fois la même cellule.
/**
 * @param {CryptoKey | null} cle @param {string} table @param {Ligne[]} lignes @param {DeclarationChiffrement | null} decl
 * @param {Map<string, any>} [cache]
 */
export async function dechiffrerLignes(cle, table, lignes, decl, cache) {
  const champs = Object.entries((decl && decl.champs[table]) || {});
  /** @type {{ table: string, id: number, col: string }[]} */
  const enClair = [];
  /** @type {Promise<{ table: string, id: number, col: string } | null>[]} */
  const taches = [];
  const sortie = (lignes || []).map(l => {
    const c = { ...l };
    for (const [col, genre] of champs) {
      if (!(col in l)) continue;
      const v = l[col];
      if (estChiffre(v)) {
        if (!cle) continue;
        const k = `${table}.${col}\u0000${v}`;
        if (cache && cache.has(k)) { c[col] = cache.get(k); continue; }
        taches.push(dechiffrer(cle, v, `${table}.${col}`).then(
          x => { c[col] = valeurDechiffree(genre, x); if (cache) cache.set(k, c[col]); return null; },
          () => { c[col] = valeurDechiffree(genre, null); return { table, id: l.id, col }; }));
      } else if (!estVideGrist(v) && !(Array.isArray(v) && v[0] === 'C')) enClair.push({ table, id: l.id, col });
    }
    return c;
  });
  const echecs = /** @type {{ table: string, id: number, col: string }[]} */ ((await Promise.all(taches)).filter(Boolean));
  return { lignes: sortie, echecs, enClair };
}
// Champs encore chiffrés (masqué, ou indéchiffrables) → valeur vide : jamais de « v1:… » à l'écran.
/** @param {string} table @param {Ligne[]} lignes @param {DeclarationChiffrement | null} decl */
export function masquerChiffres(table, lignes, decl) {
  const champs = Object.entries((decl && decl.champs[table]) || {});
  return (lignes || []).map(l => {
    const c = { ...l };
    for (const [col, genre] of champs) if (estChiffre(c[col])) c[col] = valeurDechiffree(genre, null);
    return c;
  });
}
// Lecture pour l'écran : déchiffrée si la clé est là, sinon masquée (ni l'une ni l'autre si la table n'a pas de champ
// chiffré). Les cellules indéchiffrables sont vides.
/** @param {CryptoKey | null} cle @param {string} table @param {Ligne[]} lignes @param {DeclarationChiffrement | null} decl @param {Map<string, any>} [cache] */
export async function lignesLisibles(cle, table, lignes, decl, cache) {
  if (!decl || !decl.champs[table]) return lignes;
  return cle ? (await dechiffrerLignes(cle, table, lignes, decl, cache)).lignes : masquerChiffres(table, lignes, decl);
}
// La table a-t-elle des champs chiffrés ? Les écrans en déduisent s'il faut la clé pour écrire.
/** @param {DeclarationChiffrement | null} decl @param {string} table */
export const tableChiffree = (decl, table) => !!(decl && decl.champs[table] && Object.keys(decl.champs[table]).length);

// Actions en clair → mêmes actions, champs chiffrés remplacés par leur texte « v1:… ». Création (AddRecord,
// BulkAddRecord) : tous les champs chiffrés sont écrits, vides compris (rien ne trahit l'absence d'une valeur) ;
// modification (UpdateRecord, BulkUpdateRecord) : ceux présents seulement.
/** @param {CryptoKey} cle @param {any[]} actions @param {DeclarationChiffrement | null} decl */
export async function chiffrerActions(cle, actions, decl) {
  const sortie = [];
  for (const a of actions) {
    const [type, table] = a;
    const champs = Object.entries((decl && decl.champs[table]) || {});
    const ajout = type === 'AddRecord' || type === 'BulkAddRecord', bulk = type.startsWith('Bulk');
    if (!champs.length || !(ajout || type === 'UpdateRecord' || type === 'BulkUpdateRecord')) { sortie.push(a); continue; }
    const rec = { ...a[3] };
    const n = bulk ? a[2].length : 1;
    for (const [col, genre] of champs) {
      if (!ajout && !(col in rec)) continue;
      const contexte = `${table}.${col}`;
      if (bulk) rec[col] = await Promise.all(Array.from({ length: n }, (_, i) => chiffrer(cle, valeurAChiffrer(genre, rec[col] ? rec[col][i] : null), contexte)));
      else rec[col] = await chiffrer(cle, valeurAChiffrer(genre, rec[col]), contexte);
    }
    sortie.push([type, table, a[2], rec]);
  }
  return sortie;
}

// --- Pseudonymes (« C-0417 ») : désignent une ligne tant que ses champs chiffrés sont masqués ---
export const FORMAT_CODE = /^C-\d{4,5}$/;
export const tirageAleatoire = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
// Code tiré au hasard, absent de `codes` (Set, complété) ; 5 chiffres au-delà de 4 500 lignes.
/** @param {Set<string>} codes @param {() => number} [tirer] */
export function nouveauCode(codes, tirer = tirageAleatoire) {
  const n = codes.size > 4500 ? 5 : 4;
  for (;;) {
    const c = 'C-' + String(Math.floor(tirer() * 10 ** n)).padStart(n, '0');
    if (!codes.has(c)) { codes.add(c); return c; }
  }
}
// Créations sans code valide et libre (AddRecord, BulkAddRecord des tables à pseudonyme) → code tiré au hasard.
// `existants` : { Table: codes déjà pris } (complété). Un code valide et libre venu de l'action est gardé (réimport).
/** @param {any[]} actions @param {DeclarationChiffrement | null} decl @param {Record<string, Set<string>>} existants @param {() => number} [tirer] */
export function completerCodes(actions, decl, existants, tirer = tirageAleatoire) {
  const codes = (decl && decl.codes) || {};
  return actions.map(a => {
    const [type, table] = a, col = codes[table];
    if (!col || (type !== 'AddRecord' && type !== 'BulkAddRecord')) return a;
    const pris = existants[table] || (existants[table] = new Set());
    /** @param {any} v */
    const choisir = v => { const t = String(v ?? '').trim(); if (FORMAT_CODE.test(t) && !pris.has(t)) { pris.add(t); return t; } return nouveauCode(pris, tirer); };
    const rec = { ...a[3] };
    rec[col] = type === 'AddRecord' ? choisir(rec[col]) : a[2].map((/** @type {any} */ _, /** @type {number} */ i) => choisir(rec[col] ? rec[col][i] : ''));
    return [type, table, a[2], rec];
  });
}

// Lignes sans pseudonyme valide (créées avant la déclaration, ou dans Grist) → UpdateRecord avec un code tiré au hasard.
/** @param {Record<string, Ligne[]>} donnees @param {DeclarationChiffrement | null} decl @param {() => number} [tirer] */
export function actionsCodesManquants(donnees, decl, tirer = tirageAleatoire) {
  /** @type {any[]} */
  const actions = [];
  for (const [t, col] of Object.entries((decl && decl.codes) || {})) {
    const lignes = donnees[t] || [];
    const pris = new Set(lignes.map(l => String(l[col] ?? '')).filter(c => FORMAT_CODE.test(c)));
    for (const l of lignes) if (!FORMAT_CODE.test(String(l[col] ?? ''))) actions.push(['UpdateRecord', t, l.id, { [col]: nouveauCode(pris, tirer) }]);
  }
  return actions;
}

// --- Changement de phrase ---
// UpdateRecord d'une même table et des mêmes colonnes → un BulkUpdateRecord (envoi plus léger).
/** @param {any[]} actions */
export function regrouperMaj(actions) {
  const groupes = new Map(), sortie = [];
  for (const a of actions) {
    if (a[0] !== 'UpdateRecord') { sortie.push(a); continue; }
    const cols = Object.keys(a[3]), k = a[1] + '|' + cols.join(',');
    if (!groupes.has(k)) { const g = ['BulkUpdateRecord', a[1], [], Object.fromEntries(cols.map(c => [c, []]))]; groupes.set(k, g); sortie.push(g); }
    const g = groupes.get(k);
    g[2].push(a[2]);
    for (const c of cols) g[3][c].push(a[3][c]);
  }
  return sortie;
}
// Toutes les cellules chiffrées relues avec l'ancienne clé et rechiffrées avec la nouvelle ; nouveaux codes au choix ;
// ligne Chiffrement mise à jour. Un seul envoi : Grist l'applique d'un bloc. Une valeur indéchiffrable → erreur, rien
// n'est écrit. donnees : { Table: lignes telles que lues dans Grist (chiffrées) }.
/**
 * @param {CryptoKey} ancienne @param {CryptoKey} nouvelle
 * @param {{ decl: DeclarationChiffrement, donnees: Record<string, Ligne[]>, ligne: LigneChiffrement,
 *   params: { Sel: string, Iterations: number, Version: number }, verificateur: string, colonnes?: string[],
 *   nouveauxCodes?: boolean, tirer?: () => number, aujourdhui?: Date }} o
 */
export async function actionsRechiffrement(ancienne, nouvelle, o) {
  const tables = Object.keys(o.decl.champs);
  const lus = await Promise.all(tables.map(t => dechiffrerLignes(ancienne, t, o.donnees[t] || [], o.decl)));
  const echecs = lus.reduce((n, r) => n + r.echecs.length, 0);
  if (echecs) throw new Error(`${echecs} valeur(s) indéchiffrable(s) avec la phrase actuelle (voir l'onglet Contrôles).`);
  const codes = (o.decl.codes || {});
  /** @type {any[]} */
  const maj = [];
  tables.forEach((t, i) => {
    const pris = new Set();
    for (const l of lus[i].lignes) {
      /** @type {Record<string, any>} */
      const champs = {};
      for (const col of Object.keys(o.decl.champs[t])) if (col in l) champs[col] = l[col];
      if (o.nouveauxCodes && codes[t]) champs[codes[t]] = nouveauCode(pris, o.tirer);
      if (Object.keys(champs).length) maj.push(['UpdateRecord', t, l.id, champs]);
    }
  });
  const chiffrees = await chiffrerActions(nouvelle, maj, o.decl);
  return [...actionsColonneModifie(o.colonnes), ...regrouperMaj(chiffrees),
    ['UpdateRecord', TABLE_CHIFFREMENT, o.ligne.id, { ...o.params, Verificateur: o.verificateur, [COLONNE_MODIFIE.id]: dateGrist(o.aujourdhui) }]];
}

// --- Clé gardée pour l'onglet (survit à un rechargement, 6 heures sans activité) ---
// La clé (CryptoKey non exportable) est rangée dans IndexedDB, liée à l'onglet par un identifiant au hasard gardé dans
// sessionStorage : un autre onglet ou navigateur ne la trouve pas. La phrase n'est jamais gardée.
// env = { base, session, maintenant } : remplaçable (tests).
const BASE = `${PREFIXE}Chiffrement`, SESSION = `${PREFIXE}ChiffrementSession`;
/** @param {'readonly' | 'readwrite'} mode @param {(st: IDBObjectStore) => IDBRequest | null} f */
function operationBase(mode, f) {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('cles');
    r.onerror = () => ko(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('cles', mode), req = f(tx.objectStore('cles'));
      tx.oncomplete = () => { db.close(); ok(req ? req.result : undefined); };
      tx.onerror = tx.onabort = () => { db.close(); ko(tx.error); };
    };
  });
}
/** @typedef {{ lire: (k: string) => Promise<any>, ecrire: (k: string, v: any) => Promise<any>, effacer: (k: string) => Promise<any>, nettoyer: (t: number) => Promise<any> }} BaseCles */
/** @type {BaseCles} */
const BASE_NAVIGATEUR = {
  lire: k => operationBase('readonly', st => st.get(k)),
  ecrire: (k, v) => operationBase('readwrite', st => st.put(v, k)),
  effacer: k => operationBase('readwrite', st => st.delete(k)),
  nettoyer: maintenant => operationBase('readwrite', st => {
    const c = st.openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      if (!(cur.value && cur.value.echeance > maintenant)) cur.delete();
      cur.continue();
    };
    return null;
  }),
};
const SESSION_NAVIGATEUR = {
  lire: () => { try { return sessionStorage.getItem(SESSION); } catch (e) { return null; } },
  /** @param {string} v */
  ecrire: v => { try { sessionStorage.setItem(SESSION, v); } catch (e) { /* stockage indisponible : clé non gardée */ } },
};
/** @typedef {{ base: BaseCles, session: { lire: () => string | null, ecrire: (v: string) => void }, maintenant: () => number }} EnvCles */
/** @param {Partial<EnvCles>} [env] @returns {EnvCles} */
const envCle = env => ({ base: BASE_NAVIGATEUR, session: SESSION_NAVIGATEUR, maintenant: () => Date.now(), ...(env || {}) });
/** @param {string} id @param {LigneChiffrement} ligne */
const entree = (id, ligne) => `${id}|${ligne.Sel}`;

// Range la clé pour l'onglet ; renvoie l'échéance, ou null si le stockage est indisponible (clé en mémoire seulement).
/** @param {CryptoKey} cle @param {LigneChiffrement} ligne @param {Partial<EnvCles>} [env] */
export async function rangerCle(cle, ligne, env) {
  const e = envCle(env);
  let id = e.session.lire();
  if (!id) { id = octetsVersB64(crypto.getRandomValues(new Uint8Array(16))); e.session.ecrire(id); }
  if (e.session.lire() !== id) return null;
  const echeance = e.maintenant() + DUREE_MS;
  await e.base.ecrire(entree(id, ligne), { cle, signature: signatureChiffrement(ligne), echeance });
  return echeance;
}
// Clé gardée pour cet onglet et cette phrase → { cle, echeance }, ou null (absente, échue — alors effacée —, autre
// phrase). prolonger : l'échéance repart pour 6 heures (activité).
/** @param {LigneChiffrement | null} ligne @param {Partial<EnvCles>} [env] @param {boolean} [prolonger] */
export async function reprendreCle(ligne, env, prolonger = false) {
  const e = envCle(env), id = e.session.lire();
  if (!id || !ligne) return null;
  const k = entree(id, ligne), v = await e.base.lire(k);
  if (!v) return null;
  if (!(v.echeance > e.maintenant()) || v.signature !== signatureChiffrement(ligne) || !v.cle) { await e.base.effacer(k); return null; }
  if (prolonger) { v.echeance = e.maintenant() + DUREE_MS; await e.base.ecrire(k, v); }
  return { cle: /** @type {CryptoKey} */ (v.cle), echeance: /** @type {number} */ (v.echeance) };
}
// Masquer : la clé gardée pour cet onglet est effacée.
/** @param {LigneChiffrement | null} ligne @param {Partial<EnvCles>} [env] */
export async function oublierCle(ligne, env) {
  const e = envCle(env), id = e.session.lire();
  if (id && ligne) await e.base.effacer(entree(id, ligne));
}
// Entrées échues (onglets fermés) effacées.
/** @param {Partial<EnvCles>} [env] */
export async function nettoyerCles(env) {
  const e = envCle(env);
  await e.base.nettoyer(e.maintenant());
}

// --- Clé partagée entre les écrans (état du conteneur app/, SPEC § 6.2) ---
// Le conteneur tient la clé (Révéler / Masquer, 6 heures sans activité) ; chaque écran la lit et suit ses changements.
// Hors conteneur (page seule), la clé gardée pour l'onglet est reprise au démarrage (cleAuDemarrage).
export const ETAT_CLE = 'chiffrement';
/** @returns {CryptoKey | null} */
export const cleCourante = () => lireEtat(ETAT_CLE) || null;
/** @param {(cle: CryptoKey | null) => void} rappel */
export const suivreCle = rappel => suivreEtat(ETAT_CLE, rappel);
// Après une création ou un changement de phrase (Administration) : la nouvelle clé pour tous les écrans ; null = masquer.
/** @param {CryptoKey | null} cle */
export const definirCle = cle => ecrireEtat(ETAT_CLE, cle);
// Clé au démarrage d'un écran : celle du conteneur, sinon (page seule) celle gardée pour l'onglet.
/** @param {LigneChiffrement | null} ligne @returns {Promise<CryptoKey | null>} */
export async function cleAuDemarrage(ligne) {
  const c = cleCourante();
  if (c) return c;
  try { const r = await reprendreCle(ligne); return r ? r.cle : null; } catch (e) { return null; }
}
