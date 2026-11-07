// @ts-check
// Logique pure de l'écran Rapports (sans DOM ni grist) : testée avec Node (tests/rapports.test.js).
// Spécification : specifications/ecrans/rapports.md ; droits : APP § 8 (mêmes conditions que les règles d'accès).
import { liste, norm } from '../commun/donnees.js';

export const TABLE = 'Rapports';
export const STATUTS = ['Brouillon', 'Soumis', 'À reprendre', 'Validé', 'Transmis'];
// Statuts où le ou la CMi rédige encore (portée « Limité » de Rapports:M).
export const STATUTS_REDACTION = ['Brouillon', 'À reprendre'];

// --- Type et en-tête ---

// Type proposé d'office (APP § 11) : grade MD1 → MD ; Type_nomination STG → PSTG ; sinon CLASSIQUE.
/** @param {{ Grade?: any, Type_nomination?: any } | null | undefined} prof @returns {'MD' | 'PSTG' | 'CLASSIQUE'} */
export function typePropose(prof) {
  if (!prof) return 'CLASSIQUE';
  if (norm(prof.Grade).replace(/\s/g, '') === 'md1') return 'MD';
  if (norm(prof.Type_nomination) === 'stg') return 'PSTG';
  return 'CLASSIQUE';
}
// PSTG choisi pour un·e professeur·e qui n'est pas STG : alerte Siiprien.
/** @param {string} codeType @param {{ Type_nomination?: any } | null | undefined} prof */
export const pstgHorsListe = (codeType, prof) => codeType === 'PSTG' && norm(prof && prof.Type_nomination) !== 'stg';

// « CERT. CL N · Titulaire · échelon 7 » (APP § 11 : Grade + Statut + échelon).
/** @param {{ Grade?: any, Statut?: any, Echelon?: any }} p */
export function statutAffiche(p) {
  const ech = p.Echelon === 0 || p.Echelon ? `échelon ${p.Echelon}` : '';
  return [p.Grade, p.Statut, ech].map(x => String(x ?? '').trim()).filter(Boolean).join(' · ');
}

// Date Grist (secondes UTC à minuit) ↔ texte.
/** @param {any} s @returns {Date | null} */
export const dateDe = s => (typeof s === 'number' && Number.isFinite(s) ? new Date(s * 1000) : null);
/** @param {any} s */
export function dateFr(s) {
  const d = dateDe(s);
  return d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '';
}
/** @param {any} s */
export function dateIso(s) {
  const d = dateDe(s);
  return d ? d.toISOString().slice(0, 10) : '';
}
/** @param {string} iso @returns {number | null} */
export function isoVersGrist(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : null;
}
/** @param {Date} [d] */
export const aujourdhuiGrist = (d = new Date()) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000;

// Année scolaire d'une date : août-décembre → « 2026-2027 », janvier-juillet → « 2025-2026 ».
/** @param {any} s */
export function anneeScolaire(s) {
  const d = dateDe(s);
  if (!d) return '';
  const a = d.getUTCFullYear();
  return d.getUTCMonth() >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}

// Nom du PDF : AAAA_MM_JJ_NOM_Prenom_XX (XX = initiales du ou de la CMi), sans accent ni espace.
/** @param {{ Date_visite?: any, Prof_nom?: any, Prof_prenom?: any }} r @param {string} initiales */
export function nomFichierPdf(r, initiales) {
  const sans = (/** @type {any} */ s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const d = dateIso(r.Date_visite).replace(/-/g, '_') || 'AAAA_MM_JJ';
  return [d, sans(r.Prof_nom).toUpperCase(), sans(r.Prof_prenom), sans(initiales).toUpperCase()].filter(Boolean).join('_');
}

// --- Rubriques ---

/** @typedef {{ code: string, titre: string, forme: string, imprimee: boolean, titreImprime?: boolean }} RubriqueFigee */

// Rubriques d'un type de rapport, dans l'ordre.
/** @param {Ligne[]} rubriques @param {number} typeId @returns {Ligne[]} */
export function rubriquesDuType(rubriques, typeId) {
  return rubriques.filter(r => liste(r.Types).includes(typeId) && String(r.Code || '').trim())
    .sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0));
}
// Structure figée à la création (Rapports.Structure).
/** @param {Ligne[]} rubriques @returns {RubriqueFigee[]} */
// Titre imprimé : case Rubriques.Titre_imprime ; si aucune rubrique ne l'a (colonne ajoutée après coup, encore vide),
// seul « Bilan par compétence » (code competences) garde son titre, comme dans le modèle.
export const structureDe = rubriques => {
  const regle = rubriques.some(r => r.Titre_imprime === true);
  return rubriques.map(r => ({ code: String(r.Code), titre: String(r.Titre || r.Code), forme: r.Forme === 'Puces' ? 'Puces' : 'Texte',
    imprimee: r.Imprimee !== false, titreImprime: regle ? r.Titre_imprime === true : String(r.Code) === 'competences' }));
};
// Titre imprimé d'une rubrique figée (rapports d'avant la colonne : seul « competences »).
/** @param {RubriqueFigee} x */
export const titreImprime = x => (typeof x.titreImprime === 'boolean' ? x.titreImprime : x.code === 'competences');
/** @param {any} json @returns {RubriqueFigee[]} */
export function lireStructure(json) {
  try { const s = JSON.parse(String(json || '[]')); return Array.isArray(s) ? s.filter(x => x && x.code) : []; } catch (e) { return []; }
}
/** @param {any} json @returns {Record<string, any>} */
export function lireObjet(json) {
  if (!json) return {};
  try { const o = JSON.parse(String(json)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}
/** @param {any} json @returns {any[]} */
export function lireListe(json) {
  try { const o = JSON.parse(String(json || '[]')); return Array.isArray(o) ? o : []; } catch (e) { return []; }
}

// Champs d'une phrase ou d'un texte de départ : {civilite}, {nom}, {prenom} ; les autres restent tels quels.
/** @param {string} texte @param {{ civilite?: any, nom?: any, prenom?: any }} v */
export function remplirChamps(texte, v) {
  const val = /** @type {Record<string, string>} */ ({ civilite: String(v.civilite ?? ''), nom: String(v.nom ?? ''), prenom: String(v.prenom ?? '') });
  return String(texte ?? '').replace(/\{(civilite|nom|prenom)\}/g, (_, k) => val[k] || `{${k}}`);
}
// Contenu de départ d'un nouveau rapport : texte de départ de chaque rubrique, champs remplis.
/** @param {Ligne[]} rubriques @param {{ civilite?: any, nom?: any, prenom?: any }} v */
export function contenuInitial(rubriques, v) {
  /** @type {Record<string, string>} */
  const c = {};
  for (const r of rubriques) if (String(r.Texte_depart || '').trim()) c[String(r.Code)] = remplirChamps(r.Texte_depart, v);
  return c;
}
// Rubriques vides (à signaler avant de soumettre).
/** @param {RubriqueFigee[]} structure @param {Record<string, any>} contenu */
export const rubriquesVides = (structure, contenu) => structure.filter(r => r.imprimee && !String(contenu[r.code] || '').trim()).map(r => r.titre);
// Phrases proposées pour une rubrique : validées (ou les siennes), filtrées par compétence et par recherche.
/** @param {Ligne[]} phrases @param {number} rubriqueId @param {{ competence?: string, recherche?: string, moi?: number }} o */
export function phrasesPour(phrases, rubriqueId, o = {}) {
  const q = norm(o.recherche);
  return phrases.filter(p => p.Rubrique === rubriqueId && (p.Validee === true || (o.moi && p.Auteur === o.moi))
    && (!o.competence || p.Competence === o.competence) && (!q || norm(p.Texte).includes(q)))
    .sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0));
}
// Insertion d'un texte à la position du curseur, avec une espace ou un saut de ligne si besoin.
/** @param {string} texte @param {number} debut @param {number} fin @param {string} ajout @returns {{ texte: string, curseur: number }} */
export function inserer(texte, debut, fin, ajout) {
  const avant = texte.slice(0, debut), apres = texte.slice(fin);
  const sep = !avant || /\s$/.test(avant) ? '' : ' ';
  const t = avant + sep + ajout + (apres && !/^\s/.test(apres) ? ' ' : '') + apres;
  return { texte: t, curseur: (avant + sep + ajout).length };
}

// --- Recherche à la création ---

// Recherche unique : professeur·e (nom, prénom) ou établissement (nom, commune, UAI). Choisir un établissement filtre
// ses professeur·es (uai). 30 résultats au plus par liste.
/**
 * @param {Ligne[]} profs @param {Ligne[]} etabs @param {string} q @param {string} [uai]
 * @returns {{ etabs: Ligne[], profs: Ligne[] }}
 */
export function rechercher(profs, etabs, q, uai = '') {
  const mots = norm(q).split(/\s+/).filter(Boolean);
  const tous = (/** @type {string} */ t) => mots.every(m => t.includes(m));
  const e = uai ? [] : mots.length ? etabs.filter(x => tous(norm([x.Nom, x.Commune, x.UAI, x.Sigle].join(' ')))) : [];
  const p = profs.filter(x => (!uai || x.UAI === uai) && (uai || mots.length) && (!mots.length || tous(norm([x.Nom, x.Prenom, x.UAI].join(' ')))));
  const tri = (/** @type {Ligne} */ a, /** @type {Ligne} */ b) => String(a.Nom || '').localeCompare(String(b.Nom || ''), 'fr');
  return { etabs: e.sort(tri).slice(0, 30), profs: p.sort((a, b) => tri(a, b) || String(a.Prenom || '').localeCompare(String(b.Prenom || ''), 'fr')).slice(0, uai ? 200 : 30) };
}

// --- Liste ---

/** @param {Ligne[]} rapports @param {{ recherche?: string, filtre?: string, moi?: number }} o */
export function grouperRapports(rapports, o = {}) {
  const q = norm(o.recherche);
  const garde = rapports.filter(r => {
    if (o.filtre === 'miens' && r.Auteur !== o.moi) return false;
    if (o.filtre === 'a-valider' && !(r.Statut === 'Soumis' && (!r.Valideur || r.Valideur === o.moi))) return false;
    return !q || norm([r.Prof_nom, r.Prof_prenom, r.Etab_nom, r.Etab_commune, r.UAI, r.Theme, r.Classe].join(' ')).includes(q);
  }).sort((a, b) => (Number(b.Date_visite) || 0) - (Number(a.Date_visite) || 0));
  return [...STATUTS, ''].map(s => ({ cle: s, titre: s || 'Sans statut',
    rapports: garde.filter(r => (STATUTS.includes(r.Statut) ? r.Statut : '') === s) })).filter(g => g.rapports.length);
}

// --- Droits (mêmes conditions que les règles d'accès, APP § 8) ---

/** @param {Ligne | null | undefined} moi */
const roles = moi => liste(moi && moi.Roles);
/** @param {Ligne | null | undefined} moi */
export const estAdmin = moi => roles(moi).includes('Administrateur·trice');
/** @param {Ligne | null | undefined} moi */
export const estIpr = moi => roles(moi).includes('IA-IPR');
/** @param {Ligne | null | undefined} moi */
const personne = moi => (moi && moi.Personne) || 0;

/** @param {DroitsTable | { C: string }} droits @param {Ligne | null | undefined} moi */
export const peutCreer = (droits, moi) => droits.C === 'Oui' || (droits.C === 'Limité' && !!personne(moi));
// Rédiger (texte, en-tête) : Modifier « Oui » tant que le rapport n'est pas transmis ; « Limité » : le sien, en
// brouillon ou à reprendre.
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r */
export function peutRediger(droits, moi, r) {
  if (droits.M === 'Oui') return r.Statut !== 'Transmis' || estAdmin(moi);
  return droits.M === 'Limité' && !!personne(moi) && r.Auteur === personne(moi) && STATUTS_REDACTION.includes(r.Statut);
}
// Rapport rédigé par un·e IA-IPR seul·e (auteur·e de fonction IA-IPR) : pas de CMi, pas de relecture ; l'auteur·e
// signe et valide directement (APP § 11, 2026-11-07).
/** @param {Ligne} r @param {Ligne[]} personnes */
export const redigeParIpr = (r, personnes) => { const a = personnes.find(x => x.id === r.Auteur); return !!a && a.Fonction === 'IA-IPR'; };
// Signer et soumettre : l'auteur·e CMi, en brouillon ou à reprendre.
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r @param {boolean} [parIpr] */
export const peutSoumettre = (droits, moi, r, parIpr = false) => !parIpr && droits.M !== 'Non' && !!personne(moi)
  && r.Auteur === personne(moi) && STATUTS_REDACTION.includes(r.Statut);
// Signer et valider directement : rapport rédigé par un·e IA-IPR, par son auteur·e, avant validation.
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r @param {boolean} parIpr */
export const peutValiderSeul = (droits, moi, r, parIpr) => parIpr && droits.M === 'Oui' && estIpr(moi) && !!personne(moi)
  && r.Auteur === personne(moi) && STATUTS_REDACTION.includes(r.Statut);
// Relire (commenter), renvoyer, signer et valider : IA-IPR (ou admin), rapport soumis.
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r */
export const peutRelire = (droits, moi, r) => droits.M === 'Oui' && (estAdmin(moi) || (estIpr(moi) && !!personne(moi)))
  && r.Statut === 'Soumis';
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r */
export const peutTransmettre = (droits, moi, r) => droits.M === 'Oui' && (estAdmin(moi) || (estIpr(moi) && r.Valideur === personne(moi)))
  && r.Statut === 'Validé';
/** @param {DroitsTable | { S: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r */
export const peutSupprimer = (droits, moi, r) => droits.S === 'Oui'
  || (droits.S === 'Limité' && !!personne(moi) && r.Auteur === personne(moi) && r.Statut === 'Brouillon');

// --- Historique ---

/** @param {any} json @param {string} qui @param {string} action @param {Date} [d] */
export function ajouterHistorique(json, qui, action, d = new Date()) {
  const h = lireListe(json);
  h.push({ date: d.toISOString().slice(0, 16).replace('T', ' '), qui, action });
  return JSON.stringify(h);
}

// --- Transmission ---

// Destinataires : secrétariat ; copie à l'IA-IPR valideur·e et au ou à la référent·e de l'auteur·e, plus les IA-IPR
// « stagiaires » pour un PSTG ; sans doublon ni adresse vide.
/** @param {Ligne} r @param {string} codeType @param {Ligne[]} personnes @param {string} secretariat */
export function destinataires(r, codeType, personnes, secretariat) {
  const p = (/** @type {number} */ id) => personnes.find(x => x.id === id);
  const auteur = p(r.Auteur);
  const cc = [p(r.Valideur), auteur && p(auteur.Referent), ...(codeType === 'PSTG' ? personnes.filter(x => x.Stagiaires === true) : [])]
    .map(x => String((x && x.Email) || '').trim()).filter(Boolean);
  const a = String(secretariat || '').trim();
  return { a, cc: [...new Set(cc)].filter(x => x.toLowerCase() !== a.toLowerCase()) };
}
// Texte d'un modèle de mail : {etablissement}, {professeur}, {auteur}, {date} remplacés.
/** @param {string} modele @param {Record<string, any>} v */
export const remplirMail = (modele, v) => String(modele || '').replace(/\{(etablissement|professeur|auteur|date)\}/g, (_, k) => String(v[k] ?? ''));
/** @param {string} a @param {string[]} cc @param {string} objet @param {string} corps */
export function lienMailto(a, cc, objet, corps) {
  const p = [cc.length ? `cc=${encodeURIComponent(cc.join(','))}` : '', `subject=${encodeURIComponent(objet)}`, `body=${encodeURIComponent(corps)}`];
  return `mailto:${encodeURIComponent(a).replace(/%40/g, '@')}?${p.filter(Boolean).join('&')}`;
}

// --- Signature : image redimensionnée (largeur et hauteur maximales), proportions gardées ---
/** @param {number} l @param {number} h @param {number} [lMax] @param {number} [hMax] */
export function tailleSignature(l, h, lMax = 480, hMax = 180) {
  const k = Math.min(1, lMax / (l || 1), hMax / (h || 1));
  return { l: Math.max(1, Math.round(l * k)), h: Math.max(1, Math.round(h * k)) };
}

// --- Positionnement MD ---

// Niveaux de l'échelle (Parametres.echelle_md, séparés par « ; »).
/** @param {any} texte */
export const niveauxMd = texte => String(texte || 'À consolider ; Satisfaisant ; Très satisfaisant').split(';').map(x => x.trim()).filter(Boolean);
// Descripteurs d'une compétence : un paragraphe par niveau, « Niveau : texte » (comparaison sans accent ni casse).
/** @param {any} texte @param {string[]} niveaux @returns {Record<string, string>} */
export function descripteurs(texte, niveaux) {
  /** @type {Record<string, string>} */
  const d = {};
  let courant = '';
  for (const ligne of String(texte || '').split(/\r?\n/)) {
    const m = /^\s*([^:]{2,40}?)\s*:\s*(.*)$/.exec(ligne);
    const n = m && niveaux.find(x => norm(x) === norm(m[1]));
    if (n && m) { courant = n; d[n] = m[2].trim(); }
    else if (courant && ligne.trim()) d[courant] += ' ' + ligne.trim();
  }
  return d;
}

// Plan d'inspection : visite du plan à relier à un rapport qui vient d'être créé. Celle demandée (« Rédiger le rapport »
// depuis le plan), sinon la première visite sans rapport du même auteur·e pour ce ou cette professeur·e.
/** @param {Ligne[]} visites @param {{ visite?: number, prof: number, auteur: number }} x @returns {Ligne | null} */
export function visiteAssociee(visites, x) {
  const v = x.visite ? visites.find(y => y.id === x.visite) : null;
  if (v) return v.Rapport ? null : v;
  return visites.find(y => !y.Rapport && y.Professeur && y.Professeur === x.prof && y.CMi === x.auteur) || null;
}
