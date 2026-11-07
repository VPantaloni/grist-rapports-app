// @ts-check
// Import d'un fichier (CSV ou copier-coller) dans les tables de l'application, piloté par une déclaration
// (SPEC § 4.5). Repris de grist-rdvc-app, grist-labo-widget et grist-dataviz-app. Logique pure, testée avec Node
// (tests/import.test.js) ; l'onglet Import de l'Administration s'en sert.
// Confidentialité : le fichier est lu dans le navigateur et écrit seulement dans Grist ; seules les colonnes déclarées
// sont lues (les autres sont ignorées dès la lecture) ; rien n'est gardé ailleurs.
import { norm, liste } from './donnees.js';

/**
 * @typedef {object} ColonneImport                 colonne du fichier (liste blanche)
 * @property {'texte' | 'email' | 'entier' | 'decimal' | 'date' | 'booleen' | 'choix' | 'liste'} type
 * @property {boolean} [obligatoire]                en-tête exigé ; cellule vide = ligne ignorée
 * @property {string[]} [synonymes]                 autres en-têtes acceptés
 * @property {string[]} [valeurs]                   choix et listes : valeurs autorisées
 * @property {Record<string, string>} [equivalences]  choix et listes : autres écritures d'une valeur autorisée,
 *                                                   comparées sans accent ni casse (ex. { MM: 'Mme' })
 * @property {number} [min]                         entier, décimal : bornes plausibles
 * @property {number} [max]
 * @property {string} [libelle]                     notice : ce que contient la colonne
 * @property {string} [exemple]                     notice : exemple de valeur
 *
 * @typedef {string | { ref: string, par: string, liste?: boolean }} ChampImport   colonne du fichier, ou référence (par la
 *   clé de `ref`) ; `liste` : liste de références, réunies sur les lignes de même clé (une ligne par référence)
 *
 * @typedef {object} TableImport
 * @property {string} table
 * @property {string[]} cle                          colonnes Grist qui identifient une ligne (rapprochement)
 * @property {Record<string, ChampImport>} champs     colonne Grist → colonne du fichier ou référence
 * @property {'completer' | 'remplacer' | 'ajouter'} [fusion]   ligne existante : cases vides seulement (défaut),
 *                                                   remplacer par le fichier, ou ne pas y toucher
 *
 * @typedef {object} DeclarationImport
 * @property {Record<string, ColonneImport>} colonnes
 * @property {TableImport[]} tables                   dans l'ordre d'écriture (tables référencées d'abord)
 * @property {string} [nomModele]                     nom du fichier modèle téléchargé
 * @property {import('./annuaire.js').RegleAnnuaire} [annuaire]     compléter par l'Annuaire de l'éducation (d'après l'UAI)
 * @property {import('./geocodage.js').RegleGeocodage} [geocodage]  position des lignes qui n'en ont pas (IGN)
 *
 * @typedef {{ n: number, v: Record<string, any> }} LigneImport   n = n° de ligne dans le fichier (en-tête = 1)
 * @typedef {{ niveau: 'bloquant' | 'alerte' | 'info', ligne?: number, message: string }} Remarque
 */

const TAILLE_PAQUET = 500;

// --- 1. Lecture ---

// Octets d'un fichier → texte : UTF-8 (avec ou sans BOM), sinon Windows-1252 (exports Excel en français).
/** @param {Uint8Array} octets @returns {{ texte: string, encodage: string }} */
export function decoderTexte(octets) {
  try { return { texte: new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/^\uFEFF/, ''), encodage: 'UTF-8' }; }
  catch (e) { return { texte: new TextDecoder('windows-1252').decode(octets), encodage: 'Windows-1252' }; }
}

// Texte CSV → lignes de cellules. Séparateur détecté sur l'en-tête (tabulation : copier-coller d'un tableur, « ; »,
// « , ») ; guillemets doublés ; cellule entre guillemets sur plusieurs lignes ; fins de ligne CRLF ; lignes vides ôtées.
/** @param {string} texte @returns {{ lignes: string[][], separateur: string }} */
export function lireCsv(texte) {
  const t = String(texte || '').replace(/^\uFEFF/, '');
  let entete = '', q = false;
  for (const c of t) { if (c === '"') q = !q; else if (!q && (c === '\n' || c === '\r')) break; entete += c; }
  /** @param {string} s */
  const compte = s => entete.split(s).length - 1;
  const separateur = ['\t', ';', ','].reduce((a, b) => (compte(b) > compte(a) ? b : a));
  /** @type {string[][]} */
  const lignes = [];
  /** @type {string[]} */
  let ligne = [];
  let cell = '';
  q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === separateur) { ligne.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(cell); lignes.push(ligne); ligne = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || ligne.length) { ligne.push(cell); lignes.push(ligne); }
  return { lignes: lignes.filter(l => l.some(x => x.trim() !== '')), separateur };
}

// En-tête comparable : sans accent ni casse, lettres et chiffres seulement (« Nom d'usage » = « NOM_D_USAGE »).
/** @param {any} s */
export const normEntete = s => norm(s).replace(/[^a-z0-9]/g, '');

// En-tête du fichier → position de chaque colonne déclarée (nom ou synonyme). Colonnes obligatoires absentes : bloquant.
/** @param {string[]} entete @param {Record<string, ColonneImport>} colonnes */
export function reconnaitreColonnes(entete, colonnes) {
  const positions = new Map(entete.map((e, i) => [normEntete(e), i]));
  /** @type {Record<string, number>} */
  const index = {};
  for (const [cle, def] of Object.entries(colonnes)) {
    const i = [cle, ...(def.synonymes || [])].map(normEntete).map(n => positions.get(n)).find(x => x !== undefined);
    if (i !== undefined) index[cle] = i;
  }
  const pris = new Set(Object.values(index));
  return {
    index,
    manquantes: Object.keys(colonnes).filter(c => colonnes[c].obligatoire && !(c in index)),
    absentes: Object.keys(colonnes).filter(c => !colonnes[c].obligatoire && !(c in index)),
    ignorees: entete.filter((e, i) => !pris.has(i) && String(e).trim()),
  };
}

// --- 2. Conversion explicite (rien de silencieux) ---

const BOOLEENS = { oui: true, vrai: true, x: true, '1': true, true: true, yes: true, non: false, faux: false, '0': false, false: false, no: false };

// Autre écriture d'une valeur (déclarée dans `equivalences`, comparée sans accent ni casse) → la valeur autorisée.
/** @param {string} t @param {ColonneImport} def @returns {string} */
function equivalent(t, def) {
  const e = Object.entries(def.equivalences || {}).find(([k]) => norm(k) === norm(t));
  return e ? e[1] : t;
}

// Cellule → { valeur } ; { vide: true } ; ou { erreur } (valeur illisible : le champ n'est pas écrit).
/** @param {any} texte @param {ColonneImport} def @returns {{ valeur?: any, vide?: true, erreur?: string }} */
export function convertir(texte, def) {
  const t = String(texte ?? '').trim();
  if (!t) return { vide: true };
  /** @param {number} n */
  const borne = n => ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)
    ? { erreur: `hors des bornes plausibles (${def.min ?? '…'} à ${def.max ?? '…'})` } : { valeur: n });
  switch (def.type) {
    case 'texte': return { valeur: t };
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? { valeur: t } : { erreur: 'e-mail invalide' };
    case 'entier': {
      const s = t.replace(/[\s\u00A0\u202F]/g, '');
      return /^[+-]?\d+$/.test(s) ? borne(Number(s)) : { erreur: 'nombre entier attendu' };
    }
    case 'decimal': {
      const s = t.replace(/[\s\u00A0\u202F]/g, '');
      return /^[+-]?\d+([.,]\d+)?$/.test(s) ? borne(Number(s.replace(',', '.'))) : { erreur: 'nombre attendu' };
    }
    case 'date': {
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t), a, mo, j;
      if (m) [a, mo, j] = [+m[1], +m[2], +m[3]];
      else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [a, mo, j] = [+m[3], +m[2], +m[1]];
      else return { erreur: 'date attendue (JJ/MM/AAAA ou AAAA-MM-JJ)' };
      const d = new Date(Date.UTC(a, mo - 1, j));
      if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return { erreur: 'date impossible' };
      return { valeur: d.getTime() / 1000 };   // secondes UTC à minuit (SPEC § 3.6)
    }
    case 'booleen': {
      const b = /** @type {Record<string, boolean>} */ (BOOLEENS)[norm(t)];
      return b === undefined ? { erreur: 'oui ou non attendu' } : { valeur: b };
    }
    case 'choix': {
      const v = (def.valeurs || []).find(x => norm(x) === norm(equivalent(t, def)));
      return v === undefined ? { erreur: `valeur inconnue (attendu : ${(def.valeurs || []).join(', ')})` } : { valeur: v };
    }
    case 'liste': {
      const morceaux = t.split(/\s*[,;]\s*/).filter(Boolean);
      if (!def.valeurs) return { valeur: morceaux };
      const inconnus = morceaux.filter(x => !def.valeurs?.some(v => norm(v) === norm(equivalent(x, def))));
      if (inconnus.length) return { erreur: `valeur(s) inconnue(s) : ${inconnus.join(', ')}` };
      return { valeur: morceaux.map(x => def.valeurs?.find(v => norm(v) === norm(equivalent(x, def)))) };
    }
    default: return { erreur: 'type inconnu' };
  }
}

// Lignes du fichier → valeurs converties. Valeur illisible : champ non écrit + alerte ; cellule obligatoire vide :
// ligne ignorée + alerte. Sans en-tête, ou colonne obligatoire absente : bloquant.
/** @param {string[][]} lignesCsv @param {DeclarationImport} decl */
export function lireLignes(lignesCsv, decl) {
  /** @type {Remarque[]} */
  const remarques = [];
  if (!lignesCsv.length) return { lignes: [], remarques: [{ niveau: 'bloquant', message: 'Fichier vide.' }], colonnes: null };
  const colonnes = reconnaitreColonnes(lignesCsv[0], decl.colonnes);
  for (const c of colonnes.manquantes) remarques.push({ niveau: 'bloquant', message: `Colonne obligatoire absente : « ${c} ».` });
  /** @type {LigneImport[]} */
  const lignes = [];
  lignesCsv.slice(1).forEach((cells, i) => {
    const n = i + 2;
    /** @type {Record<string, any>} */
    const v = {};
    let ignoree = false;
    for (const [cle, pos] of Object.entries(colonnes.index)) {
      const def = decl.colonnes[cle];
      const r = convertir(cells[pos], def);
      if (r.erreur) remarques.push({ niveau: 'alerte', ligne: n, message: `${cle} « ${String(cells[pos]).trim()} » : ${r.erreur} (non écrit).` });
      else if (r.vide) { if (def.obligatoire) { ignoree = true; remarques.push({ niveau: 'alerte', ligne: n, message: `${cle} vide : ligne ignorée.` }); } }
      else v[cle] = r.valeur;
    }
    if (!ignoree) lignes.push({ n, v });
  });
  return { lignes, remarques, colonnes };
}

// --- 3. Vérification des tables de destination (avant tout envoi) ---

// colonnesGrist : { Table: { Colonne: type Grist } } (de _grist_Tables_column). Table ou colonne absente, référence vers
// une colonne qui n'en est pas une, nombre ou texte vers une colonne Date (Grist le prendrait pour une date) : bloquant.
/** @param {DeclarationImport} decl @param {Record<string, Record<string, string>>} colonnesGrist @returns {Remarque[]} */
export function verifierDestination(decl, colonnesGrist) {
  /** @type {Remarque[]} */
  const r = [];
  for (const t of decl.tables) {
    const cols = colonnesGrist[t.table];
    if (!cols) { r.push({ niveau: 'bloquant', message: `Table « ${t.table} » absente du document.` }); continue; }
    for (const [col, src] of Object.entries(t.champs)) {
      const type = cols[col];
      if (type === undefined) { r.push({ niveau: 'bloquant', message: `Colonne « ${t.table}.${col} » absente du document.` }); continue; }
      if (typeof src === 'object') {
        if (!/^Ref(List)?:/.test(type)) r.push({ niveau: 'bloquant', message: `« ${t.table}.${col} » devrait être une référence (type actuel : ${type}).` });
        continue;
      }
      const decla = decl.colonnes[src];
      if (!decla) { r.push({ niveau: 'bloquant', message: `Déclaration : « ${t.table}.${col} » lit une colonne « ${src} » non déclarée.` }); continue; }
      if (/^Date/.test(type) && decla.type !== 'date') r.push({ niveau: 'bloquant', message: `« ${t.table}.${col} » est une colonne Date mais reçoit du type « ${decla.type} ».` });
      if (decla.type === 'date' && !/^(Date|Any)/.test(type)) r.push({ niveau: 'alerte', message: `« ${t.table}.${col} » reçoit des dates mais est de type ${type}.` });
    }
  }
  return r;
}

// --- 4. Plan : rapprochement, fusion, références ---

/** @param {any} v */
const cleNorm = v => (Array.isArray(v) ? liste(v).map(cleNorm).join(',') : norm(String(v ?? '')).replace(/\s+/g, ' ').trim());
// Cellule vide : null, '', liste vide ; pour une référence, 0 aussi (aucune ligne). Un nombre 0 n'est pas vide.
/** @param {any} v @param {boolean} [reference] */
const estVide = (v, reference = false) => v === null || v === undefined || v === '' || (reference && v === 0)
  || (Array.isArray(v) && liste(v).length === 0);
// Égalité de deux valeurs (Grist ou fichier) : listes sans 'L' ; une valeur seule = liste d'un élément (une liste de
// références qui ne contient que cette ligne vaut la référence seule).
/** @param {any} a @param {any} b */
const egal = (a, b) => {
  let x = Array.isArray(a) ? liste(a) : a, y = Array.isArray(b) ? liste(b) : b;
  if (Array.isArray(x) && !Array.isArray(y)) y = [y];
  if (Array.isArray(y) && !Array.isArray(x)) x = [x];
  return JSON.stringify(x) === JSON.stringify(y);
};

/**
 * @typedef {{ nouveau: string, cle: string }} RefNouvelle   ligne créée par ce même import (id connu après l'envoi)
 * @typedef {{ n: number, cle: string, champs: Record<string, any> }} Ajout
 * @typedef {{ id: number, n: number, champs: Record<string, any> }} MiseAJour
 * @typedef {{ table: string, ajouts: Ajout[], majs: MiseAJour[], inchanges: number, ecarts: string[] }} PlanTable
 */

// Lignes lues + lignes existantes → ce qu'il faut écrire, table par table, sans rien écrire.
// existant : { Table: Ligne[] } (lignes actuelles de chaque table déclarée).
/**
 * @param {LigneImport[]} lignes @param {DeclarationImport} decl @param {Record<string, Ligne[]>} existant
 * @returns {{ tables: PlanTable[], remarques: Remarque[] }}
 */
export function planifier(lignes, decl, existant) {
  /** @type {Remarque[]} */
  const remarques = [];
  /** @type {PlanTable[]} */
  const tables = [];
  /** @type {Record<string, Map<string, number>>} table → clé normalisée → id existant */
  const ids = {};
  /** @type {Record<string, Set<string>>} table → clés créées par cet import */
  const crees = {};

  for (const t of decl.tables) {
    const fusion = t.fusion || 'completer';
    // Clé d'une ligne existante (valeurs de Grist) et index.
    /** @param {Record<string, any>} valeurs */
    const cleDe = valeurs => (t.cle.some(c => estVide(valeurs[c])) ? '' : t.cle.map(c => cleNorm(valeurs[c])).join('|'));
    ids[t.table] = new Map();
    for (const l of existant[t.table] || []) { const k = cleDe(l); if (k && !ids[t.table].has(k)) ids[t.table].set(k, l.id); }
    crees[t.table] = new Set();

    // Table non concernée par ce fichier : une colonne de sa clé n'apparaît sur aucune ligne (ex. fichier des seuls
    // établissements, sans nom de professeur·e) → une seule remarque, au lieu d'une alerte par ligne.
    const absentes = t.cle.filter(c => { const src = t.champs[c]; const s = typeof src === 'string' ? src : src && src.par; return !s || !lignes.some(l => !estVide(l.v[s])); });
    if (absentes.length && lignes.length) {
      remarques.push({ niveau: 'info', message: `${t.table} : non concernée par ce fichier (${absentes.join(', ')} absent).` });
      tables.push({ table: t.table, ajouts: [], majs: [], inchanges: 0, ecarts: [] });
      continue;
    }

    // Lignes du fichier → champs de cette table, regroupés par clé (fusion des doublons concordants).
    /** @type {Map<string, { n: number, champs: Record<string, any> }>} */
    const parCle = new Map();
    for (const l of lignes) {
      /** @type {Record<string, any>} */
      const champs = {};
      for (const [col, src] of Object.entries(t.champs)) {
        if (typeof src === 'string') { if (src in l.v) champs[col] = l.v[src]; continue; }
        if (!(src.par in l.v)) continue;
        const valeurs = Array.isArray(l.v[src.par]) ? l.v[src.par] : [l.v[src.par]];
        /** @type {(number | RefNouvelle)[]} */
        const refs = [];
        for (const x of valeurs) {
          const k = cleNorm(x);
          const id = ids[src.ref] && ids[src.ref].get(k);
          if (id) refs.push(id);
          else if (crees[src.ref] && crees[src.ref].has(k)) refs.push({ nouveau: src.ref, cle: k });
          else remarques.push({ niveau: 'alerte', ligne: l.n, message: `${t.table}.${col} : « ${x} » introuvable dans ${src.ref} (non écrit).` });
        }
        if (refs.length) champs[col] = src.liste || Array.isArray(l.v[src.par]) ? refs : refs[0];
      }
      if (!Object.keys(champs).length) continue;   // rien pour cette table sur cette ligne
      const k = cleDe(champs);
      if (!k) { remarques.push({ niveau: 'alerte', ligne: l.n, message: `${t.table} : clé (${t.cle.join(', ')}) vide, ligne ignorée pour cette table.` }); continue; }
      const deja = parCle.get(k);
      if (!deja) { parCle.set(k, { n: l.n, champs }); continue; }
      for (const [col, v] of Object.entries(champs)) {
        if (t.cle.includes(col)) continue;   // égales à la casse et aux accents près : c'est la même clé
        const src = t.champs[col];
        if (typeof src === 'object' && src.liste && col in deja.champs) {   // liste de références : réunion
          const cleRef = /** @param {any} x */ x => (typeof x === 'object' ? `n:${x.cle}` : `i:${x}`);
          const vus = new Set(deja.champs[col].map(cleRef));
          for (const x of v) if (!vus.has(cleRef(x))) { vus.add(cleRef(x)); deja.champs[col].push(x); }
          continue;
        }
        if (!(col in deja.champs)) deja.champs[col] = v;
        else if (!egal(deja.champs[col], v)) remarques.push({ niveau: 'alerte', ligne: l.n, message: `${t.table} « ${k} » déjà à la ligne ${deja.n} avec une autre valeur pour ${col} : première gardée.` });
      }
    }

    /** @type {PlanTable} */
    const plan = { table: t.table, ajouts: [], majs: [], inchanges: 0, ecarts: [] };
    const lignesExistantes = new Map((existant[t.table] || []).map(l => [l.id, l]));
    for (const [k, { n, champs }] of parCle) {
      const id = ids[t.table].get(k);
      if (!id) { plan.ajouts.push({ n, cle: k, champs }); crees[t.table].add(k); continue; }
      const e = lignesExistantes.get(id) || {};
      /** @type {Record<string, any>} */
      const maj = {};
      if (fusion !== 'ajouter') {
        for (const [col, v] of Object.entries(champs)) {
          if (t.cle.includes(col) || egal(e[col], v)) continue;
          if (fusion === 'remplacer' || estVide(e[col], typeof t.champs[col] === 'object')) maj[col] = v;
          else plan.ecarts.push(`ligne ${n} : ${t.table} « ${k} », ${col} — Grist « ${String(liste(e[col]).join(', ') || e[col])} », fichier « ${String(Array.isArray(v) ? v.join(', ') : v)} » (Grist gardé)`);
        }
      }
      if (Object.keys(maj).length) plan.majs.push({ id, n, champs: maj }); else plan.inchanges++;
    }
    tables.push(plan);
  }
  return { tables, remarques };
}

// --- 5. Actions Grist ---

// Plan d'une table → actions BulkAddRecord / BulkUpdateRecord, par paquets et par jeu de colonnes identique. Les
// références vers des lignes créées par l'import sont résolues avec `idsCrees` (table → clé → id). `types` : types Grist
// des colonnes (référence simple ou liste de références).
/**
 * @param {PlanTable} plan @param {Record<string, string>} types @param {Record<string, Map<string, number>>} idsCrees
 * @returns {{ actions: any[][], clesAjoutees: string[][] }} clesAjoutees[i] : clés des lignes de l'action d'ajout i
 */
export function actionsTable(plan, types, idsCrees) {
  /** @param {string} col @param {any} v */
  const valeurGrist = (col, v) => {
    const resoudre = /** @param {any} x */ x => (x && typeof x === 'object' && 'nouveau' in x ? (idsCrees[x.nouveau]?.get(x.cle) || 0) : x);
    if (/^RefList:/.test(types[col] || '')) return ['L', ...(Array.isArray(v) ? v : [v]).map(resoudre).filter(Boolean)];
    if (/^Ref:/.test(types[col] || '')) return resoudre(Array.isArray(v) ? v[0] : v);
    if (/^ChoiceList/.test(types[col] || '') && Array.isArray(v)) return ['L', ...v];
    return v;
  };
  /** @type {any[][]} */
  const actions = [];
  /** @type {string[][]} */
  const clesAjoutees = [];
  /** @template T @param {T[]} liste @param {(x: T) => Record<string, any>} champs */
  const groupes = (liste, champs) => {
    /** @type {Map<string, T[]>} */
    const g = new Map();
    for (const x of liste) { const s = Object.keys(champs(x)).sort().join(','); if (!g.has(s)) g.set(s, []); g.get(s)?.push(x); }
    return [...g.entries()];
  };
  for (const [sig, groupe] of groupes(plan.ajouts, a => a.champs)) {
    const cols = sig.split(',');
    for (let i = 0; i < groupe.length; i += TAILLE_PAQUET) {
      const p = groupe.slice(i, i + TAILLE_PAQUET);
      actions.push(['BulkAddRecord', plan.table, p.map(() => null), Object.fromEntries(cols.map(c => [c, p.map(a => valeurGrist(c, a.champs[c]))]))]);
      clesAjoutees.push(p.map(a => a.cle));
    }
  }
  for (const [sig, groupe] of groupes(plan.majs, m => m.champs)) {
    const cols = sig.split(',');
    for (let i = 0; i < groupe.length; i += TAILLE_PAQUET) {
      const p = groupe.slice(i, i + TAILLE_PAQUET);
      actions.push(['BulkUpdateRecord', plan.table, p.map(m => m.id), Object.fromEntries(cols.map(c => [c, p.map(m => valeurGrist(c, m.champs[c]))]))]);
    }
  }
  return { actions, clesAjoutees };
}

// --- 6. Modèle et notice ---

const FORMATS = { texte: 'texte', email: 'adresse e-mail', entier: 'nombre entier', decimal: 'nombre (virgule ou point)',
  date: 'date JJ/MM/AAAA', booleen: 'oui / non', choix: 'une valeur de la liste', liste: 'valeurs séparées par des virgules' };

// Fichier modèle : en-têtes seuls, « ; » (Excel en français), UTF-8 avec BOM.
/** @param {DeclarationImport} decl @returns {string} */
export function modeleCsv(decl) {
  return '\uFEFF' + Object.keys(decl.colonnes).join(';') + '\r\n';
}

// Notice : une ligne par colonne du fichier (obligatoire, format, valeurs, colonnes de Grist qui la reçoivent).
/** @param {DeclarationImport} decl */
export function notice(decl) {
  return Object.entries(decl.colonnes).map(([cle, d]) => ({
    colonne: cle, obligatoire: !!d.obligatoire, libelle: d.libelle || '', exemple: d.exemple || '',
    format: /** @type {Record<string, string>} */ (FORMATS)[d.type] + (d.valeurs ? ` : ${d.valeurs.join(', ')}` : '')
      + (d.min !== undefined || d.max !== undefined ? ` (de ${d.min ?? '…'} à ${d.max ?? '…'})` : ''),
    destination: decl.tables.flatMap(t => Object.entries(t.champs)
      .filter(([, s]) => s === cle || (typeof s === 'object' && s.par === cle)).map(([c]) => `${t.table}.${c}`)).join(', '),
  }));
}
