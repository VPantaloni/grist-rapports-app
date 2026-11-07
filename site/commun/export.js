// @ts-check
// Export (SPEC § 4.6) : archive .zip sans bibliothèque, CSV pour Excel en français, valeurs Grist mises en forme,
// fichier réimportable par l'onglet Import, fiche en Markdown. Repris de grist-dataviz-app et grist-rdvc-app.
// Logique pure, testée avec Node (tests/export.test.js) ; telechargerFichier seul touche au navigateur.
import { liste, estCensure, refIds } from './donnees.js';

// --- Archive .zip (méthode « stockée », sans compression) ---
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
/** @param {Uint8Array} o @returns {number} */
export function crc32(o) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < o.length; i++) c = TABLE_CRC[(c ^ o[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// fichiers = [{ nom (chemin avec « / » pour un dossier), contenu (texte ou octets) }] → octets de l'archive.
// Noms en UTF-8 (drapeau 0x0800), date et heure locales des fichiers.
/** @param {{ nom: string, contenu: string | Uint8Array }[]} fichiers @param {Date} [date] @returns {Uint8Array} */
export function zipStocke(fichiers, date = new Date()) {
  const enc = new TextEncoder();
  const heure = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const jour = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  /** @type {Uint8Array[]} */
  const morceaux = [], central = [];
  let pos = 0;
  /** @param {number} taille @param {(v: DataView) => void} ecrire */
  const entete = (taille, ecrire) => { const b = new Uint8Array(taille); ecrire(new DataView(b.buffer)); return b; };
  for (const f of fichiers) {
    const nom = enc.encode(f.nom), donnees = typeof f.contenu === 'string' ? enc.encode(f.contenu) : f.contenu, crc = crc32(donnees);
    morceaux.push(entete(30, v => {
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, heure, true); v.setUint16(12, jour, true); v.setUint32(14, crc, true);
      v.setUint32(18, donnees.length, true); v.setUint32(22, donnees.length, true); v.setUint16(26, nom.length, true);
    }), nom, donnees);
    central.push(entete(46, v => {
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true);
      v.setUint16(12, heure, true); v.setUint16(14, jour, true); v.setUint32(16, crc, true);
      v.setUint32(20, donnees.length, true); v.setUint32(24, donnees.length, true); v.setUint16(28, nom.length, true);
      v.setUint32(42, pos, true);
    }), nom);
    pos += 30 + nom.length + donnees.length;
  }
  const tailleCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = entete(22, v => {
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, fichiers.length, true); v.setUint16(10, fichiers.length, true);
    v.setUint32(12, tailleCentral, true); v.setUint32(16, pos, true);
  });
  const tout = [...morceaux, ...central, fin];
  const sortie = new Uint8Array(tout.reduce((s, b) => s + b.length, 0));
  let i = 0;
  for (const b of tout) { sortie.set(b, i); i += b.length; }
  return sortie;
}

// --- CSV pour Excel en français : UTF-8 avec BOM, « ; », guillemets si besoin, retours à la ligne gardés ---
/** @param {any} v */
const cellule = v => { const t = String(v ?? ''); return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** @param {string[]} entetes @param {any[][]} lignes @returns {string} */
export function csv(entetes, lignes) {
  return '\uFEFF' + [entetes, ...lignes].map(l => l.map(cellule).join(';')).join('\r\n') + '\r\n';
}

const p2 = /** @param {number} n */ n => String(n).padStart(2, '0');
// Secondes UTC (Grist) → JJ/MM/AAAA ; '' si vide.
/** @param {any} s @returns {string} */
export function dateTexte(s) {
  if (typeof s !== 'number' || !s) return '';
  const d = new Date(s * 1000);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
/** @param {number} n */
const nombreTexte = n => (Number.isFinite(n) ? String(n).replace('.', ',') : '');

// --- Structure du document ---
/** @typedef {{ colId: string, label: string, type: string, visible: string }} ColonneStructure */

// Lignes de _grist_Tables et _grist_Tables_column → { Table: colonnes } (sans colonnes techniques). `visible` : colonne
// affichée par une référence (visibleCol), '' sinon.
/** @param {Ligne[]} tables @param {Ligne[]} colonnes @returns {Record<string, ColonneStructure[]>} */
export function structure(tables, colonnes) {
  const nomTable = new Map(tables.map(t => [t.id, t.tableId]));
  const colId = new Map(colonnes.map(c => [c.id, c.colId]));
  /** @type {Record<string, ColonneStructure[]>} */
  const s = {};
  for (const c of colonnes) {
    const t = nomTable.get(c.parentId);
    if (!t || c.colId === 'manualSort' || /^gristHelper_/.test(c.colId)) continue;
    (s[t] = s[t] || []).push({ colId: c.colId, label: c.label || c.colId, type: c.type || 'Any', visible: colId.get(c.visibleCol) || '' });
  }
  return s;
}

// Libellés des lignes visées par les références, par couple « table visée|colonne affichée » (deux références vers la
// même table peuvent afficher des colonnes différentes) : Map id → libellé.
/** @param {Record<string, ColonneStructure[]>} struct @param {Record<string, Ligne[]>} donnees */
export function libellesReferences(struct, donnees) {
  /** @type {Record<string, Map<number, string>>} */
  const lib = {};
  for (const cols of Object.values(struct)) for (const c of cols) {
    const m = /^Ref(?:List)?:(.+)$/.exec(c.type);
    const cle = m ? `${m[1]}|${c.visible}` : '';
    if (!m || lib[cle]) continue;
    const typeVisible = ((struct[m[1]] || []).find(x => x.colId === c.visible) || {}).type || 'Any';
    lib[cle] = new Map((donnees[m[1]] || []).map(l => [l.id, c.visible ? valeurLecture(l[c.visible], typeVisible) : `#${l.id}`]));
  }
  return lib;
}

// Valeur Grist → texte lisible (tableur) selon le type de la colonne (et, pour une référence, sa colonne affichée).
// Cellule masquée par les règles : vide.
/**
 * @param {any} v @param {string} type @param {Record<string, Map<number, string>>} [lib] @param {string} [visible]
 * @returns {string}
 */
export function valeurLecture(v, type, lib = {}, visible = '') {
  if (v === null || v === undefined || estCensure(v)) return '';
  const ref = /^Ref(List)?:(.+)$/.exec(type);
  if (ref) { const m = lib[`${ref[2]}|${visible}`]; return refIds(v).map(id => (m && m.get(id)) || `#${id}`).join(', '); }
  if (type === 'Date') return dateTexte(v);
  if (/^DateTime/.test(type) && typeof v === 'number' && v) {
    const d = new Date(v * 1000);
    return `${dateTexte(v)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  }
  if (type === 'Bool') return v === true ? 'oui' : v === false ? 'non' : '';
  if (typeof v === 'number') return nombreTexte(v);
  if (Array.isArray(v)) return liste(v).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Une table → CSV lisible : en-têtes = libellés des colonnes, valeurs mises en forme.
/** @param {ColonneStructure[]} cols @param {Ligne[]} lignes @param {Record<string, Map<number, string>>} lib */
export function csvTable(cols, lignes, lib) {
  return csv(cols.map(c => c.label), lignes.map(l => cols.map(c => valeurLecture(l[c.colId], c.type, lib, c.visible))));
}

// --- Fichier réimportable : inverse de la déclaration d'import (SPEC § 4.5) ---
// Une ligne par ligne de la table pivot (la dernière table déclarée : celle qui renvoie aux autres) et, pour une liste
// de références, par référence ; colonnes du fichier remplies depuis la table pivot et les lignes visées. Valeurs au
// format de l'import (date JJ/MM/AAAA, virgule décimale, oui/non, listes « a, b »).
/**
 * @param {import('./import.js').DeclarationImport} decl @param {Record<string, Ligne[]>} donnees
 * @returns {{ entetes: string[], lignes: string[][] }}
 */
export function lignesReimport(decl, donnees) {
  const entetes = Object.keys(decl.colonnes);
  const pivot = decl.tables[decl.tables.length - 1];
  const parId = Object.fromEntries(decl.tables.map(t => [t.table, new Map((donnees[t.table] || []).map(l => [l.id, l]))]));
  /** @param {string} col @param {any} v */
  const format = (col, v) => {
    if (v === null || v === undefined || estCensure(v)) return '';
    const t = decl.colonnes[col] && decl.colonnes[col].type;
    if (t === 'date') return dateTexte(v);
    if (t === 'decimal' || t === 'entier') return typeof v === 'number' ? nombreTexte(v) : String(v);
    if (t === 'booleen') return v === true ? 'oui' : v === false ? 'non' : '';
    if (Array.isArray(v)) return liste(v).join(', ');
    return String(v);
  };
  // Colonnes du fichier qui viennent d'une table (champ simple) : colonne du fichier → [table, colonne Grist].
  /** @param {import('./import.js').TableImport} t @param {Ligne} ligne @param {Record<string, string>} sortie */
  const remplir = (t, ligne, sortie) => {
    for (const [colGrist, src] of Object.entries(t.champs)) if (typeof src === 'string' && !sortie[src]) sortie[src] = format(src, ligne[colGrist]);
  };
  /** @type {string[][]} */
  const lignes = [];
  for (const l of donnees[pivot.table] || []) {
    /** @type {Record<string, string>} */
    const base = {};
    remplir(pivot, l, base);
    // Références : une variante de la ligne par ligne visée (liste de références), complétée par la table visée.
    /** @type {Record<string, string>[]} */
    let variantes = [base];
    for (const [colGrist, src] of Object.entries(pivot.champs)) {
      if (typeof src !== 'object') continue;
      const cible = decl.tables.find(t => t.table === src.ref);
      const visees = refIds(l[colGrist]).map(id => parId[src.ref] && parId[src.ref].get(id)).filter(Boolean);
      if (!cible || !visees.length) continue;
      variantes = variantes.flatMap(v => visees.map(r => { const s = { ...v }; remplir(/** @type {any} */ (cible), /** @type {Ligne} */ (r), s); return s; }));
    }
    for (const v of variantes) lignes.push(entetes.map(c => v[c] ?? ''));
  }
  return { entetes, lignes };
}

// --- Notice de l'archive ---
/**
 * @param {{ application: string, date: Date, volumes: [string, number][], reimport: boolean }} o
 * @returns {string}
 */
export function lisezmoi(o) {
  return '\uFEFF' + [
    `${o.application} — export du ${o.date.toLocaleDateString('fr-FR')} à ${o.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    '',
    ...o.volumes.map(([t, n]) => `- ${t}.csv : ${n} ligne(s)`),
    ...(o.reimport ? ['- import.csv : au format de l\'onglet Import, réimportable tel quel'] : []),
    '',
    'ATTENTION : ces fichiers peuvent contenir des données personnelles EN CLAIR (RGPD).',
    'Les ranger dans un lieu sûr et non partagé ; ne jamais les déposer dans un espace public.',
    'Les supprimer quand ils ne sont plus utiles.',
    '',
    'Lecture : ouvrir les fichiers .csv avec un tableur (séparateur « ; », virgule décimale, UTF-8).',
    'Seules les lignes que votre compte peut lire sont exportées (règles d\'accès du document).',
    ...(o.reimport ? ['', 'Réimporter (document neuf, restauration) : Administration → Import → choisir import.csv → Intégrer.',
      'Une ligne déjà présente est complétée, jamais dupliquée.'] : []),
    '',
    'La sauvegarde complète (formules, règles d\'accès, pages) reste le fichier .grist : menu du document Grist →',
    'Télécharger le document.',
  ].join('\r\n') + '\r\n';
}

// --- Fiche en Markdown (une ligne d'une table) ---
// champs : [libellé, valeur] (lignes « - **libellé** : valeur », valeurs vides omises) ; textes : [titre, texte long].
/**
 * @param {{ titre: string, sousTitre?: string, champs?: [string, any][], textes?: [string, any][] }} f @returns {string}
 */
export function ficheMarkdown(f) {
  const rempli = /** @param {any} x */ x => x !== null && x !== undefined && String(x).trim() !== '';
  const L = [`# ${f.titre}`, ...(f.sousTitre ? ['', `_${f.sousTitre}_`] : []), ''];
  for (const [k, v] of f.champs || []) if (rempli(v)) L.push(`- **${k}** : ${String(v).trim()}`);
  for (const [t, x] of f.textes || []) if (rempli(x)) L.push('', `## ${t}`, '', String(x).trim().replace(/\r\n/g, '\n'));
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Nom de fichier ou de dossier sûr (Windows, macOS) : caractères interdits remplacés, longueur limitée.
/** @param {any} s @param {string} [defaut] */
export function nomFichier(s, defaut = 'sans nom') {
  // eslint-disable-next-line no-control-regex
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.]+$/g, '').slice(0, 80).trim();
  return t || defaut;
}

// Date pour un nom de fichier : AAAA-MM-JJ.
/** @param {Date} [d] */
export const dateFichier = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// Fait télécharger un fichier par le navigateur (texte ou octets).
/** @param {string} nom @param {string | Uint8Array} contenu @param {string} type */
export function telechargerFichier(nom, contenu, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (contenu)], { type }));
  a.download = nom;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
}
