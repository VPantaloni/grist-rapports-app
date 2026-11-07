// @ts-check
// Formats des données Grist (logique pure, sans DOM ni grist) : testable avec Node (tests/commun.test.js).
// Lecture tolérante : SPEC § 3.5 ; formats d'écriture : SPEC § 3.6.

// Format « en colonnes » de fetchTable ({ id: [...], Col: [...] }) → tableau de lignes.
/** @param {Colonnes | null | undefined} data @returns {Ligne[]} */
export function columnsToRows(data) {
  const ids = (data && data.id) || [];
  const cols = Object.keys(data || {});
  return ids.map((_, i) => {
    /** @type {Ligne} */
    const row = { id: ids[i] };
    for (const c of cols) row[c] = data[c][i];
    return row;
  });
}

// Valeur Grist « liste » (avec ou sans 'L' initial) → tableau.
/** @param {any} v @returns {any[]} */
export function liste(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v[0] === 'L' ? v.slice(1) : v;
  return [v];
}

// Cellule masquée par les règles d'accès : ['C'] dans les données envoyées par Grist.
/** @param {any} v @returns {boolean} */
export function estCensure(v) {
  return Array.isArray(v) && v[0] === 'C';
}

// Valeur affichable : liste → « a, b » ; vide → ''.
/** @param {any} v @returns {string} */
export function texte(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return liste(v).join(', ');
  return String(v);
}

// Normalisation pour la recherche : sans accent ni casse.
/** @param {any} s @returns {string} */
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Nombre tolérant : 48.61, « 48,61 », '' → null.
/** @param {any} v @returns {number | null} */
export function nombre(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Référence Grist → id de ligne (0 = vide).
/** @param {any} v @returns {number} */
export function refId(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) return v.rowId ?? v.id ?? 0;
  if (Array.isArray(v) && v[0] === 'R') return v[2] || 0;
  return 0;
}

// Référence simple ou liste de références (['L', id…]) → liste d'id non nuls.
/** @param {any} v @returns {number[]} */
export function refIds(v) {
  if (Array.isArray(v) && v[0] === 'L') return v.slice(1).map(refId).filter(Boolean);
  const id = refId(v);
  return id ? [id] : [];
}

// Date Grist (secondes, Date, ['d', n], AAAA-MM-JJ) → { ts, annee, texte JJ/MM/AAAA } ou null.
/** @param {any} v @returns {{ ts: number, annee: number, texte: string } | null} */
export function lireDate(v) {
  if (v === null || v === undefined || v === '' || v === 0) return null;
  if (Array.isArray(v) && (v[0] === 'd' || v[0] === 'D')) v = v[1];
  let d = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') d = new Date(v * 1000);
  else if (typeof v === 'string') { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); }
  if (!d || isNaN(d.getTime())) return null;
  /** @param {number} n */
  const p = n => String(n).padStart(2, '0');
  return { ts: d.getTime(), annee: d.getUTCFullYear(), texte: p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() };
}

// Nom affiché d'une fiche de personne : Nom_complet, sinon Prenom + Nom (l'un ou l'autre peut manquer).
/** @param {Ligne | { [col: string]: any } | null | undefined} p @returns {string} */
export function nomFiche(p) {
  return p ? (p.Nom_complet || [p.Prenom, p.Nom].filter(Boolean).join(' ')) : '';
}

// Colonne Ordre (position dans les listes) : Ordre croissant (sans ordre à la fin), puis la colonne « nom ».
/** @param {{ [col: string]: any }[]} lignes @param {string} nom */
export function trierParOrdre(lignes, nom) {
  const o = t => { const n = nombre(t.Ordre); return n === null ? Infinity : n; };
  return [...lignes].sort((a, b) => o(a) - o(b) || String(a[nom] || '').localeCompare(String(b[nom] || ''), 'fr'));
}
// Ordre proposé pour une nouvelle ligne : après la dernière, de 10 en 10.
/** @param {{ [col: string]: any }[]} lignes */
export function ordreSuivant(lignes) {
  const n = lignes.map(t => nombre(t.Ordre)).filter(x => x !== null);
  return n.length ? Math.floor(Math.max(.../** @type {number[]} */ (n)) / 10) * 10 + 10 : 10;
}

// Empreinte d'une saisie (sans sa propriété `orig`) : comparée à celle de l'ouverture du formulaire, elle dit si un
// champ a vraiment changé (SPEC § 3.4 : ne bloquer que si une modification est en cours).
/** @param {any} saisie @returns {string} */
export function empreinteSaisie(saisie) {
  return JSON.stringify(saisie, (k, v) => (k === 'orig' ? undefined : v));
}
