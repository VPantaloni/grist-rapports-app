// @ts-check
// Tableaux triables et filtrables par colonne (APP § 11, 2026-11-11) : un clic sur l'en-tête trie (croissant, décroissant,
// ordre d'origine) ; une ligne de filtres sous l'en-tête (liste des valeurs quand il y en a peu, sinon texte « contient »).
// Fonctionne sur le tableau déjà dessiné (<table><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table>) : à appeler
// après chaque affichage ; l'état (tri, filtres) est gardé par clé de tableau pendant la session de l'écran.
// Cellule : valeur de tri = data-tri, sinon son texte ; valeur de filtre = data-filtre, sinon son texte, sinon les
// libellés (aria-label, title) de ce qu'elle contient. En-tête : data-filtre="non" (pas de filtre), data-tri="non".
// Partie pure (comparer, valeurDeTri, garder) testée avec Node (tests/commun.test.js).
import { norm } from './donnees.js';

const DATE_FR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
// Valeur comparable : date « jj/mm/aaaa » → nombre aaaammjj ; nombre → nombre ; texte → texte sans accent ; vide → null.
/** @param {string} t @returns {number | string | null} */
export function valeurDeTri(t) {
  const s = String(t ?? '').trim();
  if (!s || s === '—' || s === '·') return null;
  const d = DATE_FR.exec(s);
  if (d) return Number(d[3]) * 10000 + Number(d[2]) * 100 + Number(d[1]);
  const n = s.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?%?$/.test(n)) return parseFloat(n);
  return norm(s);
}
// Comparaison (sens 1 ou -1) : vides toujours à la fin ; nombres entre eux, sinon texte (ordre naturel : 2 < 10).
/** @param {number | string | null} a @param {number | string | null} b @param {number} sens */
export function comparer(a, b, sens) {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sens;
  return String(a).localeCompare(String(b), 'fr', { numeric: true }) * sens;
}
// Ligne gardée par les filtres ? valeurs : texte de filtre de chaque cellule ; filtres : { colonne: { mode, valeur } }
// (mode 'liste' : égalité ; 'texte' : contient, sans accent ni casse).
/** @param {string[]} valeurs @param {Record<number, { mode: string, valeur: string }>} filtres */
export function garder(valeurs, filtres) {
  return Object.entries(filtres).every(([i, f]) => {
    if (!f || !f.valeur) return true;
    const v = valeurs[Number(i)] ?? '';
    return f.mode === 'liste' ? v === f.valeur : norm(v).includes(norm(f.valeur));
  });
}

// --- Partie DOM ---
/** @type {Map<string, { col: number, sens: number, filtres: Record<number, { mode: string, valeur: string }> }>} */
const ETATS = new Map();
const MAX_LISTE = 15;   // au-delà de 15 valeurs différentes : filtre texte
/** @param {Element} td */
const texteFiltre = td => {
  const d = /** @type {HTMLElement} */ (td).dataset;
  if (d && d.filtre !== undefined) return d.filtre;
  const t = (td.textContent || '').replace(/\s+/g, ' ').trim();
  if (t && t !== '·' && t !== '—') return t;
  return [...td.querySelectorAll('[aria-label],[title]')].map(x => x.getAttribute('aria-label') || x.getAttribute('title') || '').filter(Boolean)[0] || '';
};
/** @param {Element} td */
const texteTri = td => { const d = /** @type {HTMLElement} */ (td).dataset; return d && d.tri !== undefined ? d.tri : texteFiltre(td); };
const echapper = (/** @type {any} */ s) => String(s ?? '').replace(/[&<>"]/g, c => (/** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }))[c]);

// Rend un tableau triable et filtrable ; cle : identifiant stable (ex. 'plan-suivi'). Peut être rappelée sur le même
// tableau (« Effacer les filtres ») : les contrôles sont refaits, les écouteurs des en-têtes posés une seule fois.
/** @param {HTMLTableElement | null} table @param {string} cle */
export function tableauTriable(table, cle) {
  if (!table || !table.tHead || !table.tBodies[0]) return;
  const etat = ETATS.get(cle) || { col: -1, sens: 1, filtres: {} };
  ETATS.set(cle, etat);
  const entete = table.tHead.rows[0], corps = table.tBodies[0];
  const ths = [...entete.cells];
  const lignes = [...corps.rows];
  if (!table.classList.contains('triable')) lignes.forEach((tr, i) => { tr.dataset.ordre = String(i); });
  const cellules = (/** @type {HTMLTableRowElement} */ tr) => [...tr.cells];
  table.classList.add('triable');
  const ancienne = table.tHead.querySelector('tr.filtres'); if (ancienne) ancienne.remove();
  const majFleches = () => ths.forEach((th, i) => {
    const f = th.querySelector('.fleche-tri'); if (!f) return;
    f.textContent = etat.col === i ? (etat.sens > 0 ? '▲' : '▼') : '↕';
    th.setAttribute('aria-sort', etat.col === i ? (etat.sens > 0 ? 'ascending' : 'descending') : 'none');
  });
  const VIDE = '\u0000vide';
  const appliquer = () => {
    const actifs = Object.fromEntries(Object.entries(etat.filtres).filter(([, f]) => f && f.valeur && f.valeur !== VIDE));
    const videsDemandes = Object.keys(etat.filtres).filter(i => etat.filtres[Number(i)] && etat.filtres[Number(i)].valeur === VIDE);
    for (const l of lignes) {
      const vals = cellules(l).map(texteFiltre);
      l.hidden = !(garder(vals, actifs) && videsDemandes.every(i => !vals[Number(i)]));
    }
    const ordre = etat.col < 0 ? [...lignes].sort((a, b) => Number(a.dataset.ordre) - Number(b.dataset.ordre))
      : [...lignes].sort((a, b) => comparer(valeurDeTri(texteTri(cellules(a)[etat.col] || a)), valeurDeTri(texteTri(cellules(b)[etat.col] || b)), etat.sens)
        || Number(a.dataset.ordre) - Number(b.dataset.ordre));
    for (const l of ordre) corps.appendChild(l);
    const n = lignes.filter(l => !l.hidden).length;
    let note = table.nextElementSibling && table.nextElementSibling.classList.contains('note-filtres') ? table.nextElementSibling : null;
    if (n < lignes.length) {
      if (!note) { note = document.createElement('p'); note.className = 'note-filtres petit muted'; table.after(note); }
      note.innerHTML = `${n} ligne${n > 1 ? 's' : ''} sur ${lignes.length} (filtres de colonnes). <button type="button" class="lien">Effacer les filtres</button>`;
      /** @type {HTMLButtonElement} */ (note.querySelector('button')).onclick = () => { etat.filtres = {}; tableauTriable(table, cle); };
    } else if (note) note.remove();
  };
  // en-têtes : tri (écouteurs posés une fois ; ils appellent le tri courant du tableau)
  /** @type {any} */ (table)._trier = (/** @type {number} */ i) => {
    if (etat.col !== i) { etat.col = i; etat.sens = 1; } else if (etat.sens > 0) etat.sens = -1; else etat.col = -1;
    appliquer(); majFleches();
  };
  ths.forEach((th, i) => {
    if (th.dataset.tri === 'non' || th.dataset.triPose) return;
    th.dataset.triPose = '1';
    th.classList.add('tri');
    th.setAttribute('role', 'button'); th.tabIndex = 0;
    const fleche = document.createElement('span'); fleche.className = 'fleche-tri'; fleche.setAttribute('aria-hidden', 'true');
    th.appendChild(fleche);
    th.addEventListener('click', e => { if (/** @type {Element} */ (e.target).closest('a,button,input,select')) return; /** @type {any} */ (table)._trier(i); });
    th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); /** @type {any} */ (table)._trier(i); } });
  });
  majFleches();
  // ligne de filtres
  const tr = document.createElement('tr'); tr.className = 'filtres';
  ths.forEach((th, i) => {
    const c = document.createElement('th');
    if (th.dataset.filtre !== 'non') {
      const valeurs = [...new Set(lignes.map(l => texteFiltre(cellules(l)[i] || l)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
      const nom = (th.textContent || '').replace(/[▲▼↕]/g, '').trim();
      const f = etat.filtres[i];
      if (valeurs.length > 1 && valeurs.length <= MAX_LISTE) {
        const vides = lignes.some(l => !texteFiltre(cellules(l)[i] || l));
        c.innerHTML = `<select aria-label="Filtrer : ${echapper(nom)}"><option value="">Tout</option>${valeurs.map(v => `<option>${echapper(v)}</option>`).join('')}${vides ? `<option value="${VIDE}">(vide)</option>` : ''}</select>`;
        const s = /** @type {HTMLSelectElement} */ (c.firstElementChild);
        s.value = f && f.mode === 'liste' ? f.valeur : '';
        s.addEventListener('change', () => { etat.filtres[i] = { mode: 'liste', valeur: s.value }; appliquer(); });
      } else if (valeurs.length > MAX_LISTE) {
        c.innerHTML = `<input type="search" placeholder="Filtrer…" aria-label="Filtrer : ${echapper(nom)}">`;
        const s = /** @type {HTMLInputElement} */ (c.firstElementChild);
        s.value = f && f.mode === 'texte' ? f.valeur : '';
        s.addEventListener('input', () => { etat.filtres[i] = { mode: 'texte', valeur: s.value }; appliquer(); });
      } else delete etat.filtres[i];
    }
    tr.appendChild(c);
  });
  table.tHead.appendChild(tr);
  appliquer();
}

// Styles (une fois) : flèches de tri, ligne de filtres compacte.
if (typeof document !== 'undefined' && !document.getElementById('style-tableaux')) {
  const st = document.createElement('style'); st.id = 'style-tableaux';
  st.textContent = `table.triable th.tri { cursor: pointer; user-select: none; white-space: nowrap; }
table.triable th.tri:hover { color: var(--accent); }
table.triable th .fleche-tri { font-size: 10px; margin-left: 4px; color: var(--muted); }
table.triable th[aria-sort="ascending"] .fleche-tri, table.triable th[aria-sort="descending"] .fleche-tri { color: var(--accent); }
table.triable tr.filtres th { position: static; padding: 2px 4px 4px; font-weight: normal; background: var(--bg); }
table.triable tr.filtres select, table.triable tr.filtres input { width: 100%; min-width: 60px; max-width: 220px; font-size: 12px; padding: 2px 4px; height: 24px; box-sizing: border-box; }`;
  document.head.appendChild(st);
}
