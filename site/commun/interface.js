// @ts-check
// Briques d'interface communes à tous les écrans (SPEC § 3.9). Styles associés : style.css.
// esc et couleurSure sont pures (testées avec Node) ; le reste n'agit qu'à l'appel, jamais à l'import.
import { PREFIXE } from './config.js';

/** @param {string} id @returns {any} élément de la page (null s'il n'existe pas) */
export const $ = id => document.getElementById(id);

// Échappe le HTML : toute valeur issue de Grist passe par là avant d'entrer dans le DOM.
/** @param {any} s @returns {string} */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Couleur insérée dans un attribut style : seulement #rgb, #rrggbb ou #rrggbbaa, sinon `defaut`.
/** @param {any} c @param {string} [defaut] @returns {string} */
export function couleurSure(c, defaut = '#8a8f98') {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(c || '').trim()) ? String(c).trim() : defaut;
}

// Élément d'interface commun (#toast, #bulle-aide) : créé au besoin, la page n'a pas à le prévoir.
/** @param {string} id @param {string} [role] @returns {HTMLElement} */
function element(id, role) {
  let el = $(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    if (role) el.setAttribute('role', role);
    document.body.appendChild(el);
  }
  return el;
}

// Message d'état dans la zone #msg (prévue par la page) ; texte vide = zone masquée.
/** @param {string} t @param {boolean} [erreur] */
export function message(t, erreur = false) {
  const m = $('msg');
  if (!m) return;
  m.hidden = !t;
  m.textContent = t || '';
  m.classList.toggle('error', erreur);
}

// Retour d'action : 2 s, ou 5 s pour une erreur.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let minuterieToast;
/** @param {string} t @param {boolean} [erreur] */
export function toast(t, erreur = false) {
  const el = element('toast', 'status');
  el.textContent = t;
  el.classList.toggle('erreur', erreur);
  el.hidden = false;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => { el.hidden = true; }, erreur ? 5000 : 2000);
}

// --- Info-bulles maison ---
// Tout élément avec « title » ou « data-tip » : au survol, le title devient data-tip (plus d'info-bulle native) et la bulle
// s'affiche sous l'élément (au-dessus si la place manque), 3 s au plus (plus pour un texte long) ; elle disparaît aussi en sortant ou au clic.
/** @type {HTMLElement | null} */
let cibleBulle = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let minuterieBulle;
/** @param {HTMLElement | null} el */
export function montrerBulle(el) {
  const t = el && el.dataset.tip;
  if (!t) return;
  const b = element('bulle-aide', 'tooltip');
  // Dans une fenêtre modale (<dialog>, « couche supérieure ») : la bulle y est déplacée, sinon elle resterait dessous.
  const hote = el.closest('dialog[open]') || document.body;
  if (b.parentElement !== hote) hote.appendChild(b);
  b.textContent = t;
  b.classList.toggle('longue', t.length > 140);
  b.classList.add('visible');
  const r = el.getBoundingClientRect(), l = b.offsetWidth, h = b.offsetHeight;
  const x = Math.max(6, Math.min(window.innerWidth - l - 6, r.left + r.width / 2 - l / 2));
  const y = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
  b.style.left = x + 'px'; b.style.top = Math.max(6, y) + 'px';
  clearTimeout(minuterieBulle);
  minuterieBulle = setTimeout(cacherBulle, Math.min(12000, 3000 + t.length * 30));   // texte long (descripteur) : le temps de le lire
}
export function cacherBulle() {
  clearTimeout(minuterieBulle);
  const b = $('bulle-aide');
  if (b) b.classList.remove('visible');
}
export function installerBulles() {
  document.addEventListener('mouseover', e => {
    const cible = /** @type {Element | null} */ (e.target);
    const el = /** @type {HTMLElement | null} */ (cible && cible.closest ? cible.closest('[title], [data-tip]') : null);
    if (el === cibleBulle) return;
    cibleBulle = el;
    if (!el) return cacherBulle();
    if (el.hasAttribute('title')) {
      el.dataset.tip = el.getAttribute('title');
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tip);   // garder le texte pour les lecteurs d'écran
      el.removeAttribute('title');
    }
    montrerBulle(el);
  });
  document.addEventListener('mouseout', e => {
    if (cibleBulle && !cibleBulle.contains(/** @type {Node | null} */ (e.relatedTarget))) { cibleBulle = null; cacherBulle(); }
  });
  document.addEventListener('mousedown', cacherBulle);
}

// Préférences personnelles (SPEC § 3.8) : localStorage, clé = PREFIXE + écran + clé, toujours dans un try/catch.
// const pref = preferences('Projets'); pref.lire('Sel', '0'); pref.ecrire('Sel', '12');
/**
 * @param {string} ecran
 * @returns {{ lire: (c: string, defaut: any) => any, ecrire: (c: string, v: string) => void }}
 */
export function preferences(ecran) {
  /** @param {string} c */
  const cle = c => PREFIXE + ecran + c;
  return {
    lire(c, defaut) { try { const v = localStorage.getItem(cle(c)); return v === null ? defaut : v; } catch (e) { return defaut; } },
    ecrire(c, v) { try { localStorage.setItem(cle(c), v); } catch (e) { /* stockage indisponible */ } },
  };
}

// Action à confirmer (suppression) : double clic, sans confirm() (bloqué dans le cadre de Grist).
// Le premier clic arme le bouton pour 3 s (texte de confirmation, classe « confirmer »).
/** @param {HTMLElement} bouton @param {string} texteConfirmation @param {() => any} action */
export function boutonConfirmation(bouton, texteConfirmation, action) {
  const texteInitial = bouton.textContent;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let arme = null;
  bouton.addEventListener('click', () => {
    if (arme) { clearTimeout(arme); arme = null; action(); return; }
    bouton.textContent = texteConfirmation;
    bouton.classList.add('confirmer');
    arme = setTimeout(() => { arme = null; bouton.textContent = texteInitial; bouton.classList.remove('confirmer'); }, 3000);
  });
}

// Copie dans le presse-papiers : texte brut, et HTML mis en forme si fourni (collé tel quel par une messagerie).
// API Clipboard d'abord ; dans un cadre qui la refuse (Grist, conteneur), sélection + execCommand('copy'), qui garde
// aussi la mise en forme. Renvoie true si la copie a réussi.
/** @param {string} texte @param {string} [html] @returns {Promise<boolean>} */
export async function copier(texte, html) {
  try {
    if (html && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([texte], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    } else await navigator.clipboard.writeText(texte);
    return true;
  } catch (e) { /* presse-papiers refusé dans le cadre */ }
  const el = document.createElement(html ? 'div' : 'textarea');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap;';
  if (html) { el.contentEditable = 'true'; el.innerHTML = html; } else /** @type {HTMLTextAreaElement} */ (el).value = texte;
  document.body.appendChild(el);
  const actif = /** @type {HTMLElement | null} */ (document.activeElement);
  let ok = false;
  try {
    if (html) {
      const r = document.createRange(); r.selectNodeContents(el);
      const s = window.getSelection(); if (s) { s.removeAllRanges(); s.addRange(r); }
    } else /** @type {HTMLTextAreaElement} */ (el).select();
    ok = document.execCommand('copy');
  } catch (e) { ok = false; }
  el.remove();
  const s = window.getSelection(); if (s) s.removeAllRanges();
  if (actif && actif.focus) actif.focus();
  return ok;
}
