// @ts-check
// Lien avec la table de référence Professeurs (fichier académique de l'année) : logique pure, testée avec Node
// (tests/commun.test.js). Les tables Visites, Stagiaires et Tutorats gardent une COPIE de l'identité et de
// l'établissement (le fichier change chaque année : la copie garde l'histoire). Pour l'année en cours, la copie suit le
// fichier : si l'UAI, le nom ou l'e-mail d'un·e professeur·e relié·e change dans Professeurs, la copie est mise à jour
// (écrite par les comptes qui en ont le droit, appliquée à l'affichage pour les autres). APP § 11, 2026-11-11.
import { refId, norm } from './donnees.js';

/** @typedef {Record<string, any>} Ligne */
// Copie → source : « p.Colonne » (Professeurs) ou « e.Colonne » (Etablissements, d'après l'UAI du ou de la professeur·e).
/** @type {Record<string, Record<string, string>>} */
export const COPIES = {
  Visites: { Prof_nom: 'p.Nom', Prof_prenom: 'p.Prenom', UAI: 'p.UAI', Etab_nom: 'e.Nom' },
  Stagiaires: { Civilite: 'p.Civilite', Nom: 'p.Nom', Prenom: 'p.Prenom', Email: 'p.Email', UAI: 'p.UAI', Etab_nom: 'e.Nom', Etab_commune: 'e.Commune' },
  Tutorats: { Civilite: 'p.Civilite', Nom: 'p.Nom', Prenom: 'p.Prenom', Email: 'p.Email', UAI: 'p.UAI', Etab_nom: 'e.Nom' },
};
const texte = (/** @type {any} */ v) => (v === null || v === undefined ? '' : String(v)).trim();

const uaiDe = (/** @type {any} */ v) => texte(v).replace(/\s+/g, '').toUpperCase();
const cleNom = (/** @type {any} */ s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
// Nom d'une ligne EDT (« M. NOM PRENOM (EDT) ») → clé « nom prenom ».
const cleEdt = (/** @type {string} */ n) => cleNom(n.replace(/\(\s*EDT\s*\)/ig, '').replace(/^\s*(MME|MLLE|MM|M\.?)\s+/i, ''));
// Clés à essayer pour un·e professeur·e : nom + tous les prénoms, nom + premier prénom.
const essaisNom = (/** @type {any} */ nom, /** @type {any} */ prenom) => {
  const n = cleNom(nom), p = cleNom(prenom).split(' ').filter(Boolean);
  return [...new Set([n + ' ' + p.join(' '), n + ' ' + (p[0] || '')].map(x => x.trim()))];
};

// --- Emplois du temps (table EDT) ---
// Index : établissements qui ont des EdT (uais), noms masqués (« v1:… », chiffrés sans « Révéler »), clés « UAI|nom »,
// établissements où apparaît chaque nom (parNom), établissements dont l'EdT n'est pas dans Siiprien (absents :
// Etablissements.Edt_absent, coché par un·e IA-IPR).
/** @param {Ligne[]} edt @param {Ligne[]} [etabs] */
export function indexEdt(edt, etabs = []) {
  const uais = new Set(), masques = new Set(), cles = new Set();
  /** @type {Map<string, Set<string>>} */
  const parNom = new Map();
  for (const l of edt || []) {
    const u = uaiDe(l.UAI);
    if (!u) continue;
    uais.add(u);
    const n = String(l.Nom ?? '').trim();
    if (!n || /^v1:/.test(n)) { masques.add(u); continue; }
    const k = cleEdt(n);
    cles.add(u + '|' + k);
    if (!parNom.has(k)) parNom.set(k, new Set());
    /** @type {Set<string>} */ (parNom.get(k)).add(u);
  }
  const absents = new Set((etabs || []).filter(e => e.Edt_absent === true).map(e => uaiDe(e.UAI)));
  return { uais, masques, cles, parNom, absents };
}
// 'oui' : EdT du ou de la professeur·e ; 'absent' : EdT de l'établissement sans ce·tte professeur·e ; 'non' : aucun EdT
// pour l'établissement ; 'siiprien' : EdT de l'établissement absent de Siiprien (inconnu) ; 'masque' : établissement
// versé, noms masqués (« Révéler »).
/** @param {Ligne} v (Prof_nom, Prof_prenom, UAI ; ou Nom, Prenom, UAI) @param {ReturnType<typeof indexEdt>} idx */
export function edtDe(v, idx) {
  const u = uaiDe(v.UAI);
  if (!u || !idx.uais.has(u)) return u && idx.absents && idx.absents.has(u) ? 'siiprien' : 'non';
  if (essaisNom(v.Prof_nom ?? v.Nom, v.Prof_prenom ?? v.Prenom).some(k => idx.cles.has(u + '|' + k))) return 'oui';
  return idx.masques.has(u) ? 'masque' : 'absent';
}
// Établissements où le nom apparaît dans les EdT.
/** @param {any} nom @param {any} prenom @param {ReturnType<typeof indexEdt>} idx @returns {string[]} */
export function uaisEdt(nom, prenom, idx) {
  const s = new Set();
  for (const k of essaisNom(nom, prenom)) for (const u of (idx.parNom && idx.parNom.get(k)) || []) s.add(u);
  return [...s].sort();
}
// Établissement réel d'un·e professeur·e (APP § 11, 2026-11-14) : celui où il ou elle apparaît dans les EdT est
// prioritaire. Pour éviter les homonymes, cet établissement n'est retenu que s'il est l'une de ses affectations du
// fichier (plusieurs lignes Professeurs), ou si l'affectation du fichier n'est pas un établissement scolaire (Rectorat,
// UAI absent de Etablissements) et qu'un seul établissement convient. '' = garder l'UAI du fichier.
/** @param {Ligne} p ligne Professeurs @param {Ligne[]} profs @param {Ligne[]} etabs @param {ReturnType<typeof indexEdt> | null} idx */
export function uaiReel(p, profs, etabs, idx) {
  if (!idx || !p) return '';
  const cand = uaisEdt(p.Nom, p.Prenom, idx);
  if (!cand.length) return '';
  const u = uaiDe(p.UAI);
  if (cand.includes(u)) return u;
  const cles = essaisNom(p.Nom, p.Prenom);
  const affect = new Set(profs.filter(x => essaisNom(x.Nom, x.Prenom).some(k => cles.includes(k))).map(x => uaiDe(x.UAI)));
  const communs = cand.filter(x => affect.has(x));
  if (communs.length) return communs[0];
  return cand.length === 1 && !estEtablissementScolaire(u, etabs) ? cand[0] : '';
}
// Établissement scolaire connu ? (absent de Etablissements, ou sigle RECT, DSDEN… = service administratif)
/** @param {string} uai @param {Ligne[]} etabs */
export function estEtablissementScolaire(uai, etabs) {
  const e = (etabs || []).find(x => uaiDe(x.UAI) === uaiDe(uai));
  return !!e && !/^(RECT|DSDEN|DSD|IA|SERV|ADM)/i.test(texte(e.Sigle));
}
// Discipline en forme courte (colonne du plan) : MATHEMATIQUES → MATHS, NUMERIQUE SCIENCES INFORMATIQUES → NSI.
/** @param {any} d */
export function disciplineCourte(d) {
  const n = norm(d).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n) return '';
  if (/^mathematiques?$/.test(n) || n === 'maths') return 'MATHS';
  if (/numerique.*sciences?.*informatique/.test(n) || n === 'nsi') return 'NSI';
  if (/physique.*chimie/.test(n)) return 'PC';
  if (/^sciences? numeriques? et technologie/.test(n)) return 'SNT';
  return texte(d).toUpperCase().slice(0, 8);
}

// Champs de la copie qui diffèrent du fichier (valeurs vides du fichier ignorées : la copie n'est jamais effacée).
// Établissement : celui choisi à la main (UAI_choisi coché) est gardé ; sinon l'établissement réel (EdT) s'il est connu
// (options.edt), sinon celui du fichier. options.garderEtab : établissement de la copie gardé (noms des EdT masqués :
// l'établissement réel ne peut pas être vérifié).
/**
 * @param {string} table @param {Ligne} ligne @param {Ligne[]} profs @param {Ligne[]} etabs
 * @param {{ edt?: ReturnType<typeof indexEdt> | null, garderEtab?: boolean }} [options] @returns {Ligne}
 */
export function ecartsCopie(table, ligne, profs, etabs, options = {}) {
  const id = refId(ligne.Professeur);
  const p = id ? profs.find(x => x.id === id) : null;
  if (!p) return {};
  const choisi = (ligne.UAI_choisi === true || !!options.garderEtab) && !!uaiDe(ligne.UAI);
  const uai = choisi ? uaiDe(ligne.UAI) : (uaiReel(p, profs, etabs, options.edt || null) || uaiDe(p.UAI));
  const e = uai ? etabs.find(x => texte(x.UAI).toUpperCase() === uai) || {} : {};
  /** @type {Ligne} */
  const diff = {};
  for (const [col, src] of Object.entries(COPIES[table] || {})) {
    const [o, c] = src.split('.');
    let v = texte((o === 'p' ? p : e)[c]);
    if (col === 'UAI') v = uai;
    if (choisi && o === 'e' && !v) continue;
    if (v && v !== texte(ligne[col])) diff[col] = v;
  }
  return diff;
}
// Copies à mettre à jour : { lignes (copies corrigées, pour l'affichage), actions (UpdateRecord), n }.
// garder(ligne) : lignes concernées (ex. année en cours, visite sans rapport).
/**
 * @param {string} table @param {Ligne[]} lignes @param {Ligne[]} profs @param {Ligne[]} etabs
 * @param {(l: Ligne) => boolean} [garder] @param {{ edt?: ReturnType<typeof indexEdt> | null, garderEtab?: boolean }} [options]
 */
export function synchroniserCopies(table, lignes, profs, etabs, garder = () => true, options = {}) {
  /** @type {any[]} */
  const actions = [];
  const res = lignes.map(l => {
    if (!garder(l)) return l;
    const d = ecartsCopie(table, l, profs, etabs, options);
    if (!Object.keys(d).length) return l;
    actions.push(['UpdateRecord', table, l.id, d]);
    return { ...l, ...d };
  });
  return { lignes: res, actions, n: actions.length };
}
