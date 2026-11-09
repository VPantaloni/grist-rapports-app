// @ts-check
// Logique pure de la liste des stagiaires (Suivis → Suivi PSTG ; statut affiché du Plan) : testée avec Node
// (tests/suivis-stagiaires.test.js). Tables Stagiaires (une ligne par stagiaire et par année) et Tutorats (un·e ou deux
// tuteur·trices par stagiaire). Identités recopiées du fichier des professeur·es, qui change chaque année.
import { norm } from '../commun/donnees.js';
import { trouverPersonne } from '../rapports/import.js';

/** @typedef {Record<string, any>} Ligne */

export const TABLE_STAGIAIRES = 'Stagiaires';
export const TABLE_TUTORATS = 'Tutorats';
export const CORPS = ['CERT', 'AGREG', 'PLP', 'Autre'];
export const CONCOURS = ['Externe', 'Interne', '3e voie', 'Autre'];
export const QUOTITES = ['50 %', '100 %'];
export const SUIVIS = ['À suivre', 'Écarté·e'];
export const CODES_DEFAUT = 'STG ; STR ; AIS';

// Identité comparable (nom, prénom ; accents, casse, espaces et tirets ignorés).
/** @param {any} nom @param {any} prenom */
const cle = (nom, prenom) => `${norm(nom).replace(/[\s'’-]+/g, ' ').trim()}|${norm(prenom).replace(/[\s'’-]+/g, ' ').trim()}`;

// Codes de Type_nomination désignant un·e stagiaire (Parametres.codes_stagiaires, « STG ; STR ; AIS »).
/** @param {Record<string, any>} [params] Cle → Valeur @returns {string[]} */
export const codesStagiaires = (params = {}) => String(params.codes_stagiaires || CODES_DEFAUT)
  .split(/[;,\s]+/).map(x => norm(x)).filter(Boolean);
/** @param {Ligne} p ligne de Professeurs @param {string[]} codes */
export const estStagiaire = (p, codes) => codes.includes(norm(p.Type_nomination));

// Agrégé·e interne stagiaire : déjà en poste (Type_nomination SER), repéré·e par trois colonnes du fichier : grade d'agrégé·e,
// entrée dans le grade au 1er septembre de la rentrée, accès par concours interne (Mode_acces « CONC INTER »).
/** @param {any} d date Grist (secondes) ou texte JJ/MM/AAAA, AAAA-MM-JJ @returns {{ a: number, m: number, j: number } | null} */
function jourDe(d) {
  if (typeof d === 'number' && d) { const x = new Date(d * 1000); return { a: x.getUTCFullYear(), m: x.getUTCMonth() + 1, j: x.getUTCDate() }; }
  const t = String(d || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return { a: +m[1], m: +m[2], j: +m[3] };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  return m ? { a: +m[3], m: +m[2], j: +m[1] } : null;
}
/** @param {Ligne} p ligne de Professeurs @param {number} rentree année de la rentrée (2026 pour 2026-2027) */
export function estAgregInterne(p, rentree) {
  const d = jourDe(p.Entree_grade);
  return /^agreg/.test(norm(p.Grade)) && !!d && d.a === rentree && d.m === 9 && d.j === 1 && /conc\w*\s*inter/.test(norm(p.Mode_acces));
}

// Corps proposé d'après le grade du fichier (AGREGE CLN → AGREG, CERT. CL N → CERT, PLP… → PLP).
/** @param {any} grade @returns {string} */
export function corpsDuGrade(grade) {
  const g = norm(grade);
  return /agreg/.test(g) ? 'AGREG' : /^plp|\bplp\b/.test(g) ? 'PLP' : /cert|capes/.test(g) ? 'CERT' : '';
}
// Valeurs saisies librement (CSV, tableur) ramenées aux choix des colonnes ; '' si illisible.
/** @param {any} t */
export function lireCorps(t) {
  const g = norm(t);
  if (!g) return '';
  return /agreg/.test(g) ? 'AGREG' : /plp/.test(g) ? 'PLP' : /cert|capes|capet/.test(g) ? 'CERT' : 'Autre';
}
/** @param {any} t */
export function lireConcours(t) {
  const g = norm(t);
  if (!g) return '';
  return /^ext|externe/.test(g) ? 'Externe' : /^int|interne/.test(g) ? 'Interne' : /3|troisi/.test(g) ? '3e voie' : 'Autre';
}
/** @param {any} t */
export function lireQuotite(t) {
  const g = norm(t).replace(/\s+/g, '');
  if (!g) return '';
  if (/^50|mi-?temps|^0[.,]5/.test(g)) return '50 %';
  if (/^100|plein|^1$/.test(g)) return '100 %';
  // « PU 50 », « PR 100 » (colonne « Type Stagiaire » des tableaux de suivi)
  if (/(^|\D)50(\D|$)/.test(g)) return '50 %';
  if (/(^|\D)100(\D|$)/.test(g)) return '100 %';
  return '';
}
// « NOM Prénom » (ou « Prénom NOM ») dans une seule case : les mots en capitales forment le nom.
/** @param {any} t @returns {{ nom: string, prenom: string }} */
export function separerNomPrenom(t) {
  const mots = String(t || '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return { nom: '', prenom: '' };
  const maj = (/** @type {string} */ m) => /\p{L}/u.test(m) && m === m.toUpperCase() && m !== m.toLowerCase() && !/^\p{Lu}\.?$/u.test(m);
  const nom = mots.filter(maj), prenom = mots.filter(m => !maj(m));
  if (nom.length && prenom.length) return { nom: nom.join(' '), prenom: prenom.join(' ') };
  return { nom: mots[0], prenom: mots.slice(1).join(' ') };
}

// Statut court affiché dans le plan : « AGREG int. · 100 % », « CERT · 50 % ».
const ABREV = /** @type {Record<string, string>} */ ({ Externe: 'ext.', Interne: 'int.', '3e voie': '3e voie' });
/** @param {Ligne | null | undefined} s ligne de Stagiaires */
export function statutStagiaire(s) {
  if (!s) return '';
  const corps = [s.Corps === 'Autre' ? '' : s.Corps, ABREV[s.Concours] || ''].filter(Boolean).join(' ');
  return [corps || 'Stagiaire', s.Quotite].filter(Boolean).join(' · ');
}

// Année scolaire « 2026-2027 » d'une rentrée.
/** @param {number} rentree */
export const anneeDeRentree = rentree => `${rentree}-${rentree + 1}`;

// Stagiaire déjà dans la liste de l'année (lien Professeurs ou nom + prénom).
/** @param {{ professeur?: number, nom: any, prenom: any }} x @param {Ligne[]} stagiaires @param {string} annee */
export function trouverStagiaire(x, stagiaires, annee) {
  const k = cle(x.nom, x.prenom);
  return stagiaires.find(s => s.Annee === annee && ((x.professeur && s.Professeur === x.professeur) || cle(s.Nom, s.Prenom) === k)) || null;
}

// Champs d'un·e stagiaire d'après sa ligne du fichier (identité, établissement, corps proposé).
// Agrégé·e interne (estAgregInterne) : corps AGREG, concours interne, sans tuteur·trice.
/** @param {Ligne} p @param {Ligne[]} etabs @param {string} annee */
export function ligneStagiaire(p, etabs, annee) {
  const e = etabs.find(x => String(x.UAI || '').toUpperCase() === String(p.UAI || '').toUpperCase()) || {};
  const interne = estAgregInterne(p, Number(String(annee).slice(0, 4)));
  return { Annee: annee, Professeur: p.id, Civilite: String(p.Civilite || ''), Nom: String(p.Nom || ''), Prenom: String(p.Prenom || ''),
    Email: String(p.Email || ''), UAI: String(p.UAI || ''), Etab_nom: String(e.Nom || ''), Etab_commune: String(e.Commune || ''),
    Corps: interne ? 'AGREG' : corpsDuGrade(p.Grade), Concours: interne ? 'Interne' : '', Quotite: '', Sans_tuteur: interne, Suivi: 'À suivre', Motif: '', Notes: '' };
}
// Champs d'un·e tuteur·trice d'après sa ligne du fichier (ou une saisie libre).
/** @param {Ligne | null} p @param {Ligne[]} etabs @param {{ nom?: string, prenom?: string, uai?: string }} [libre] */
export function ligneTuteur(p, etabs, libre = {}) {
  const uai = String(p ? p.UAI || '' : libre.uai || '').toUpperCase();
  const e = etabs.find(x => String(x.UAI || '').toUpperCase() === uai) || {};
  return { Professeur: p ? p.id : 0, Civilite: String(p ? p.Civilite || '' : ''), Nom: String(p ? p.Nom : libre.nom || '').trim(),
    Prenom: String(p ? p.Prenom : libre.prenom || '').trim(), Email: String(p ? p.Email || '' : ''), UAI: uai, Etab_nom: String(e.Nom || '') };
}

// Stagiaires du fichier (Type_nomination STG, STR, AIS… ou agrégé·e interne de l'année) absent·es de la liste de
// l'année : une fois par personne (plusieurs affectations possibles).
/** @param {{ stagiaires: Ligne[], profs: Ligne[], etabs: Ligne[], codes: string[], annee: string }} D */
export function stagiairesAAjouter(D) {
  const vus = new Set();
  /** @type {{ prof: Ligne, champs: Ligne }[]} */
  const r = [];
  for (const p of D.profs) {
    if (!estStagiaire(p, D.codes) && !estAgregInterne(p, Number(String(D.annee).slice(0, 4)))) continue;
    const k = cle(p.Nom, p.Prenom);
    if (vus.has(k)) continue;
    vus.add(k);
    if (trouverStagiaire({ professeur: p.id, nom: p.Nom, prenom: p.Prenom }, D.stagiaires, D.annee)) continue;
    r.push({ prof: p, champs: ligneStagiaire(p, D.etabs, D.annee) });
  }
  return r.sort((a, b) => String(a.champs.Nom).localeCompare(String(b.champs.Nom), 'fr'));
}

// Professeur·e du fichier d'après nom, prénom et UAI : même UAI d'abord ; null si absent·e ou ambigu·ë.
/** @param {{ nom?: any, prenom?: any, uai?: any }} x @param {Ligne[]} profs */
export function profDuFichier(x, profs) {
  const k = cle(x.nom, x.prenom);
  if (!norm(x.nom)) return null;
  const t = profs.filter(p => cle(p.Nom, p.Prenom) === k);
  const u = String(x.uai || '').trim().toUpperCase();
  const memeUai = t.filter(p => String(p.UAI || '').toUpperCase() === u);
  if (memeUai.length) return memeUai[0];
  // plusieurs affectations d'une même personne (même e-mail) : la première ; homonymes : ambigu
  return t.length && new Set(t.map(p => String(p.Email || p.id))).size === 1 ? t[0] : null;
}

// Tuteur·trices d'un·e stagiaire, dans l'ordre.
/** @param {Ligne[]} tutorats @param {number} id */
export const tuteursDe = (tutorats, id) => tutorats.filter(t => t.Stagiaire === id)
  .sort((a, b) => (Number(a.Ordre) || 9) - (Number(b.Ordre) || 9) || a.id - b.id);

// Visites du plan reliées à un·e stagiaire, et leurs CMi (un·e stagiaire peut être visité·e par plusieurs CMi : le ou la
// CMi est celui ou celle de chaque visite, pas du ou de la stagiaire).
/** @param {Ligne[]} visites @param {number} id */
export const visitesDe = (visites, id) => visites.filter(v => v.Stagiaire === id);
/** @param {Ligne[]} visites @param {number} id @returns {number[]} */
export const cmisDe = (visites, id) => [...new Set(visitesDe(visites, id).map(v => Number(v.CMi) || 0).filter(Boolean))];

// Liste de l'année, triée par nom ; écarté·es masqué·es sauf demande ; recherche (nom, établissement, statut, CMi des visites).
/**
 * @param {Ligne[]} stagiaires @param {{ annee: string, ecartes?: boolean, q?: string, cmi?: number }} f
 * @param {Ligne[]} [personnes] @param {Ligne[]} [visites]
 */
export function filtrerStagiaires(stagiaires, f, personnes = [], visites = []) {
  const mots = norm(f.q || '').split(/\s+/).filter(Boolean);
  const nomCmi = (/** @type {any} */ id) => { const p = personnes.find(x => x.id === id); return p ? `${p.Prenom} ${p.Nom}` : ''; };
  return stagiaires.filter(s => s.Annee === f.annee && (f.ecartes || s.Suivi !== 'Écarté·e') && (!f.cmi || cmisDe(visites, s.id).includes(f.cmi))
    && mots.every(m => norm([s.Nom, s.Prenom, s.Etab_nom, s.Etab_commune, s.UAI, ...cmisDe(visites, s.id).map(nomCmi), statutStagiaire(s)].join(' ')).includes(m)))
    .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom), 'fr') || String(a.Prenom).localeCompare(String(b.Prenom), 'fr'));
}
// Années présentes dans la liste (plus l'année en cours), la plus récente d'abord.
/** @param {Ligne[]} stagiaires @param {string} courante */
export const anneesStagiaires = (stagiaires, courante) => [...new Set([courante, ...stagiaires.map(s => String(s.Annee || '')).filter(Boolean)])]
  .sort().reverse();

// Agrégé·es internes : jamais de tuteur·trice (case cochée ou non).
/** @param {Ligne} s */
export const sansTuteur = s => s.Sans_tuteur === true || (s.Corps === 'AGREG' && s.Concours === 'Interne');
// Agrégé·es stagiaires (externes comme internes) : visite d'un·e IA-IPR obligatoire (un·e CMi peut venir en plus).
/** @param {Ligne} s */
export const iprObligatoire = s => s.Corps === 'AGREG' && s.Suivi !== 'Écarté·e';

// Points à compléter d'un·e stagiaire suivi·e (affichés dans la liste). `ipr` : une visite d'IA-IPR est faite ou prévue
// (suivi PSTG ou rapport d'un·e IA-IPR).
/** @param {Ligne} s @param {Ligne[]} tuteurs @param {Ligne[]} [visites] ses visites au plan @param {{ ipr?: boolean }} [o] */
export function manques(s, tuteurs, visites = [], o = {}) {
  if (s.Suivi === 'Écarté·e') return [];
  const m = [];
  if (!s.Corps) m.push('corps');
  if (!s.Concours) m.push('concours');
  if (!s.Quotite) m.push('quotité');
  if (!sansTuteur(s) && !tuteurs.length) m.push('tuteur·trice');
  if (!visites.length && !o.ipr) m.push('visite au plan');
  if (iprObligatoire(s) && !o.ipr) m.push('visite IA-IPR (agrégé·e)');
  return m;
}

// Colonnes saisies d'une fiche, seules écrites à l'enregistrement : une ligne lue de Grist contient aussi des colonnes
// calculées (Libelle, gristHelper_Display… des références) que Grist refuse d'écrire.
export const COLONNES_STAGIAIRE = ['Annee', 'Professeur', 'Civilite', 'Nom', 'Prenom', 'Email', 'UAI', 'Etab_nom', 'Etab_commune',
  'Corps', 'Concours', 'Quotite', 'Sans_tuteur', 'Situation', 'Suivi', 'Motif', 'Notes'];
/** @param {Ligne} x @returns {Ligne} */
export const champsStagiaire = x => Object.fromEntries(COLONNES_STAGIAIRE.filter(c => c in x).map(c => [c, x[c] ?? (c === 'Professeur' ? 0 : '')]));
// Contrôle d'une fiche.
/** @param {Ligne} s */
export function validerStagiaire(s) {
  if (!String(s.Nom || '').trim()) return 'Le nom est obligatoire.';
  if (!/^\d{4}-\d{4}$/.test(String(s.Annee || '')) || Number(s.Annee.slice(5)) !== Number(s.Annee.slice(0, 4)) + 1) return 'Année scolaire attendue (ex. 2026-2027).';
  if (s.Suivi === 'Écarté·e' && !String(s.Motif || '').trim()) return 'Indiquer le motif pour un·e stagiaire écarté·e.';
  return '';
}

// --- Fichier CSV minimal à compléter par les collègues, puis à reverser ---
export const COLONNES_CSV = ['Nom', 'Prénom', 'UAI', 'Corps', 'Concours', 'Quotité', 'Tuteur·trice 1 nom', 'Tuteur·trice 1 prénom',
  'Tuteur·trice 1 UAI', 'Tuteur·trice 2 nom', 'Tuteur·trice 2 prénom', 'Tuteur·trice 2 UAI', 'CMi des visites', 'Notes'];
// Modèle : en-têtes, une ligne d'exemple, et les stagiaires déjà connu·es de l'année (pour compléter plutôt que ressaisir).
// Colonne « CMi des visites » : un·e ou plusieurs CMi (« Prénom NOM », séparé·es par « / ») ; à l'import, une visite au
// plan est créée pour chaque CMi qui n'en a pas encore avec ce ou cette stagiaire.
/** @param {Ligne[]} stagiaires de l'année @param {Ligne[]} tutorats @param {Ligne[]} personnes @param {Ligne[]} [visites] */
export function csvModele(stagiaires = [], tutorats = [], personnes = [], visites = []) {
  const champ = (/** @type {any} */ v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lignes = stagiaires.length ? stagiaires.map(s => {
    const t = tuteursDe(tutorats, s.id);
    const c = cmisDe(visites, s.id).map(id => personnes.find(x => x.id === id)).filter(Boolean).map(p => `${p.Prenom} ${p.Nom}`).join(' / ');
    const tu = (/** @type {number} */ i) => (t[i] ? [t[i].Nom, t[i].Prenom, t[i].UAI] : ['', '', '']);
    return [s.Nom, s.Prenom, s.UAI, s.Corps, s.Concours, s.Quotite, ...tu(0), ...tu(1), c, s.Notes];
  }) : [['NOM', 'Prénom', '0450000A', 'CERT', 'Externe', '50 %', 'NOM', 'Prénom', '0450000A', '', '', '', 'Prénom NOM / Prénom NOM', '']];
  return '\ufeff' + [COLONNES_CSV, ...lignes].map(l => l.map(champ).join(';')).join('\r\n') + '\r\n';
}

// Lecture du CSV reversé (ou d'un collage de tableur) : séparateur ; , ou tabulation ; en-têtes reconnus sans tenir
// compte des accents, de la casse ni du point médian.
const ENTETES = /** @type {[string, RegExp][]} */ ([
  ['t1nom', /^tut\w*1nom$|^tut\w*(?<!pre)nom$/], ['t1prenom', /^tut\w*1prenom$|^tut\w*prenom$/], ['t1uai', /^tut\w*1(uai|rne)$|^tut\w*(uai|rne)$/],
  ['t2nom', /^tut\w*2nom$|^cotut\w*(?<!pre)nom$/], ['t2prenom', /^tut\w*2prenom$|^cotut\w*prenom$/], ['t2uai', /^tut\w*2(uai|rne)$|^cotut\w*(uai|rne)$/],
  // tableaux de suivi : « Tuteur 1 », « Tuteur 2 » = « NOM Prénom » dans une seule case
  ['t1complet', /^tut\w*1$/], ['t2complet', /^tut\w*2$|^cotut\w*$/],
  ['nom', /^nom$/], ['prenom', /^prenom$/], ['uai', /^(uai|rne)$/], ['corps', /^corps$/], ['concours', /^concours$/],
  ['quotite', /^(quotite|typestagiaire)$/], ['cmi', /^cmi|^chargee?demission/], ['notes', /^notes?$/],
  ['email', /^(e?mail|mel|courriel)/], ['civilite', /^(civilite|genre)$/], ['abandon', /^abandon$/],
]);
/** @param {string} ligne @param {string} sep */
function cases(ligne, sep) {
  /** @type {string[]} */
  const r = [];
  let c = '', q = false;
  for (let i = 0; i < ligne.length; i++) {
    const x = ligne[i];
    if (q) { if (x === '"' && ligne[i + 1] === '"') { c += '"'; i++; } else if (x === '"') q = false; else c += x; }
    else if (x === '"') q = true;
    else if (x === sep) { r.push(c); c = ''; }
    else c += x;
  }
  r.push(c);
  return r.map(x => x.trim());
}
/**
 * @param {string} texte
 * @returns {{ lignes: { n: number, nom: string, prenom: string, uai: string, corps: string, concours: string, quotite: string,
 *   email: string, civilite: string, tuteurs: { nom: string, prenom: string, uai: string }[], cmi: string, notes: string, alertes: string[] }[],
 *   erreur: string }}
 */
export function lireCsvStagiaires(texte) {
  const brutes = String(texte || '').replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
  if (!brutes.length) return { lignes: [], erreur: 'Fichier vide.' };
  const sep = ['\t', ';', ','].map(s => [s, brutes[0].split(s).length]).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
  const entete = cases(brutes[0], String(sep)).map(h => norm(h).replace(/[^a-z0-9]/g, ''));
  /** @type {Record<string, number>} */
  const col = {};
  entete.forEach((h, i) => { const e = ENTETES.find(([k, re]) => !(k in col) && re.test(h)); if (e) col[e[0]] = i; });
  if (!('nom' in col)) return { lignes: [], erreur: 'Colonne « Nom » introuvable : utiliser le modèle à télécharger.' };
  const lignes = brutes.slice(1).map((l, i) => {
    const c = cases(l, String(sep));
    const v = (/** @type {string} */ k) => (k in col ? String(c[col[k]] || '').trim() : '');
    const alertes = [];
    const corps = lireCorps(v('corps')), concours = lireConcours(v('concours')), quotite = lireQuotite(v('quotite'));
    if (v('quotite') && !quotite) alertes.push(`quotité « ${v('quotite')} » illisible (50 % ou 100 %)`);
    const tuteurs = [1, 2].map(n => ({ ...(v(`t${n}nom`) ? { nom: v(`t${n}nom`), prenom: v(`t${n}prenom`) } : separerNomPrenom(v(`t${n}complet`))),
      uai: v(`t${n}uai`).toUpperCase() })).filter(t => t.nom && !/^[-–—?x0]$/i.test(t.nom));
    const abandon = v('abandon');
    if (abandon && !/^(non|n|0|faux|false|-)$/i.test(abandon)) alertes.push(`abandon signalé (« ${abandon} ») : à écarter ?`);
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email')) ? v('email') : '';
    const civ = norm(v('civilite')).replace(/\./g, '');
    const civilite = /^(m|mr|monsieur|h|homme)$/.test(civ) ? 'M.' : /^(mme|mm|madame|f|femme)$/.test(civ) ? 'Mme' : '';
    return { n: i + 2, nom: v('nom'), prenom: v('prenom'), uai: v('uai').toUpperCase(), corps, concours, quotite, email, civilite, tuteurs, cmi: v('cmi'),
      notes: v('notes'), alertes };
  }).filter(l => l.nom && !/^nom$/i.test(l.nom));
  return { lignes, erreur: '' };
}

// Préparation de l'import : stagiaires à créer ou à compléter (cases vides seulement), tuteur·trices à ajouter, visites
// au plan à créer (une par CMi de la colonne « CMi des visites » qui n'a pas déjà une visite avec ce ou cette stagiaire).
/**
 * @param {ReturnType<typeof lireCsvStagiaires>['lignes']} lignes
 * @param {{ stagiaires: Ligne[], tutorats: Ligne[], profs: Ligne[], etabs: Ligne[], personnes: Ligne[], annee: string, visites?: Ligne[] }} D
 */
export function preparerImportStagiaires(lignes, D) {
  const vues = new Set();
  return lignes.map(l => {
    const alertes = [...l.alertes];
    const prof = profDuFichier(l, D.profs);
    if (!prof) alertes.push('absent·e du fichier des professeur·es : identité recopiée telle quelle');
    const existant = trouverStagiaire({ professeur: prof ? prof.id : 0, nom: l.nom, prenom: l.prenom }, D.stagiaires, D.annee);
    const k = cle(l.nom, l.prenom);
    if (vues.has(k)) return { n: l.n, libelle: `${l.nom} ${l.prenom}`, ignoree: 'en double dans le fichier', alertes, id: 0, champs: null, tuteurs: [], cmis: [] };
    vues.add(k);
    /** @type {number[]} */
    const cmis = [];
    for (const nom of String(l.cmi || '').split(/\s*[\/;+&]\s*|\s+et\s+/i).map(x => x.trim()).filter(Boolean)) {
      const p = trouverPersonne(nom, D.personnes);
      if (!p) alertes.push(`CMi « ${nom} » introuvable dans l'annuaire`);
      else if (!cmis.includes(p.id) && !(existant && cmisDe(D.visites || [], existant.id).includes(p.id))) cmis.push(p.id);
    }
    const base = prof ? ligneStagiaire(prof, D.etabs, D.annee) : { ...ligneStagiaire({ id: 0, Nom: l.nom, Prenom: l.prenom, UAI: l.uai }, D.etabs, D.annee) };
    const interne = (l.corps || (existant && existant.Corps) || base.Corps) === 'AGREG' && (l.concours || (existant && existant.Concours) || base.Concours) === 'Interne';
    const saisis = /** @type {Ligne} */ ({ Corps: l.corps, Concours: l.concours, Quotite: l.quotite, Notes: l.notes, Email: l.email, Civilite: l.civilite,
      Sans_tuteur: interne });
    /** @type {Ligne | null} */
    let champs;
    if (existant) {   // compléter seulement les cases vides : rien de ce qui a été saisi dans l'application n'est écrasé
      champs = {};
      for (const [c, v] of Object.entries(saisis)) if (v && !existant[c]) champs[c] = v;
      if (!existant.Professeur && prof) champs.Professeur = prof.id;
    } else {
      champs = { ...base };
      for (const [c, v] of Object.entries(saisis)) if (v) champs[c] = v;
    }
    const deja = existant ? tuteursDe(D.tutorats, existant.id) : [];
    const tuteurs = l.tuteurs.filter(t => !deja.some(d => cle(d.Nom, d.Prenom) === cle(t.nom, t.prenom))).map((t, i) => {
      const p = profDuFichier(t, D.profs);
      if (!p) alertes.push(`tuteur·trice ${t.nom} ${t.prenom} absent·e du fichier : identité recopiée`);
      return { ...ligneTuteur(p, D.etabs, t), Ordre: deja.length + i + 1 };
    });
    if (existant && !Object.keys(champs).length && !tuteurs.length && !cmis.length) return { n: l.n, libelle: `${l.nom} ${l.prenom}`, ignoree: 'déjà à jour', alertes, id: existant.id, champs: null, tuteurs: [], cmis: [] };
    if (tuteurs.length && interne) alertes.push('agrégé·e interne : pas de tuteur·trice en principe');
    else if (tuteurs.length && (existant ? existant.Sans_tuteur : false)) alertes.push('marqué·e « sans tuteur·trice » : case à revoir');
    return { n: l.n, libelle: `${l.nom} ${l.prenom}`, ignoree: '', alertes, id: existant ? existant.id : 0, champs, tuteurs, cmis };
  });
}

// Visites du plan déjà saisies (avant la liste des stagiaires) à relier à leur stagiaire : visite sans lien, de la même
// année scolaire (début de période ou date calée ; sans date : gardée), même professeur·e ou mêmes nom et prénom.
/** @param {Ligne[]} stagiaires @param {Ligne[]} visites @param {string} annee @returns {{ visite: Ligne, stagiaire: Ligne }[]} */
export function visitesARelier(stagiaires, visites, annee) {
  const liste = stagiaires.filter(s => s.Annee === annee);
  /** @type {{ visite: Ligne, stagiaire: Ligne }[]} */
  const r = [];
  for (const v of visites) {
    if (v.Stagiaire) continue;
    const d = v.Mois_debut || v.Date_prevue;
    if (typeof d === 'number' && d) { const x = new Date(d * 1000), a = x.getUTCFullYear() - (x.getUTCMonth() < 7 ? 1 : 0); if (`${a}-${a + 1}` !== annee) continue; }
    const s = liste.find(y => (v.Professeur && y.Professeur === v.Professeur) || cle(y.Nom, y.Prenom) === cle(v.Prof_nom, v.Prof_prenom));
    if (s) r.push({ visite: v, stagiaire: s });
  }
  return r;
}
// Cases vides d'un·e stagiaire complétées d'après l'ancien statut libre du plan (« AGREG int 50% », « CAPES 100 % »).
/** @param {Ligne} st ligne de Stagiaires @param {any} statutPlan @returns {Ligne} champs à écrire (cases vides seulement) */
export function completerDepuisPlan(st, statutPlan) {
  const t = String(statutPlan || '');
  if (!t.trim()) return {};
  const n = norm(t);
  /** @type {Ligne} */
  const c = {};
  const corps = /agreg/.test(n) ? 'AGREG' : /plp/.test(n) ? 'PLP' : /capes|cert/.test(n) ? 'CERT' : '';
  const concours = /\bint(erne)?\b/.test(n) ? 'Interne' : /\bext(erne)?\b/.test(n) ? 'Externe' : /3e|troisi/.test(n) ? '3e voie' : '';
  const quotite = /\b50\s*%?/.test(n) ? '50 %' : /\b100\s*%?/.test(n) ? '100 %' : '';
  if (corps && !st.Corps) c.Corps = corps;
  if (concours && !st.Concours) c.Concours = concours;
  if (quotite && !st.Quotite) c.Quotite = quotite;
  return c;
}
// Stagiaires de l'année à suivre sans aucune visite au plan (ni reliée, ni à relier) ni visite IA-IPR prévue.
// Une visite d'IA-IPR notée dans le suivi PSTG (Retours_PSTG, hors plan des CMi) compte aussi.
/** @param {Ligne[]} stagiaires @param {Ligne[]} visites @param {string} annee @param {Ligne[]} [retours] lignes de Retours_PSTG */
export const sansVisite = (stagiaires, visites, annee, retours = []) => stagiaires
  .filter(s => s.Annee === annee && s.Suivi !== 'Écarté·e' && !visites.some(v => v.Stagiaire === s.id)
    && !visitesARelier([s], visites, annee).length && !retours.some(r => r.Stagiaire === s.id && /^Visite/.test(String(r.Type || ''))))
  .sort((a, b) => String(a.Nom).localeCompare(String(b.Nom), 'fr'));
// Visite au plan pour un·e stagiaire et un·e CMi (période à caler dans l'écran Plan).
/** @param {Ligne} s @param {number} cmi */
export const visitePour = (s, cmi) => ({ Professeur: Number(s.Professeur) || 0, Prof_nom: String(s.Nom || ''), Prof_prenom: String(s.Prenom || ''),
  UAI: String(s.UAI || ''), Etab_nom: String(s.Etab_nom || ''), Stagiaire: s.id, Statut_plan: '', CMi: cmi, Notes: '' });

// Droits de l'onglet (Stagiaires et Tutorats, lettres L C M S de droitsTable).
/** @param {Record<string, string>} dS @param {Record<string, string>} dT */
export const droitsStagiaires = (dS, dT) => ({ voir: dS.L !== 'Non', ajouter: dS.C === 'Oui', modifier: dS.M === 'Oui', supprimer: dS.S === 'Oui',
  tuteurs: dT.C === 'Oui' && dT.M === 'Oui', retirerTuteur: dT.S === 'Oui' });
