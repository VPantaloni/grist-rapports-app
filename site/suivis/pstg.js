// @ts-check
// Logique pure du suivi des stagiaires (Suivis → Suivi PSTG, vue « Suivi ») : testée avec Node (tests/suivis-pstg.test.js).
// Une ligne par stagiaire, une colonne par retour de l'année (tuteur·trice, auto-positionnement, visites, bilans), un rond
// de synthèse par case ; le détail (une couleur par compétence) au survol, la fiche complète au clic.
// Retours saisis : table Retours_PSTG (Positionnement { code : rang 1-4 }, chiffré). Visites CMi et IA-IPR : tirées
// aussi des rapports PSTG de l'application (rien n'est recopié), comme les rapports MD dans le Suivi MD.
import { norm } from '../commun/donnees.js';
import { couleurNiveau, lirePositionnement } from '../rapports/logique.js';

/** @typedef {Record<string, any>} Ligne */
/** @typedef {{ cle: string, desc: string }} Niveau */
/**
 * @typedef {{ source: 'saisie' | 'rapport', id: number, type: string, date: number | null, par: string, personne: number,
 *   avis: string, pos: Record<string, number>, dispositif: boolean, commentaire: string, statut: string }} Retour
 */

export const TABLE_RETOURS = 'Retours_PSTG';
export const TABLE_GRILLES = 'Grilles_PSTG';
export const TYPES_RETOUR = ['Retour tuteur 1', 'Auto-positionnement', 'Visite CMi', 'Visite INSPÉ', 'Bilan intermédiaire', 'Visite IA-IPR', 'Bilan final'];
export const AVIS = ['Difficultés importantes', 'Points de vigilance', 'Satisfaisant'];
export const AVIS_TITULARISATION = ['Favorable', 'Défavorable', 'Renouvellement', 'Prolongation'];
export const SITUATIONS = ['1re année', 'Renouvellement', 'Prolongation'];
export const PRIORITAIRES_DEFAUT = 'P3 ; P4 ; CC1 ; CC6';

// Échelles des fiches (même ordre, du plus faible au plus fort ; mêmes couleurs que le positionnement PSTG).
/** @type {Record<string, Niveau[]>} */
export const ECHELLES = {
  auto: [
    { cle: 'I', desc: "Insuffisant : compétence non maîtrisée qui crée une difficulté dans l'exercice du métier" },
    { cle: 'AD', desc: 'À développer : compétence fragile qui doit être travaillée' },
    { cle: 'S', desc: 'Satisfaisant : compétence acquise, maîtrisée' },
    { cle: 'R', desc: "Remarquable : compétence très bien maîtrisée, point fort de la professionnalité de l'enseignant·e" },
  ],
  bilans: [
    { cle: '1', desc: "Compétence non acquise qui crée une difficulté importante dans l'exercice quotidien du métier" },
    { cle: '2', desc: 'Compétence fragile qui doit être travaillée rapidement avant juin' },
    { cle: '3', desc: "Compétence suffisamment développée à ce stade de l'année" },
    { cle: '4', desc: "Compétence d'ores et déjà bien maîtrisée" },
  ],
};

// Colonnes du tableau, dans l'ordre de l'année. grille : compétences de Grilles_PSTG (auto : fiche d'auto-positionnement ;
// bilans : fiches de bilan ; P : P1-P5, visites) ; types : retours rangés dans la colonne.
/**
 * @typedef {{ cle: string, titre: string, aide: string, type: string, forme: 'avis' | 'grille', grille?: 'auto' | 'bilans' | 'P',
 *   echelle?: string, rang?: number }} Colonne
 */
/** @type {Colonne[]} */
export const COLONNES = [
  { cle: 'tuteur1', titre: 'Tuteur 1', aide: '1er retour du tuteur ou de la tutrice (sept.-oct.)', type: 'Retour tuteur 1', forme: 'avis' },
  { cle: 'auto', titre: 'Auto-pos.', aide: 'Auto-positionnement (octobre) : P1-P5, CC1, CC2, CC6, CC10 ; I, AD, S, R', type: 'Auto-positionnement', forme: 'grille', grille: 'auto', echelle: 'auto' },
  { cle: 'cmi', titre: 'Visite CMi', aide: 'Visite(s) de CMi : positionnement P1-P5 (rapport PSTG de l\'application ou saisie)', type: 'Visite CMi', forme: 'grille', grille: 'P', echelle: 'pstg' },
  { cle: 'inspe', titre: 'INSPÉ', aide: 'Visite INSPÉ (saisie à la main)', type: 'Visite INSPÉ', forme: 'avis' },
  { cle: 'bilan_i', titre: 'Bilan interm.', aide: 'Bilan intermédiaire : compétences communes et P1-P5 ; niveaux 1 à 4', type: 'Bilan intermédiaire', forme: 'grille', grille: 'bilans', echelle: 'bilans' },
  { cle: 'ipr1', titre: 'IA-IPR 1', aide: '1re visite IA-IPR (rapport de l\'application ou saisie)', type: 'Visite IA-IPR', forme: 'avis', grille: 'P', echelle: 'pstg', rang: 1 },
  { cle: 'ipr2', titre: 'IA-IPR 2', aide: '2e visite IA-IPR (rare)', type: 'Visite IA-IPR', forme: 'avis', grille: 'P', echelle: 'pstg', rang: 2 },
  { cle: 'bilan_f', titre: 'Bilan final', aide: 'Bilan final : compétences communes et P1-P5 ; niveaux 1 à 4', type: 'Bilan final', forme: 'grille', grille: 'bilans', echelle: 'bilans' },
];
/** @param {string} cle */
export const colonne = cle => COLONNES.find(c => c.cle === cle);

// Compétences prioritaires (couleur de synthèse) : Parametres.competences_prioritaires.
/** @param {Record<string, any>} [params] */
export const prioritaires = (params = {}) => String(params.competences_prioritaires || PRIORITAIRES_DEFAUT)
  .split(/[;,\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);

// Compétences d'une grille, dans l'ordre.
/** @param {Ligne[]} grilles lignes de Grilles_PSTG @param {'auto' | 'bilans' | 'P' | undefined} quoi */
export function competencesDe(grilles, quoi) {
  const ok = (/** @type {Ligne} */ g) => (quoi === 'auto' ? g.Auto_positionnement === true : quoi === 'bilans' ? g.Bilans === true
    : quoi === 'P' ? String(g.Groupe || '') === 'P' || /^P\d/i.test(String(g.Code || '')) : false);
  const ordre = (/** @type {Ligne} */ g) => (String(g.Groupe) === 'P' || /^P/i.test(String(g.Code)) ? 0 : 1);
  return grilles.filter(ok).sort((a, b) => ordre(a) - ordre(b) || (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0));
}
// Échelle d'une colonne ; « pstg » : échelle du type de rapport PSTG (Types_rapport.Echelle), sinon celle des bilans.
/** @param {Colonne | undefined} c @param {Niveau[]} [echellePstg] @returns {Niveau[]} */
export function echelleDe(c, echellePstg = []) {
  if (!c) return [];
  if (c.forme === 'avis' && !c.grille) return AVIS.map(a => ({ cle: a, desc: '' }));
  if (c.echelle === 'pstg') return echellePstg.length ? echellePstg : ECHELLES.bilans;
  return ECHELLES[c.echelle || 'bilans'] || ECHELLES.bilans;
}
// Descripteur d'un niveau (rang 1-4) dans le texte « I : … » de Grilles_PSTG.Descripteurs : par la clé, sinon par la position.
/** @param {any} texte @param {Niveau[]} echelle @param {number} rang */
export function descripteur(texte, echelle, rang) {
  const paras = [];
  for (const l of String(texte || '').split(/\r?\n/)) {
    const m = /^\s*([^:]{1,12}?)\s*:\s*(.*)$/.exec(l);
    if (m) paras.push({ cle: norm(m[1]), t: m[2].trim() });
    else if (paras.length && l.trim()) paras[paras.length - 1].t += ' ' + l.trim();
  }
  const n = echelle[rang - 1];
  const parCle = n && paras.find(p => p.cle === norm(n.cle));
  return parCle ? parCle.t : (paras[rang - 1] || { t: '' }).t;
}

// Couleurs : grilles sur 4 niveaux (rouge, orange, vert clair, vert vif), avis simples sur 3 (rouge, orange, vert vif).
/** @param {number} rang @param {number} [n] */
export const couleur = (rang, n = 4) => couleurNiveau(rang, n);
/** @param {any} avis */
export const rangAvis = avis => AVIS.indexOf(String(avis || '')) + 1;
export const COULEURS_TITULARISATION = /** @type {Record<string, string>} */ ({ Favorable: 'fav', Défavorable: 'def', Renouvellement: 'ren', Prolongation: 'pro' });

// Positionnement saisi : JSON { code : rang } (nombres 1-4).
/** @param {any} json @returns {Record<string, number>} */
export function lirePos(json) {
  let o = {};
  try { o = typeof json === 'string' && json.trim() ? JSON.parse(json) : (json && typeof json === 'object' ? json : {}); } catch (e) { o = {}; }
  /** @type {Record<string, number>} */
  const r = {};
  for (const [k, v] of Object.entries(o || {})) { const n = Number(v); if (n >= 1 && n <= 4) r[String(k).toUpperCase()] = n; }
  return r;
}

// Retours d'un·e stagiaire : saisis (Retours_PSTG) et visites tirées des rapports PSTG de l'année (même professeur·e,
// ou même nom et prénom), du plus ancien au plus récent. Auteur·e CMi → « Visite CMi », IA-IPR → « Visite IA-IPR ».
/**
 * @param {Ligne} s ligne de Stagiaires
 * @param {{ retours: Ligne[], rapports: Ligne[], personnes: Ligne[], typePstg?: number, echellePstg?: Niveau[] }} D
 * @returns {Retour[]}
 */
export function retoursDe(s, D) {
  /** @type {Retour[]} */
  const r = D.retours.filter(x => x.Stagiaire === s.id).map(x => ({ source: 'saisie', id: x.id, type: String(x.Type || ''), date: x.Date || null,
    par: String(x.Par || ''), personne: Number(x.Personne) || 0, avis: String(x.Avis || ''), pos: lirePos(x.Positionnement),
    dispositif: x.Dispositif === true, commentaire: String(x.Commentaire || ''), statut: '' }));
  const k = (/** @type {any} */ n, /** @type {any} */ p) => `${norm(n)}|${norm(p)}`;
  const annee = String(s.Annee || '');
  const ech = (D.echellePstg || []).map(e => norm(e.cle));
  for (const rp of D.rapports) {
    if (D.typePstg && rp.Type !== D.typePstg) continue;
    if (!((s.Professeur && rp.Professeur === s.Professeur) || k(rp.Prof_nom, rp.Prof_prenom) === k(s.Nom, s.Prenom))) continue;
    if (anneeDe(rp.Date_visite) !== annee) continue;
    const auteur = D.personnes.find(p => p.id === rp.Auteur);
    const ipr = auteur && auteur.Fonction === 'IA-IPR';
    /** @type {Record<string, number>} */
    const pos = {};
    for (const [code, v] of Object.entries(lirePositionnement(rp.Positionnement))) {
      const i = ech.indexOf(norm(v && v.niveau));
      if (i >= 0) pos[code.toUpperCase()] = Math.round(i * 3 / Math.max(1, ech.length - 1)) + 1;
    }
    r.push({ source: 'rapport', id: rp.id, type: ipr ? 'Visite IA-IPR' : 'Visite CMi', date: rp.Date_visite || null,
      par: auteur ? `${auteur.Prenom} ${auteur.Nom}` : '', personne: Number(rp.Auteur) || 0, avis: '', pos, dispositif: false, commentaire: '',
      statut: String(rp.Statut || '') });
  }
  return r.sort((a, b) => (a.date || 0) - (b.date || 0) || TYPES_RETOUR.indexOf(a.type) - TYPES_RETOUR.indexOf(b.type));
}
/** @param {any} d secondes Grist */
function anneeDe(d) {
  if (typeof d !== 'number' || !d) return '';
  const x = new Date(d * 1000), a = x.getUTCFullYear() - (x.getUTCMonth() < 7 ? 1 : 0);
  return `${a}-${a + 1}`;
}

// Retours rangés par colonne (IA-IPR : 1re, puis 2e et suivantes ; CMi : toutes les visites).
/** @param {Retour[]} retours @returns {Record<string, Retour[]>} */
export function parColonne(retours) {
  /** @type {Record<string, Retour[]>} */
  const c = Object.fromEntries(COLONNES.map(x => [x.cle, []]));
  const ipr = retours.filter(r => r.type === 'Visite IA-IPR');
  for (const r of retours) {
    if (r.type === 'Visite IA-IPR') c[ipr.indexOf(r) === 0 ? 'ipr1' : 'ipr2'].push(r);
    else { const col = COLONNES.find(x => x.type === r.type); if (col) c[col.cle].push(r); }
  }
  return c;
}

// Synthèse d'un retour : avis (3 couleurs) s'il est donné, sinon le niveau le plus faible des compétences prioritaires
// positionnées (toutes à défaut) ; faibles = compétences au niveau 1 ou 2.
/** @param {Retour} r @param {string[]} prio @returns {{ rang: number, n: number, couleur: string, faibles: number, vide: boolean }} */
export function synthese(r, prio) {
  const a = rangAvis(r.avis);
  const codes = Object.keys(r.pos);
  const faibles = codes.filter(k => r.pos[k] <= 2).length;
  if (a) return { rang: a, n: 3, couleur: couleur(a, 3), faibles, vide: false };
  if (!codes.length) return { rang: 0, n: 4, couleur: '', faibles: 0, vide: true };
  const vus = codes.filter(k => prio.includes(k));
  const rang = Math.min(...(vus.length ? vus : codes).map(k => r.pos[k]));
  return { rang, n: 4, couleur: couleur(rang, 4), faibles, vide: false };
}
// Signal de la ligne : synthèse du retour le plus récent qui en a une ; 'r' (rouge), 'o' (orange), 'v' (vert) ou ''.
/** @param {Retour[]} retours @param {string[]} prio */
export function signal(retours, prio) {
  for (const r of [...retours].reverse()) {
    const x = synthese(r, prio);
    if (x.vide) continue;
    return x.rang === 1 ? 'r' : x.rang === 2 ? 'o' : 'v';
  }
  return '';
}
// Vigilance : signal rouge ou orange, ou un rouge dans l'année, ou un avis de titularisation défavorable.
/** @param {Ligne} s @param {Retour[]} retours @param {string[]} prio */
export const vigilance = (s, retours, prio) => ['r', 'o'].includes(signal(retours, prio)) || s.Avis === 'Défavorable'
  || retours.some(r => synthese(r, prio).rang === 1);

// Lignes du tableau de suivi : stagiaires à suivre de l'année, filtres (recherche, vigilance, situation, quotité).
/**
 * @param {Ligne[]} stagiaires
 * @param {{ retours: Ligne[], rapports: Ligne[], personnes: Ligne[], typePstg?: number, echellePstg?: Niveau[], params?: Record<string, any> }} D
 * @param {{ annee: string, q?: string, vigilance?: boolean, situation?: string, quotite?: string }} f
 */
export function lignesPstg(stagiaires, D, f) {
  const prio = prioritaires(D.params);
  const mots = norm(f.q || '').split(/\s+/).filter(Boolean);
  return stagiaires.filter(s => s.Annee === f.annee && s.Suivi !== 'Écarté·e')
    .map(s => { const r = retoursDe(s, D); return { s, retours: r, cases: parColonne(r), signal: signal(r, prio), vigilance: vigilance(s, r, prio) }; })
    .filter(l => (!f.vigilance || l.vigilance) && (!f.situation || l.s.Situation === f.situation) && (!f.quotite || l.s.Quotite === f.quotite)
      && mots.every(m => norm([l.s.Nom, l.s.Prenom, l.s.Etab_nom, l.s.Etab_commune, l.s.Corps, l.s.Concours, l.s.Situation].join(' ')).includes(m)))
    .sort((a, b) => String(a.s.Nom).localeCompare(String(b.s.Nom), 'fr') || String(a.s.Prenom).localeCompare(String(b.s.Prenom), 'fr'));
}

// Contrôle d'un retour saisi.
// Une visite (CMi, INSPÉ, IA-IPR) peut être seulement prévue : date ou personne, sans avis ni positionnement.
/** @param {{ Type?: string, Avis?: string, Positionnement?: Record<string, number>, Date?: any, Personne?: any, Par?: string }} r */
export function validerRetour(r) {
  if (!TYPES_RETOUR.includes(String(r.Type || ''))) return 'Type de retour inconnu.';
  if (!r.Avis && !Object.keys(r.Positionnement || {}).length) {
    if (/^Visite/.test(String(r.Type)) && (r.Date || r.Personne || String(r.Par || '').trim())) return '';
    return /^Visite/.test(String(r.Type)) ? 'Indiquer au moins la date ou qui fera la visite.' : 'Choisir un avis ou positionner au moins une compétence.';
  }
  return '';
}
// Visite prévue (pas encore d'avis ni de positionnement).
/** @param {Retour} r */
export const prevue = r => /^Visite/.test(r.type) && !r.avis && !Object.keys(r.pos).length;
// Colonne d'une case cliquée → type de retour à saisir.
/** @param {string} cle */
export const typeDeColonne = cle => (colonne(cle) || { type: '' }).type;
// Libellé d'un niveau pour une colonne (« AD », « 2 », « 2 (F) »).
/** @param {Niveau[]} echelle @param {number} rang */
export const libNiveau = (echelle, rang) => (echelle[rang - 1] ? echelle[rang - 1].cle : '');
