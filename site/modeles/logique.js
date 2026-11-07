// @ts-check
// Logique pure de l'écran Modèles & phrases (sans DOM ni grist) : testée avec Node (tests/modeles.test.js).
// Un éditeur liste / fiche par onglet, décrit par ONGLETS ; spécification : specifications/ecrans/modeles.md.
import { liste, norm } from '../commun/donnees.js';

/**
 * @typedef {{ id: string, lib: string, type: 'texte' | 'long' | 'nombre' | 'case' | 'choix' | 'ref' | 'refs', choix?: string[],
 *   cible?: string, affichee?: string, obligatoire?: boolean, unique?: boolean, aide?: string, facultative?: boolean,
 *   validation?: boolean }} Colonne
 * @typedef {{ cle: string, libelle: string, table: string, colonnes: Colonne[], titre: (l: Ligne) => string,
 *   detail?: (l: Ligne) => string, aide: string }} Onglet
 */
export const COMPETENCES = ['P1', 'P2', 'P3', 'P4', 'P5'];
export const NATURES = ['Point fort', 'Conseil', 'Vigilance', 'Autre'];

/** @type {Onglet[]} */
export const ONGLETS = [
  { cle: 'rubriques', libelle: 'Rubriques', table: 'Rubriques', titre: l => String(l.Titre || l.Code || 'Sans titre'),
    detail: l => `${l.Code || ''} · ${l.Forme || 'Texte'}${l.Imprimee === false ? ' · non imprimée' : ''}`,
    aide: 'Rubriques des rapports, dans l\'ordre. Un rapport fige ses rubriques à sa création : modifier une rubrique ne change pas les rapports existants.',
    colonnes: [
      { id: 'Titre', lib: 'Titre', type: 'texte', obligatoire: true, unique: true },
      { id: 'Code', lib: 'Code (stable, sans espace)', type: 'texte', obligatoire: true, unique: true, aide: 'Clé du texte dans les rapports : ne plus la changer une fois des rapports écrits.' },
      { id: 'Types', lib: 'Types de rapport', type: 'refs', cible: 'Types_rapport', affichee: 'Code' },
      { id: 'Ordre', lib: 'Ordre', type: 'nombre' },
      { id: 'Forme', lib: 'Forme', type: 'choix', choix: ['Texte', 'Puces'], aide: 'Puces : une ligne = une puce à l\'impression.' },
      { id: 'Imprimee', lib: 'Imprimée dans le rapport', type: 'case' },
      { id: 'Titre_imprime', lib: 'Titre imprimé (en gras)', type: 'case', facultative: true },
      { id: 'Consigne', lib: 'Consigne (affichée à la rédaction, jamais imprimée)', type: 'long' },
      { id: 'Texte_depart', lib: 'Texte de départ ({civilite}, {nom}, {prenom})', type: 'long' },
    ] },
  { cle: 'phrases', libelle: 'Phrases types', table: 'Phrases', titre: l => String(l.Texte || '').slice(0, 90) || 'Phrase vide',
    detail: l => [l.Nature, l.Competence, l.Validee ? '' : 'à valider'].filter(Boolean).join(' · '),
    aide: 'Bibliothèque de phrases proposées à la rédaction. {civilite}, {nom}, {prenom} sont remplacés à l\'insertion. Une phrase proposée par un·e CMi est visible de tous une fois validée.',
    colonnes: [
      { id: 'Texte', lib: 'Texte', type: 'long', obligatoire: true },
      { id: 'Rubrique', lib: 'Rubrique', type: 'ref', cible: 'Rubriques', affichee: 'Titre', obligatoire: true },
      { id: 'Competence', lib: 'Compétence', type: 'choix', choix: ['', ...COMPETENCES] },
      { id: 'Nature', lib: 'Nature', type: 'choix', choix: ['', ...NATURES] },
      { id: 'Validee', lib: 'Validée (visible de tous)', type: 'case', validation: true },
      { id: 'Ordre', lib: 'Ordre', type: 'nombre' },
    ] },
  { cle: 'types', libelle: 'Types de rapport', table: 'Types_rapport', titre: l => `${l.Code || ''} — ${l.Libelle || ''}`,
    aide: 'Classique, PSTG, MD : libellé, titre imprimé en tête du rapport, onglet de positionnement.',
    colonnes: [
      { id: 'Code', lib: 'Code', type: 'texte', obligatoire: true, unique: true, aide: 'CLASSIQUE, PSTG et MD sont reconnus par l\'application (type proposé d\'office).' },
      { id: 'Libelle', lib: 'Libellé', type: 'texte' },
      { id: 'Titre', lib: 'Titre du document', type: 'texte' },
      { id: 'Positionnement', lib: 'Onglet « Positionnement MD »', type: 'case' },
      { id: 'Ordre', lib: 'Ordre', type: 'nombre' },
    ] },
  { cle: 'grille', libelle: 'Grille MD', table: 'Competences_MD', titre: l => `${l.Code || ''} – ${l.Libelle || ''}`,
    aide: 'Compétences du positionnement des maître·sses délégué·es (jamais imprimé dans le rapport). L\'échelle des niveaux est le paramètre « echelle_md ».',
    colonnes: [
      { id: 'Code', lib: 'Code', type: 'texte', obligatoire: true, unique: true },
      { id: 'Libelle', lib: 'Compétence', type: 'long', obligatoire: true },
      { id: 'Domaine', lib: 'Domaine', type: 'texte' },
      { id: 'Ordre', lib: 'Ordre', type: 'nombre' },
    ] },
  { cle: 'parametres', libelle: 'Paramètres', table: 'Parametres', titre: l => String(l.Cle || ''), detail: l => String(l.Description || ''),
    aide: 'discipline, entete (une ligne par ligne d\'en-tête), secretariat (destinataire), mail_objet et mail_texte ({etablissement}, {professeur}, {auteur}, {date}), echelle_md (niveaux séparés par « ; »). Les IA-IPR en copie des PSTG se règlent dans l\'Annuaire.',
    colonnes: [
      { id: 'Cle', lib: 'Clé', type: 'texte', obligatoire: true, unique: true },
      { id: 'Valeur', lib: 'Valeur', type: 'long' },
      { id: 'Description', lib: 'Description', type: 'texte' },
    ] },
];
export const onglet = (/** @type {string} */ cle) => ONGLETS.find(o => o.cle === cle) || ONGLETS[0];

// Lignes d'un onglet, triées (Ordre, puis titre), filtrées par la recherche.
/** @param {Onglet} o @param {Ligne[]} lignes @param {string} [recherche] */
export function trier(o, lignes, recherche = '') {
  const q = norm(recherche);
  return lignes.filter(l => !q || norm(o.colonnes.map(c => l[c.id]).join(' ')).includes(q))
    .sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0) || o.titre(a).localeCompare(o.titre(b), 'fr'));
}
// Phrases : filtres rubrique, compétence, « à valider ».
/** @param {Ligne[]} phrases @param {{ rubrique?: number, competence?: string, aValider?: boolean }} f */
export const filtrerPhrases = (phrases, f) => phrases.filter(p => (!f.rubrique || p.Rubrique === f.rubrique)
  && (!f.competence || p.Competence === f.competence) && (!f.aValider || p.Validee !== true));

// Formulaire → valeurs Grist (listes de références ['L', …], nombres, cases).
/** @param {Onglet} o @param {Record<string, any>} f @param {string[]} colonnesPresentes */
export function versGrist(o, f, colonnesPresentes) {
  /** @type {Record<string, any>} */
  const v = {};
  for (const c of o.colonnes) {
    if (c.facultative && !colonnesPresentes.includes(c.id)) continue;
    const x = f[c.id];
    v[c.id] = c.type === 'refs' ? ['L', ...liste(x)] : c.type === 'ref' ? (Number(x) || 0) : c.type === 'case' ? !!x
      : c.type === 'nombre' ? (x === '' || x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(x)) : String(x ?? '').trim();
  }
  return v;
}
// Validation : obligatoires, valeurs uniques (sans accent ni casse), nombre lisible, code sans espace.
/** @param {Onglet} o @param {Record<string, any>} f @param {Ligne[]} lignes @param {number | null} id */
export function valider(o, f, lignes, id) {
  /** @type {string[]} */
  const e = [];
  for (const c of o.colonnes) {
    const x = f[c.id];
    if (c.obligatoire && (c.type === 'ref' ? !Number(x) : !String(x ?? '').trim())) e.push(`${c.lib} : obligatoire.`);
    if (c.unique && String(x ?? '').trim() && lignes.some(l => l.id !== id && norm(l[c.id]).trim() === norm(x).trim())) e.push(`${c.lib} « ${x} » : déjà utilisé.`);
    if (c.type === 'nombre' && String(x ?? '').trim() && !Number.isFinite(Number(x))) e.push(`${c.lib} : un nombre.`);
  }
  if ((o.cle === 'rubriques' || o.cle === 'grille' || o.cle === 'parametres') && /\s/.test(String(f.Code ?? f.Cle ?? '').trim())) e.push('Code ou clé : sans espace.');
  return e;
}
// Ordre d'une nouvelle ligne : après la dernière, pas de 10.
/** @param {Ligne[]} lignes */
export const ordreSuivant = lignes => (Math.floor(Math.max(0, ...lignes.map(l => Number(l.Ordre) || 0)) / 10) + 1) * 10;

// Lot de phrases collées : une par ligne (puces et numéros retirés), sans ligne vide ni doublon (ni phrase existante).
/** @param {string} texte @param {Ligne[]} existantes */
export function lirePhrasesCollees(texte, existantes = []) {
  const deja = new Set(existantes.map(p => norm(p.Texte).trim()));
  const vues = new Set();
  return String(texte || '').split(/\r?\n/).map(x => x.replace(/^\s*(?:[-•*–]|\d+[.)])\s*/, '').trim()).filter(x => {
    const k = norm(x);
    if (!x || deja.has(k) || vues.has(k)) return false;
    vues.add(k); return true;
  });
}

// Droits : « Limité » sur Phrases = les siennes, non validées (même condition que la règle d'accès).
/** @param {string} table @param {DroitsTable} d @param {Ligne | null | undefined} moi @param {Ligne} l */
export function peutModifier(table, d, moi, l) {
  if (d.M === 'Oui') return true;
  return table === 'Phrases' && d.M === 'Limité' && !!moi && !!moi.Personne && l.Auteur === moi.Personne && l.Validee !== true;
}
/** @param {string} table @param {DroitsTable} d @param {Ligne | null | undefined} moi @param {Ligne} l */
export function peutSupprimer(table, d, moi, l) {
  if (d.S === 'Oui') return true;
  return table === 'Phrases' && d.S === 'Limité' && !!moi && !!moi.Personne && l.Auteur === moi.Personne && l.Validee !== true;
}
/** @param {DroitsTable} d @param {Ligne | null | undefined} moi */
export const peutCreer = (d, moi) => d.C === 'Oui' || (d.C === 'Limité' && !!moi && !!moi.Personne);
// Valider une phrase : seulement avec Modifier « Oui » (IA-IPR, admins).
/** @param {DroitsTable} d */
export const peutValider = d => d.M === 'Oui';
