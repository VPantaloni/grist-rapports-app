// @ts-check
// Champ avec recherche pour choisir une ligne d'une table (référence) : à la place d'une longue liste déroulante
// (SPEC § 3.4). Repris de grist-constellations-app (champ « école »). Styles : style.css (.recherche-choix).
// filtrerChoix est pure (testée avec Node) ; installerChoix n'agit qu'à l'appel.
import { norm } from './donnees.js';
import { esc } from './interface.js';

/**
 * @typedef {object} OptionsChoix
 * @property {(e: any) => string} libelle         texte affiché (et cherché, sauf `recherche`)
 * @property {(e: any) => string} [recherche]     texte cherché (ex. nom, commune, code postal)
 * @property {(e: any) => string} [detail]        complément affiché en gris (ex. commune)
 * @property {number[]} [prioritaires]            id proposés en premier, sous `titrePrioritaires`
 * @property {string} [titrePrioritaires]
 * @property {(e: any) => string} [groupe]        groupe d'un élément (ex. département) ; '' = sans groupe
 * @property {string} [groupePrefere]             groupe montré d'abord (ex. mon département)
 * @property {number} [max]                       nombre d'éléments montrés (60 par défaut)
 */

/** @typedef {{ titre: string, elements: any[] }} GroupeChoix */

// Éléments qui correspondent au texte (sans accent ni casse ; chaque mot doit apparaître), en groupes :
// prioritaires, puis groupe préféré, puis les autres groupes (ordre alphabétique) ; tri par libellé.
// Renvoie { groupes, total, montres } : `total` éléments trouvés, `montres` dans les groupes (au plus `max`).
/** @param {any[]} elements @param {string} texte @param {OptionsChoix} o */
export function filtrerChoix(elements, texte, o) {
  const mots = norm(texte).split(/\s+/).filter(Boolean);
  const cherche = o.recherche || o.libelle;
  const trouves = (elements || []).filter(e => { const t = norm(cherche(e)); return mots.every(m => t.includes(m)); })
    .sort((a, b) => String(o.libelle(a)).localeCompare(String(o.libelle(b)), 'fr'));
  const prio = new Set(o.prioritaires || []);
  const max = o.max ?? 60;
  /** @type {GroupeChoix[]} */
  const groupes = [];
  let reste = max;
  /** @param {string} titre @param {any[]} liste */
  const ajouter = (titre, liste) => {
    const pris = liste.slice(0, Math.max(0, reste));
    reste -= pris.length;
    if (pris.length) groupes.push({ titre, elements: pris });
  };
  ajouter(o.titrePrioritaires || 'Proposés', trouves.filter(e => prio.has(e.id)));
  const autres = trouves.filter(e => !prio.has(e.id));
  const g = o.groupe;
  if (!g) ajouter(groupes.length ? 'Autres' : '', autres);
  else {
    const noms = [...new Set(autres.map(e => g(e) || ''))]
      .sort((a, b) => (a === (o.groupePrefere || '') ? -1 : b === (o.groupePrefere || '') ? 1 : 0) || (a ? (b ? a.localeCompare(b, 'fr') : -1) : 1));
    for (const n of noms) ajouter(n || 'Autres', autres.filter(e => (g(e) || '') === n));
  }
  return { groupes, total: trouves.length, montres: max - reste };
}

// Installe le champ dans `hote` (un élément vide). `valeur` : id choisi (0 = aucun) ; `aChange(id)` à chaque choix.
// ✕ ou texte effacé = aucun ; un texte partiel abandonné rend la valeur précédente ; ↑ ↓ Entrée Échap au clavier.
/**
 * @param {HTMLElement} hote
 * @param {OptionsChoix & { elements: any[], valeur?: number, placeholder?: string, aChange: (id: number) => void }} o
 */
export function installerChoix(hote, o) {
  hote.classList.add('recherche-choix');
  hote.innerHTML = `<input type="text" autocomplete="off" spellcheck="false" placeholder="${esc(o.placeholder || 'Rechercher…')}"
    role="combobox" aria-expanded="false" aria-autocomplete="list">
    <button type="button" class="vider" title="Vider le champ" aria-label="Vider le champ">✕</button>
    <div class="liste" role="listbox" hidden></div>`;
  const input = /** @type {HTMLInputElement} */ (hote.querySelector('input'));
  const liste = /** @type {HTMLElement} */ (hote.querySelector('.liste'));
  const vider = /** @type {HTMLElement} */ (hote.querySelector('.vider'));
  /** @param {number} id */
  const lib = id => { const e = o.elements.find(x => x.id === id); return e ? o.libelle(e) : ''; };
  let courant = o.valeur || 0, actif = -1;
  /** @type {any[]} */
  let items = [];
  input.value = lib(courant);
  vider.hidden = !courant;

  /** @param {string} texte */
  const dessiner = texte => {
    const r = filtrerChoix(o.elements, texte, o);
    items = r.groupes.flatMap(g => g.elements);
    let i = 0;
    liste.innerHTML = r.groupes.map(g => (g.titre ? `<div class="titre">${esc(g.titre)}</div>` : '')
      + g.elements.map(e => { const k = i++; return `<div role="option" data-i="${k}" class="${k === actif ? 'actif' : ''} ${e.id === courant ? 'courant' : ''}"
        aria-selected="${e.id === courant}">${esc(o.libelle(e))}${o.detail ? ` <span class="muted">${esc(o.detail(e))}</span>` : ''}</div>`; }).join('')).join('')
      + (r.total > r.montres ? `<div class="titre">… et ${r.total - r.montres} autres : préciser la recherche</div>` : '')
      + (r.total ? '' : '<div class="titre">Aucun résultat.</div>');
    liste.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    const a = liste.querySelector('.actif');
    if (a) a.scrollIntoView({ block: 'nearest' });
  };
  const fermer = () => { liste.hidden = true; actif = -1; input.setAttribute('aria-expanded', 'false'); };
  /** @param {number} id */
  const fixer = id => { courant = id; input.value = lib(id); vider.hidden = !id; fermer(); o.aChange(id); };
  const texteRecherche = () => (input.value === lib(courant) ? '' : input.value);

  input.addEventListener('focus', () => { input.select(); actif = -1; dessiner(''); });
  input.addEventListener('input', () => { actif = -1; dessiner(input.value); });
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement === input) return;
    fermer();
    if (!input.value.trim()) { if (courant) fixer(0); } else input.value = lib(courant);
  }, 150));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (liste.hidden) return dessiner(texteRecherche());
      if (!items.length) return;
      actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      dessiner(texteRecherche());
    } else if (e.key === 'Enter' && !liste.hidden && actif >= 0) {
      e.preventDefault();
      fixer(items[actif].id);
    } else if (e.key === 'Escape' && !liste.hidden) {
      e.stopPropagation();   // Échap ferme la liste, pas le formulaire
      fermer();
      input.value = lib(courant);
    }
  });
  // mousedown (et non click) : choisir avant que le champ perde le focus.
  liste.addEventListener('mousedown', e => {
    e.preventDefault();
    const d = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-i]'));
    if (d) fixer(items[Number(d.dataset.i)].id);
  });
  vider.addEventListener('mousedown', e => { e.preventDefault(); fixer(0); input.focus(); });
}
