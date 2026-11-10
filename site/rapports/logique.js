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
// Inverse de remplirChamps : un passage du rapport devient une phrase type générique (« Mme NOM » → « {civilite} {nom} »).
/** @param {string} texte @param {{ civilite?: any, nom?: any, prenom?: any }} v */
export function generaliserPhrase(texte, v) {
  const e = (/** @type {string} */ x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mot = (/** @type {string} */ x) => new RegExp(`(?<![\\p{L}])${e(x)}(?![\\p{L}])`, 'giu');
  let t = String(texte ?? '').trim().replace(/^\s*(?:[-•*–]|\d+[.)])\s*/, '');
  const civ = String(v.civilite ?? '').trim(), nom = String(v.nom ?? '').trim(), prenom = String(v.prenom ?? '').trim();
  if (civ && nom) t = t.replace(new RegExp(`(?<![\\p{L}])${e(civ)}\\s+${e(nom)}(?![\\p{L}])`, 'giu'), '{civilite} {nom}');
  if (prenom && nom) t = t.replace(new RegExp(`(?<![\\p{L}])${e(prenom)}\\s+${e(nom)}(?![\\p{L}])`, 'giu'), '{prenom} {nom}');
  if (nom) t = t.replace(mot(nom), m => m === '{nom}' ? m : '{nom}');
  if (prenom) t = t.replace(mot(prenom), '{prenom}');
  return t;
}
// Compétence d'un passage de la rubrique des compétences : code en tête de ligne (« P3 : … », « - MD2 … »).
/** @param {string} texte @param {string[]} codes */
export function competenceDuPassage(texte, codes) {
  const m = /^\s*(?:[-•*–]\s*)?([A-Z]{1,2}\d{1,2})\b/.exec(String(texte ?? ''));
  return m && codes.includes(m[1]) ? m[1] : '';
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
// o.niveaux : { compétence : rang du niveau positionné } — une phrase d'une compétence positionnée n'est proposée que
// pour ce niveau (ou sans niveau) ; les compétences non positionnées gardent toutes leurs phrases.
/** @param {Ligne[]} phrases @param {number} rubriqueId @param {{ competence?: string, recherche?: string, moi?: number, niveaux?: Record<string, number> }} o */
export function phrasesPour(phrases, rubriqueId, o = {}) {
  const q = norm(o.recherche);
  const niv = o.niveaux || {};
  return phrases.filter(p => p.Rubrique === rubriqueId && (p.Validee === true || (o.moi && p.Auteur === o.moi))
    && (!o.competence || p.Competence === o.competence) && (!q || norm(p.Texte).includes(q))
    && (!p.Competence || !niv[p.Competence] || !Number(p.Niveau) || Number(p.Niveau) === niv[p.Competence]))
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
  if (droits.M === 'Oui') return r.Statut !== 'Transmis' || estAdmin(moi) || r.Importe === true;   // ancien rapport importé : retouches de mise en page
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
  && r.Statut === 'Validé' && r.Importe !== true;
// Importer un ancien rapport (copier-coller) : IA-IPR ou admin qui peut créer des rapports.
/** @param {DroitsTable | { C: string }} droits @param {Ligne | null | undefined} moi */
export const peutImporter = (droits, moi) => droits.C === 'Oui' && (estAdmin(moi) || estIpr(moi));
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
export const remplirMail = (modele, v) => String(modele || '').replace(/\{(etablissement|professeur|auteur|ipr|date)\}/g, (_, k) => String(v[k] ?? ''));
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

// --- Positionnement (MD, PSTG) ---

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

// --- Échanges CMi ↔ IA-IPR pendant la relecture (messagerie ouverte, rien n'est écrit dans Grist) ---
// proposition : le ou la CMi prévient l'IA-IPR que le rapport est proposé (soumis) ;
// modifications : l'IA-IPR prévient le ou la CMi des modifications, suggestions et commentaires ;
// accord : le ou la CMi répond « OK pour valider ». Seul·e l'IA-IPR valide et transmet.
// Textes : Parametres mail_proposition, mail_modifications, mail_accord ({professeur}, {etablissement}, {date},
// {auteur}, {ipr}), sinon ceux-ci.
export const MAILS_RELECTURE = {
  proposition: { vers: 'ipr', bouton: '✉ Prévenir l\'IA-IPR', objet: 'Rapport proposé en relecture – {professeur} ({date})',
    texte: 'Bonjour,\n\nJe viens de proposer le rapport de visite de {professeur} ({etablissement}, visite du {date}). Il est en relecture dans l\'application Rapports d\'inspection.\n\nBien cordialement,\n{auteur}' },
  modifications: { vers: 'cmi', bouton: '✉ Prévenir le ou la CMi', objet: 'Rapport relu – {professeur} ({date})',
    texte: 'Bonjour,\n\nJ\'ai relu le rapport de visite de {professeur} ({etablissement}, visite du {date}). Les modifications effectuées, les suggestions à valider et mes commentaires sont dans l\'application Rapports d\'inspection.\nSi tout vous convient, merci de me répondre « OK pour valider » : je finaliserai alors le rapport.\n\nBien cordialement,\n{ipr}' },
  accord: { vers: 'ipr', bouton: '✉ OK pour valider', objet: 'OK pour valider – {professeur} ({date})',
    texte: 'Bonjour,\n\nJ\'ai pris connaissance des modifications et des commentaires sur le rapport de {professeur} ({date}) : OK pour valider.\n\nBien cordialement,\n{auteur}' },
};
// Boutons d'échange proposés : CMi auteur·e d'un rapport soumis → proposition et accord ; IA-IPR qui relit (rapport
// soumis ou à reprendre) → modifications. Jamais pour un rapport rédigé par un·e IA-IPR seul·e.
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r @param {boolean} parIpr @returns {string[]} */
export function mailsRelecture(droits, moi, r, parIpr) {
  if (parIpr) return [];
  const m = [];
  if (personne(moi) && r.Auteur === personne(moi) && r.Statut === 'Soumis') m.push('proposition', 'accord');
  if (droits.M === 'Oui' && (estAdmin(moi) || (estIpr(moi) && !!personne(moi))) && ['Soumis', 'À reprendre'].includes(String(r.Statut))) m.push('modifications');
  return m;
}
// Lien mailto d'un échange : destinataire (IA-IPR valideur·e ou CMi auteur·e), objet et texte remplis ; '' sans adresse.
/** @param {keyof typeof MAILS_RELECTURE} type @param {Ligne} r @param {Ligne[]} personnes @param {Record<string, string>} params @param {Record<string, any>} v */
export function lienEchange(type, r, personnes, params, v) {
  const m = MAILS_RELECTURE[type];
  const dest = personnes.find(x => x.id === (m.vers === 'ipr' ? r.Valideur : r.Auteur));
  const a = String((dest && dest.Email) || '').trim();
  if (!a) return '';
  return lienMailto(a, [], remplirMail(m.objet, v), remplirMail(String((params && params['mail_' + type]) || '').trim() || m.texte, v));
}

// --- Positionnement : un niveau (et une phrase, MD) par compétence ---
// Rapports.Positionnement : { code : { niveau, phrase } } ; ancienne forme { code : niveau } lue aussi.
/** @param {any} json @returns {Record<string, { niveau: string, phrase: string }>} */
export function lirePositionnement(json) {
  /** @type {Record<string, { niveau: string, phrase: string }>} */
  const o = {};
  for (const [k, v] of Object.entries(lireObjet(json))) {
    o[k] = typeof v === 'string' ? { niveau: v, phrase: '' } : { niveau: String((v && v.niveau) || ''), phrase: String((v && v.phrase) || '') };
  }
  return o;
}
// Nouveau niveau choisi : la phrase devient l'illustration de ce niveau si elle est vide ou si c'est encore une
// illustration (non retouchée) ; une phrase écrite par l'auteur·e est gardée.
/** @param {any} json @param {string} code @param {{ niveau?: string, phrase?: string }} x @param {Record<string, string>} illustrations niveau → phrase */
export function positionner(json, code, x, illustrations = {}) {
  const p = lirePositionnement(json);
  const avant = p[code] || { niveau: '', phrase: '' };
  const apres = { ...avant, ...x };
  if (x.niveau !== undefined && x.phrase === undefined) {
    const brute = !avant.phrase.trim() || Object.values(illustrations).some(t => t.trim() === avant.phrase.trim());
    if (brute) apres.phrase = illustrations[x.niveau] || '';
  }
  p[code] = apres;
  return JSON.stringify(p);
}

// --- Relecture : suggestions de l'IA-IPR et commentaires, que le ou la CMi accepte ou refuse ---
// Rapports.Commentaires : { code de rubrique : { c: commentaire, s: texte suggéré, ok: commentaire traité } } ;
// ancienne forme { code : commentaire } lue aussi.
// Commentaire ancré (comme dans Word) : passage cité q (k-ième occurrence dans le texte affiché : texte suggéré s'il y en
// a un, sinon texte du rapport), commentaire c, auteur·e a, date d (AAAA-MM-JJ), identifiant i, traité ok.
/** @typedef {{ i: string, q: string, k: number, c: string, a?: string, d?: string, ok?: boolean }} NoteAncree */
/** @typedef {{ c: string, s?: string, ok?: boolean, n?: NoteAncree[] }} NoteRelecture */
/** @param {any} json @returns {Record<string, NoteRelecture>} */
export function lireRelecture(json) {
  /** @type {Record<string, NoteRelecture>} */
  const o = {};
  for (const [k, v] of Object.entries(lireObjet(json))) {
    if (typeof v === 'string') { if (v.trim()) o[k] = { c: v }; continue; }
    if (!v || typeof v !== 'object') continue;
    const n = { c: String(v.c || '') };
    if (typeof v.s === 'string') n.s = v.s;
    if (v.ok) n.ok = true;
    const notes = Array.isArray(v.n) ? v.n.filter(x => x && typeof x === 'object' && String(x.q || '') && String(x.c || '').trim())
      .map(x => /** @type {NoteAncree} */ ({ i: String(x.i || ''), q: String(x.q), k: Number(x.k) || 0, c: String(x.c), ...(x.a ? { a: String(x.a) } : {}),
        ...(x.d ? { d: String(x.d) } : {}), ...(x.ok ? { ok: true } : {}) })) : [];
    if (notes.length) n.n = notes;
    o[k] = n;
  }
  return o;
}
// Enregistrement : entrées vides retirées.
/** @param {Record<string, NoteRelecture>} rel */
export function ecrireRelecture(rel) {
  /** @type {Record<string, NoteRelecture>} */
  const o = {};
  for (const [k, v] of Object.entries(rel)) {
    const n = /** @type {NoteRelecture} */ ({ c: String(v.c || '') });
    if (typeof v.s === 'string') n.s = v.s;
    if (v.ok && n.c.trim()) n.ok = true;
    if (v.n && v.n.length) n.n = v.n;
    if (n.c.trim() || typeof n.s === 'string' || n.n) o[k] = n;
  }
  return Object.keys(o).length ? JSON.stringify(o) : '';
}
// Suggestion saisie par l'IA-IPR pour une rubrique : identique au texte du rapport = pas de suggestion.
/** @param {any} json @param {string} code @param {string} texte @param {string} actuel */
export function suggerer(json, code, texte, actuel) {
  const rel = lireRelecture(json);
  const n = rel[code] || { c: '' };
  if (texte === actuel) delete n.s; else n.s = texte;
  rel[code] = n;
  return ecrireRelecture(rel);
}
/** @param {any} json @param {string} code @param {string} commentaire */
export function commenter(json, code, commentaire) {
  const rel = lireRelecture(json);
  const n = rel[code] || { c: '' };
  n.c = commentaire;
  if (!commentaire.trim()) delete n.ok;
  rel[code] = n;
  return ecrireRelecture(rel);
}
// Accepter (le texte suggéré remplace celui de la rubrique) ou refuser une suggestion ; marquer un commentaire traité.
/** @param {any} contenuJson @param {any} relJson @param {string} code @param {boolean} accepter @returns {{ Contenu: string, Commentaires: string }} */
export function trancher(contenuJson, relJson, code, accepter) {
  const contenu = lireObjet(contenuJson), rel = lireRelecture(relJson);
  const n = rel[code];
  if (n && typeof n.s === 'string') { if (accepter) contenu[code] = n.s; delete n.s; }
  return { Contenu: JSON.stringify(contenu), Commentaires: ecrireRelecture(rel) };
}
/** @param {any} relJson @param {string} code @param {boolean} ok */
export function traiter(relJson, code, ok) {
  const rel = lireRelecture(relJson);
  if (rel[code]) rel[code].ok = ok;
  return ecrireRelecture(rel);
}
// À la validation par l'IA-IPR : les suggestions encore en attente sont appliquées (le rapport validé est celui relu).
/** @param {any} contenuJson @param {any} relJson @returns {{ Contenu: string, Commentaires: string, appliquees: number }} */
export function appliquerSuggestions(contenuJson, relJson) {
  const contenu = lireObjet(contenuJson), rel = lireRelecture(relJson);
  let appliquees = 0;
  for (const [k, n] of Object.entries(rel)) if (typeof n.s === 'string') { contenu[k] = n.s; delete n.s; appliquees++; }
  return { Contenu: JSON.stringify(contenu), Commentaires: ecrireRelecture(rel), appliquees };
}
// Suggestions en attente et commentaires non traités (bandeau de la fiche).
/** @param {any} relJson */
export function bilanRelecture(relJson) {
  const rel = Object.values(lireRelecture(relJson));
  const notes = rel.flatMap(n => n.n || []);
  return { suggestions: rel.filter(n => typeof n.s === 'string').length,
    commentaires: rel.filter(n => n.c.trim() && !n.ok).length + notes.filter(x => !x.ok).length,
    traites: rel.filter(n => n.c.trim() && n.ok).length + notes.filter(x => x.ok).length };
}
// Le ou la CMi auteur·e répond à la relecture (accepte, refuse, marque traité) : rapport soumis ou à reprendre.
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} r */
export const peutRepondre = (droits, moi, r) => droits.M !== 'Non' && !!personne(moi) && r.Auteur === personne(moi)
  && ['Soumis', 'À reprendre'].includes(String(r.Statut));

// Différence mot à mot (plus longue sous-suite commune) : segments '=' gardés, '+' ajoutés, '-' retirés. Au-delà de
// 3 millions de comparaisons, tout le texte est donné comme remplacé.
/** @param {string} a @param {string} b @returns {{ t: '=' | '+' | '-', x: string }[]} */
export function diffMots(a, b) {
  const mots = (/** @type {string} */ t) => String(t || '').split(/(\s+|[.,;:!?«»()…])/).filter(x => x !== '');   // mots, espaces, ponctuation
  const A = mots(a), B = mots(b);
  /** @type {{ t: '=' | '+' | '-', x: string }[]} */
  const out = [];
  const pousser = (/** @type {'=' | '+' | '-'} */ t, /** @type {string} */ x) => {
    const d = out[out.length - 1];
    if (d && d.t === t) d.x += x; else out.push({ t, x });
  };
  if (A.length * B.length > 3e6) { if (a) pousser('-', a); if (b) pousser('+', b); return out; }
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { pousser('=', A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) pousser('-', A[i++]);
    else pousser('+', B[j++]);
  }
  while (i < n) pousser('-', A[i++]);
  while (j < m) pousser('+', B[j++]);
  return out;
}

// --- Grilles de positionnement (MD : 3 compétences ; PSTG : P1 à P5 sur 4 niveaux) ---
const parOrdre = (/** @type {Ligne} */ a, /** @type {Ligne} */ b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0);
// Compétences d'un type de rapport : celles dont Competences_MD.Types contient ce type ; une grille sans colonne Types
// (ou sans type coché) reste celle des MD.
/** @param {Ligne | undefined} type @param {Ligne[]} competences */
export function grillePour(type, competences) {
  if (!type) return [];
  const avec = competences.filter(k => liste(k.Types).includes(type.id));
  if (avec.length) return [...avec].sort(parOrdre);
  return String(type.Code || '').toUpperCase() === 'MD' ? competences.filter(k => !liste(k.Types).length).sort(parOrdre) : [];
}
// Échelle d'un type : Types_rapport.Echelle, un niveau par ligne « Niveau : description » ; sinon Parametres.echelle_md.
/** @param {Ligne | undefined} type @param {Record<string, string>} params @returns {{ cle: string, desc: string }[]} */
export function echellePour(type, params) {
  const lignes = String((type && type.Echelle) || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (lignes.length) return lignes.map(l => { const m = /^([^:]{1,30}?)\s*:\s*(.*)$/.exec(l); return m ? { cle: m[1].trim(), desc: m[2].trim() } : { cle: l, desc: '' }; });
  return niveauxMd(params && params.echelle_md).map(cle => ({ cle, desc: '' }));
}
// Couleur d'un niveau (rang 1 = le plus faible) : quatre niveaux (PSTG) rouge, orange, vert clair, vert vif ;
// trois niveaux (MD) rouge, orange, vert vif.
const COULEURS_NIVEAUX = ['#dc2626', '#f59e0b', '#86efac', '#16a34a'];
/** @param {number} rang @param {number} n nombre de niveaux */
export function couleurNiveau(rang, n) {
  if (!rang || !n || rang > n) return '';
  if (n === 1) return COULEURS_NIVEAUX[3];
  if (n === 3) return COULEURS_NIVEAUX[[0, 1, 3][rang - 1]];
  return COULEURS_NIVEAUX[Math.round((rang - 1) * 3 / (n - 1))] || '';
}
// Onglet ouvert d'office : Positionnement tant que la grille du type n'est pas entièrement positionnée, sinon Rédaction.
/** @param {Ligne | undefined} type @param {Ligne[]} competences @param {any} json */
export function ongletParDefaut(type, competences, json) {
  if (!type || !type.Positionnement) return 'redaction';
  const grille = grillePour(type, competences);
  if (!grille.length) return 'redaction';
  const p = lirePositionnement(json);
  return grille.every(k => p[String(k.Code)] && p[String(k.Code)].niveau) ? 'redaction' : 'md';
}
// Rang (1…n) du niveau positionné pour chaque compétence : { code : rang }.
/** @param {any} json @param {{ cle: string }[]} echelle */
export function rangsPositionnement(json, echelle) {
  /** @type {Record<string, number>} */
  const r = {};
  for (const [code, x] of Object.entries(lirePositionnement(json))) {
    const i = echelle.findIndex(e => norm(e.cle) === norm(x.niveau));
    if (i >= 0) r[code] = i + 1;
  }
  return r;
}

// --- Commentaires ancrés sur un passage (relecture) ---
// Rang de l'occurrence de q qui commence à la position pos du texte (0 = première) ; -1 si q n'y est pas.
/** @param {string} texte @param {string} q @param {number} pos */
export function occurrence(texte, q, pos) {
  if (!q) return -1;
  let k = 0, i = String(texte).indexOf(q);
  while (i >= 0 && i < pos) { k++; i = texte.indexOf(q, i + 1); }
  return i === pos ? k : -1;
}
// Position du passage commenté dans le texte : k-ième occurrence, sinon la première, sinon -1 (passage modifié).
/** @param {string} texte @param {string} q @param {number} k */
export function placer(texte, q, k) {
  const t = String(texte || '');
  if (!q) return -1;
  let i = t.indexOf(q);
  for (let n = 0; n < k && i >= 0; n++) { const j = t.indexOf(q, i + 1); if (j < 0) break; i = j; }
  return i;
}
/** @param {any} json @param {string} code @param {{ q: string, k: number, c: string, a?: string, d?: string }} note @returns {{ json: string, id: string }} */
export function annoter(json, code, note) {
  const rel = lireRelecture(json);
  const n = rel[code] || { c: '' };
  const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  n.n = [...(n.n || []), { i: id, q: String(note.q), k: Number(note.k) || 0, c: String(note.c), ...(note.a ? { a: note.a } : {}), ...(note.d ? { d: note.d } : {}) }];
  rel[code] = n;
  return { json: ecrireRelecture(rel), id };
}
// Modifier (champs donnés) ou retirer (modif = null) un commentaire ancré.
/** @param {any} json @param {string} code @param {string} id @param {Partial<NoteAncree> | null} modif */
export function changerNote(json, code, id, modif) {
  const rel = lireRelecture(json);
  const n = rel[code];
  if (!n || !n.n) return ecrireRelecture(rel);
  n.n = modif === null ? n.n.filter(x => x.i !== id) : n.n.map(x => x.i === id ? { ...x, ...modif } : x);
  if (!n.n.length) delete n.n;
  for (const x of n.n || []) if (!x.ok) delete x.ok;
  return ecrireRelecture(rel);
}
const echapper = (/** @type {any} */ t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
// Vue relue d'une rubrique (aperçu, page de lecture) : différence entre le texte et la suggestion (ajouts <ins>, retraits
// <del>), passages commentés surlignés (<mark data-note>). Les positions des passages sont prises dans le texte affiché
// (suggestion s'il y en a une), qui se lit en ignorant les retraits. Renvoie aussi les notes dont le passage a disparu.
/** @param {string} texte @param {string | undefined} suggestion @param {NoteAncree[]} [notes] @returns {{ html: string, perdues: string[] }} */
export function vueRelue(texte, suggestion, notes = []) {
  const segs = typeof suggestion === 'string' ? diffMots(texte || '', suggestion) : [{ t: /** @type {'='} */ ('='), x: String(texte || '') }];
  const affiche = typeof suggestion === 'string' ? suggestion : String(texte || '');
  /** @type {{ a: number, b: number, i: string, ok: boolean }[]} */
  const zones = [];
  const perdues = [];
  for (const n of notes) {
    const p = placer(affiche, n.q, n.k);
    if (p < 0) perdues.push(n.i); else zones.push({ a: p, b: p + n.q.length, i: n.i, ok: !!n.ok });
  }
  // Position (dans le texte affiché) de chaque caractère gardé ou ajouté ; les retraits n'avancent pas.
  let pos = 0;
  const morceaux = [];
  for (const sg of segs) {
    if (sg.t === '-') { morceaux.push(`<del>${echapper(sg.x)}</del>`); continue; }
    // découper le segment aux bornes des zones commentées
    let i = 0;
    while (i < sg.x.length) {
      const p = pos + i;
      const dedans = zones.filter(z => z.a <= p && p < z.b);
      const bornes = zones.flatMap(z => [z.a, z.b]).filter(x => x > p && x < pos + sg.x.length);
      const fin = (bornes.length ? Math.min(...bornes) : pos + sg.x.length) - pos;
      let h = echapper(sg.x.slice(i, fin));
      if (sg.t === '+') h = `<ins>${h}</ins>`;
      if (dedans.length) { const z = dedans[dedans.length - 1]; h = `<mark data-note="${echapper(z.i)}"${z.ok ? ' class="ok"' : ''}>${h}</mark>`; }
      morceaux.push(h);
      i = fin;
    }
    pos += sg.x.length;
  }
  return { html: morceaux.join(''), perdues };
}

