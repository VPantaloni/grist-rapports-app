// @ts-check
// Tableaux triables et filtrables par colonne (APP § 11, 2026-11-11 ; boutons compacts le 2026-11-14) : dans chaque
// en-tête, deux petits boutons encadrés — tri (Lucide arrow-up-narrow-wide / arrow-down-wide-narrow : croissant,
// décroissant, ordre d'origine) et filtre (Lucide funnel : liste des valeurs quand il y en a peu, sinon texte « contient »).
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
const MAX_LISTE = 30;   // au-delà de 30 valeurs différentes : filtre texte
const VIDE = '\u0000vide';
const SVG = (/** @type {string} */ d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONES = {
  entonnoir: SVG('<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>'),
  croissant: SVG('<path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M11 12h4"/><path d="M11 16h7"/><path d="M11 20h10"/>'),
  decroissant: SVG('<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>'),
};
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
/** @type {HTMLElement | null} */
let bulle = null;   // fenêtre du filtre ouverte (une seule à la fois)
const fermerBulle = () => { if (bulle) { bulle.remove(); bulle = null; } };
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', e => { if (bulle && !bulle.contains(/** @type {Node} */ (e.target)) && !(/** @type {Element} */ (e.target)).closest('.btn-col')) fermerBulle(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && bulle) { fermerBulle(); e.stopPropagation(); } }, true);
}

// Rend un tableau triable et filtrable ; cle : identifiant stable (ex. 'plan-suivi'). À rappeler après chaque
// affichage (l'état — tri, filtres — est gardé par clé). En-tête : data-filtre="non" (pas de filtre), data-tri="non".
/** @param {HTMLTableElement | null} table @param {string} cle */
export function tableauTriable(table, cle) {
  if (!table || !table.tHead || !table.tBodies[0]) return;
  if (bulle && bulle.dataset.col && bulle.dataset.col.startsWith(cle + '|')) fermerBulle();   // tableau redessiné
  const etat = ETATS.get(cle) || { col: -1, sens: 1, filtres: {} };
  ETATS.set(cle, etat);
  const entete = table.tHead.rows[0], corps = table.tBodies[0];
  const ths = [...entete.cells];
  const lignes = [...corps.rows];
  if (!table.classList.contains('triable')) lignes.forEach((tr, i) => { tr.dataset.ordre = String(i); });
  table.classList.add('triable');
  const cellules = (/** @type {HTMLTableRowElement} */ tr) => [...tr.cells];
  const valeursCol = (/** @type {number} */ i) => [...new Set(lignes.map(l => texteFiltre(cellules(l)[i] || l)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const nomCol = (/** @type {HTMLElement} */ th) => (th.querySelector('.libelle-col') || th).textContent?.trim() || '';
  const majBoutons = () => ths.forEach((th, i) => {
    const bt = th.querySelector('.btn-tri'), bf = th.querySelector('.btn-filtre');
    if (bt) {
      const actif = etat.col === i;
      bt.innerHTML = actif && etat.sens < 0 ? ICONES.decroissant : ICONES.croissant;
      bt.classList.toggle('actif', actif);
      const t = actif ? (etat.sens > 0 ? 'Tri croissant (cliquer : décroissant)' : 'Tri décroissant (cliquer : ordre d\'origine)') : 'Trier';
      bt.title = t; bt.setAttribute('aria-label', `${t} : ${nomCol(th)}`);
      th.setAttribute('aria-sort', actif ? (etat.sens > 0 ? 'ascending' : 'descending') : 'none');
    }
    if (bf) {
      const f = etat.filtres[i], actif = !!(f && f.valeur);
      bf.classList.toggle('actif', actif);
      const t = actif ? `Filtré : ${f.valeur === VIDE ? '(vide)' : f.valeur}` : 'Filtrer';
      bf.title = t; bf.setAttribute('aria-label', `${t} : ${nomCol(th)}`);
    }
  });
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
      /** @type {HTMLButtonElement} */ (note.querySelector('button')).onclick = () => { etat.filtres = {}; fermerBulle(); appliquer(); majBoutons(); };
    } else if (note) note.remove();
    majBoutons();
  };
  const trier = (/** @type {number} */ i) => {
    if (etat.col !== i) { etat.col = i; etat.sens = 1; } else if (etat.sens > 0) etat.sens = -1; else etat.col = -1;
    appliquer();
  };
  // Fenêtre du filtre : liste des valeurs (peu de valeurs) ou champ « contient ».
  const ouvrirFiltre = (/** @type {number} */ i, /** @type {HTMLElement} */ bouton) => {
    const dejaOuverte = bulle && bulle.dataset.col === `${cle}|${i}`;
    fermerBulle();
    if (dejaOuverte) return;
    const valeurs = valeursCol(i), f = etat.filtres[i];
    const vides = lignes.some(l => !texteFiltre(cellules(l)[i] || l));
    const b = document.createElement('div');
    b.className = 'bulle-filtre'; b.dataset.col = `${cle}|${i}`;
    b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', `Filtrer : ${nomCol(ths[i])}`);
    if (valeurs.length <= MAX_LISTE) {
      const opt = (/** @type {string} */ v, /** @type {string} */ lib) => `<button type="button" data-v="${echapper(v)}" class="${(f && f.valeur ? f.valeur : '') === v ? 'choisi' : ''}">${echapper(lib)}</button>`;
      b.innerHTML = opt('', 'Tout') + valeurs.map(v => opt(v, v)).join('') + (vides ? opt(VIDE, '(vide)') : '');
      b.addEventListener('click', e => {
        const x = /** @type {HTMLElement | null} */ ((/** @type {Element} */ (e.target)).closest('[data-v]'));
        if (!x) return;
        etat.filtres[i] = { mode: 'liste', valeur: x.dataset.v || '' };
        fermerBulle(); appliquer(); bouton.focus();
      });
    } else {
      b.innerHTML = `<input type="search" placeholder="Contient…" aria-label="Filtrer : ${echapper(nomCol(ths[i]))}">`;
      const s = /** @type {HTMLInputElement} */ (b.firstElementChild);
      s.value = f && f.mode === 'texte' ? f.valeur : '';
      s.addEventListener('input', () => { etat.filtres[i] = { mode: 'texte', valeur: s.value }; appliquer(); });
      s.addEventListener('keydown', e => { if (e.key === 'Enter') { fermerBulle(); bouton.focus(); } });
    }
    (table.closest('dialog') || document.body).appendChild(b);
    const r = bouton.getBoundingClientRect();
    b.style.top = `${Math.round(r.bottom + 4)}px`;
    b.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - b.offsetWidth - 8)))}px`;
    bulle = b;
    const premier = /** @type {HTMLElement | null} */ (b.querySelector('input, button.choisi, button'));
    if (premier) premier.focus();
  };
  // Boutons de chaque en-tête (posés une seule fois ; ils appellent l'état courant du tableau)
  /** @type {any} */ (table)._trier = trier;
  /** @type {any} */ (table)._filtrer = ouvrirFiltre;
  ths.forEach((th, i) => {
    if (th.dataset.outilsPoses) return;
    const triOk = th.dataset.tri !== 'non', filtreOk = th.dataset.filtre !== 'non' && valeursCol(i).length > 1;
    if (!triOk && !filtreOk) return;
    th.dataset.outilsPoses = '1';
    th.classList.add('avec-outils');
    th.innerHTML = `<span class="libelle-col">${th.innerHTML}</span><span class="outils-col">${triOk ? '<button type="button" class="btn-col btn-tri"></button>' : ''}${filtreOk ? `<button type="button" class="btn-col btn-filtre">${ICONES.entonnoir}</button>` : ''}</span>`;
    const bt = th.querySelector('.btn-tri'), bf = /** @type {HTMLElement | null} */ (th.querySelector('.btn-filtre'));
    if (bt) bt.addEventListener('click', e => { e.stopPropagation(); /** @type {any} */ (table)._trier(i); });
    if (bf) bf.addEventListener('click', e => { e.stopPropagation(); /** @type {any} */ (table)._filtrer(i, bf); });
  });
  for (const k of Object.keys(etat.filtres)) if (!ths[Number(k)] || !ths[Number(k)].querySelector('.btn-filtre')) delete etat.filtres[Number(k)];
  appliquer();
}

// Styles (une fois) : boutons encadrés des en-têtes, fenêtre du filtre.
if (typeof document !== 'undefined' && !document.getElementById('style-tableaux')) {
  const st = document.createElement('style'); st.id = 'style-tableaux';
  st.textContent = `table.triable th.avec-outils { white-space: nowrap; }
table.triable th .libelle-col { white-space: normal; }
table.triable th .outils-col { display: inline-flex; gap: 2px; margin-left: 4px; vertical-align: middle; }
table.triable .btn-col { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; padding: 0; margin: 0;
  border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--muted); cursor: pointer; line-height: 0; min-height: 0; }
table.triable .btn-col svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
table.triable .btn-col:hover, table.triable .btn-col:focus-visible { color: var(--accent); border-color: var(--accent); }
table.triable .btn-col.actif { color: #fff; background: var(--accent); border-color: var(--accent); }
.bulle-filtre { position: fixed; z-index: 1000; min-width: 160px; max-width: 280px; max-height: 300px; overflow-y: auto; padding: 4px;
  background: var(--bg); color: var(--ink, inherit); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.18); }
.bulle-filtre button { display: block; width: 100%; text-align: left; padding: 4px 8px; border: 0; border-radius: 4px; background: none; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.bulle-filtre button:hover, .bulle-filtre button:focus-visible { background: var(--sel, rgba(0,0,0,.06)); }
.bulle-filtre button.choisi { font-weight: 600; color: var(--accent); }
.bulle-filtre input { width: 220px; font-size: 13px; padding: 4px 6px; box-sizing: border-box; }`;
  document.head.appendChild(st);
}
