// @ts-check
// Lien avec la table de référence Professeurs (fichier académique de l'année) : logique pure, testée avec Node
// (tests/commun.test.js). Les tables Visites, Stagiaires et Tutorats gardent une COPIE de l'identité et de
// l'établissement (le fichier change chaque année : la copie garde l'histoire). Pour l'année en cours, la copie suit le
// fichier : si l'UAI, le nom ou l'e-mail d'un·e professeur·e relié·e change dans Professeurs, la copie est mise à jour
// (écrite par les comptes qui en ont le droit, appliquée à l'affichage pour les autres). APP § 11, 2026-11-11.
import { refId } from './donnees.js';

/** @typedef {Record<string, any>} Ligne */
// Copie → source : « p.Colonne » (Professeurs) ou « e.Colonne » (Etablissements, d'après l'UAI du ou de la professeur·e).
/** @type {Record<string, Record<string, string>>} */
export const COPIES = {
  Visites: { Prof_nom: 'p.Nom', Prof_prenom: 'p.Prenom', UAI: 'p.UAI', Etab_nom: 'e.Nom' },
  Stagiaires: { Civilite: 'p.Civilite', Nom: 'p.Nom', Prenom: 'p.Prenom', Email: 'p.Email', UAI: 'p.UAI', Etab_nom: 'e.Nom', Etab_commune: 'e.Commune' },
  Tutorats: { Civilite: 'p.Civilite', Nom: 'p.Nom', Prenom: 'p.Prenom', Email: 'p.Email', UAI: 'p.UAI', Etab_nom: 'e.Nom' },
};
const texte = (/** @type {any} */ v) => (v === null || v === undefined ? '' : String(v)).trim();

// Champs de la copie qui diffèrent du fichier (valeurs vides du fichier ignorées : la copie n'est jamais effacée).
/** @param {string} table @param {Ligne} ligne @param {Ligne[]} profs @param {Ligne[]} etabs @returns {Ligne} */
export function ecartsCopie(table, ligne, profs, etabs) {
  const id = refId(ligne.Professeur);
  const p = id ? profs.find(x => x.id === id) : null;
  if (!p) return {};
  const uai = texte(p.UAI).toUpperCase();
  const e = uai ? etabs.find(x => texte(x.UAI).toUpperCase() === uai) || {} : {};
  /** @type {Ligne} */
  const diff = {};
  for (const [col, src] of Object.entries(COPIES[table] || {})) {
    const [o, c] = src.split('.');
    let v = texte((o === 'p' ? p : e)[c]);
    if (col === 'UAI') v = v.toUpperCase();
    if (v && v !== texte(ligne[col])) diff[col] = v;
  }
  return diff;
}
// Copies à mettre à jour : { lignes (copies corrigées, pour l'affichage), actions (UpdateRecord), n }.
// garder(ligne) : lignes concernées (ex. année en cours, visite sans rapport).
/**
 * @param {string} table @param {Ligne[]} lignes @param {Ligne[]} profs @param {Ligne[]} etabs
 * @param {(l: Ligne) => boolean} [garder]
 */
export function synchroniserCopies(table, lignes, profs, etabs, garder = () => true) {
  /** @type {any[]} */
  const actions = [];
  const res = lignes.map(l => {
    if (!garder(l)) return l;
    const d = ecartsCopie(table, l, profs, etabs);
    if (!Object.keys(d).length) return l;
    actions.push(['UpdateRecord', table, l.id, d]);
    return { ...l, ...d };
  });
  return { lignes: res, actions, n: actions.length };
}
