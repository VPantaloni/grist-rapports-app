// @ts-check
// Logique pure de l'écran Suivis (sans DOM ni grist) : testée avec Node (tests/suivis.test.js).
// Spécification : specifications/ecrans/suivis.md. Suivi des maître·sses délégué·es (MD) : visite tous les trois ans,
// positionnement sur les trois compétences de la grille MD ; bilans venant des rapports MD validés ou saisis.
import { norm } from '../commun/donnees.js';
import { rentreeDe, libelleAnnee } from '../plan/logique.js';
import { couleurNiveau, lirePositionnement } from '../rapports/logique.js';

/** @typedef {Record<string, any>} Ligne */

export const TABLE = 'Maitres_delegues';
export const TABLE_BILANS = 'Bilans_MD';
export const PERIODE_ANS = 3;                 // un·e MD est visité·e tous les trois ans
export const ANNEES_PASSEES = 5;              // colonnes du tableau : 5 années précédentes + l'année en cours
export const STATUTS_FINIS = ['Validé', 'Transmis'];

// MD du fichier académique : grade (ou statut) « MD1 », « MD2 »…
/** @param {Ligne} p */
export const estMd = p => [p.Grade, p.Statut].some(x => /^MD\d*$/i.test(String(x || '').trim().replace(/\s+/g, '')));

// Identité comparable (nom, prénom ; accents, casse et espaces ignorés).
/** @param {any} nom @param {any} prenom */
export const cleIdentite = (nom, prenom) => `${norm(nom).replace(/[\s'’-]+/g, ' ')}|${norm(prenom).replace(/[\s'’-]+/g, ' ')}`;

/** @typedef {{ professeur?: number, nom: any, prenom: any, uai?: any }} Identite */
/** @param {Ligne} p ligne de Professeurs @returns {Identite} */
export const identiteProf = p => ({ professeur: p.id, nom: p.Nom, prenom: p.Prenom, uai: p.UAI });
/** @param {Ligne} r ligne de Rapports ou de Visites @returns {Identite} */
export const identiteRapport = r => ({ professeur: r.Professeur || 0, nom: r.Prof_nom, prenom: r.Prof_prenom, uai: r.UAI });

// MD suivi·e correspondant à une identité : lien Professeurs d'abord, sinon nom et prénom (+ UAI si homonymes).
/** @param {Identite} x @param {Ligne[]} mds @returns {Ligne | null} */
export function trouverMd(x, mds) {
  if (x.professeur) { const m = mds.find(m => m.Professeur && m.Professeur === x.professeur); if (m) return m; }
  const c = cleIdentite(x.nom, x.prenom);
  const memes = mds.filter(m => cleIdentite(m.Nom, m.Prenom) === c);
  if (memes.length <= 1) return memes[0] || null;
  return memes.find(m => norm(m.UAI) === norm(x.uai)) || memes[0];
}

// Fiche Maitres_delegues recopiée d'un·e professeur·e (ou d'un rapport) : identité et établissement.
/** @param {Identite & { civilite?: any }} x @param {Ligne[]} etabs @param {Ligne} [secours] établissement recopié (rapport) */
export function ligneMd(x, etabs, secours = {}) {
  const e = etabs.find(y => norm(y.UAI) === norm(x.uai)) || {};
  return { Professeur: x.professeur || null, Civilite: String(x.civilite || ''), Nom: String(x.nom || '').trim(),
    Prenom: String(x.prenom || '').trim(), UAI: String(x.uai || '').trim(), Etab_nom: e.Nom || secours.Etab_nom || '',
    Etab_commune: e.Commune || secours.Etab_commune || '', En_poste: true };
}

// MD à ajouter au suivi : MD du fichier des professeur·es (une fois par personne, même avec plusieurs affectations) et
// professeur·es de rapports MD, absent·es de Maitres_delegues.
/** @param {{ profs: Ligne[], rapports: Ligne[], mds: Ligne[], etabs: Ligne[], typeMd: number }} D @returns {{ source: string, champs: Ligne }[]} */
export function mdsAAjouter(D) {
  /** @type {{ source: string, champs: Ligne }[]} */
  const out = [];
  const vus = new Set(D.mds.map(m => cleIdentite(m.Nom, m.Prenom)));
  for (const p of D.profs.filter(estMd)) {
    const c = cleIdentite(p.Nom, p.Prenom);
    if (vus.has(c) || trouverMd(identiteProf(p), D.mds)) continue;
    vus.add(c);
    out.push({ source: 'fichier des professeur·es', champs: ligneMd({ ...identiteProf(p), civilite: p.Civilite }, D.etabs) });
  }
  for (const r of D.rapports.filter(r => r.Type === D.typeMd)) {
    const c = cleIdentite(r.Prof_nom, r.Prof_prenom);
    if (vus.has(c) || trouverMd(identiteRapport(r), D.mds)) continue;
    vus.add(c);
    out.push({ source: 'rapport MD', champs: ligneMd({ ...identiteRapport(r), civilite: r.Prof_civilite }, D.etabs, r) });
  }
  return out;
}

// Années du tableau : de rentree - n à rentree (« 2021-2022 » … « 2026-2027 »).
/** @param {number} rentree @param {number} [n] */
export const anneesSuivi = (rentree, n = ANNEES_PASSEES) => Array.from({ length: n + 1 }, (_, i) => libelleAnnee(rentree - n + i));
/** @param {any} dateGrist */
export const anneeDe = dateGrist => { const r = rentreeDe(dateGrist); return r ? libelleAnnee(r) : ''; };
/** @param {string} annee « 2024-2025 » */
export const rentreeAnnee = annee => Number(String(annee).slice(0, 4)) || 0;
// Année saisie : « 2024-2025 », « 2024/2025 », « 24-25 », « 2024 » (année de rentrée).
/** @param {any} t */
export function lireAnnee(t) {
  const m = String(t || '').trim().match(/^(\d{2}|\d{4})(?:\s*[-/–]\s*(\d{2}|\d{4}))?$/);
  if (!m) return '';
  const a = Number(m[1].length === 2 ? `20${m[1]}` : m[1]);
  if (m[2]) { const b = Number(m[2].length === 2 ? `20${m[2]}` : m[2]); if (b !== a + 1) return ''; }
  return libelleAnnee(a);
}

/** @typedef {{ source: 'rapport' | 'saisie', annee: string, positionnement: Record<string, { niveau: string, phrase: string }>, visiteur: number, date: any, rapport?: Ligne, bilan?: Ligne, saisie?: Ligne }} Case */
// Bilans du suivi, par MD puis par année : rapports MD validés ou transmis (d'office) et bilans saisis ; pour une même
// année, le rapport l'emporte (le bilan saisi reste accessible : saisie).
/** @param {{ mds: Ligne[], bilans: Ligne[], rapports: Ligne[], typeMd: number }} D @returns {Map<number, Map<string, Case>>} */
export function bilansDuSuivi(D) {
  /** @type {Map<number, Map<string, Case>>} */
  const m = new Map();
  const cases = (/** @type {number} */ id) => { if (!m.has(id)) m.set(id, new Map()); return /** @type {Map<string, Case>} */ (m.get(id)); };
  for (const b of D.bilans) {
    if (!b.MD || !b.Annee) continue;
    cases(b.MD).set(String(b.Annee), { source: 'saisie', annee: String(b.Annee), positionnement: lirePositionnement(b.Positionnement),
      visiteur: b.Visiteur || 0, date: b.Date_visite || null, bilan: b });
  }
  for (const r of D.rapports) {
    if (r.Type !== D.typeMd || !STATUTS_FINIS.includes(String(r.Statut)) || !r.Date_visite) continue;
    const md = trouverMd(identiteRapport(r), D.mds);
    if (!md) continue;
    const annee = anneeDe(r.Date_visite), c = cases(md.id), avant = c.get(annee);
    if (avant && avant.source === 'rapport' && (avant.date || 0) >= r.Date_visite) continue;   // garder le plus récent
    c.set(annee, { source: 'rapport', annee, positionnement: lirePositionnement(r.Positionnement), visiteur: r.Auteur || 0,
      date: r.Date_visite, rapport: r, ...(avant && avant.source === 'saisie' ? { saisie: avant.bilan } : avant && avant.saisie ? { saisie: avant.saisie } : {}) });
  }
  return m;
}

// Trois pastilles (une par compétence de la grille, dans l'ordre) : niveau, rang, couleur (gris si non positionné).
/** @param {Record<string, { niveau: string, phrase: string }>} pos @param {Ligne[]} grille @param {string[]} niveaux */
export const pastilles = (pos, grille, niveaux) => grille.map(k => {
  const x = pos[String(k.Code)] || { niveau: '', phrase: '' };
  const rang = niveaux.findIndex(n => norm(n) === norm(x.niveau)) + 1;
  return { code: String(k.Code), libelle: String(k.Libelle || k.Code), niveau: x.niveau, phrase: x.phrase || '', rang, couleur: rang ? couleurNiveau(rang, niveaux.length) : '' };
});

/** @param {Map<string, Case> | undefined} cases */
export const derniereAnnee = cases => [...(cases ? cases.keys() : [])].sort().pop() || '';

// MD prévu·e au plan de l'année (Visites).
/** @param {Ligne} md @param {Ligne[]} visites @param {number} rentree */
export const auPlan = (md, visites, rentree) => visites.some(v => rentreeDe(v.Mois_debut || v.Date_prevue) === rentree
  && trouverMd(identiteRapport(v), [md]) === md);

// État vis-à-vis de la règle des trois ans.
export const ETATS_MD = [
  { cle: 'a_visiter', libelle: 'À visiter' },
  { cle: 'plan', libelle: 'Prévu·e au plan' },
  { cle: 'visite', libelle: 'Visité·e cette année' },
  { cle: 'ok', libelle: 'À jour' },
];
/** @param {Map<string, Case> | undefined} cases @param {number} rentree @param {boolean} prevu @returns {{ cle: string, libelle: string, prochaine: string }} */
export function etatMd(cases, rentree, prevu) {
  const der = derniereAnnee(cases);
  const prochaine = der ? rentreeAnnee(der) + PERIODE_ANS : rentree;
  if (cases && cases.has(libelleAnnee(rentree))) return { cle: 'visite', libelle: `Visité·e en ${libelleAnnee(rentree)}`, prochaine: libelleAnnee(rentree + PERIODE_ANS) };
  if (prevu) return { cle: 'plan', libelle: 'Prévu·e au plan', prochaine: libelleAnnee(rentree) };
  if (prochaine <= rentree) return { cle: 'a_visiter', libelle: der ? `À visiter (dernière : ${der})` : 'À visiter (jamais visité·e)', prochaine: libelleAnnee(rentree) };
  return { cle: 'ok', libelle: `Prochaine : ${libelleAnnee(prochaine)}`, prochaine: libelleAnnee(prochaine) };
}

/** @typedef {{ md: Ligne, cases: Map<string, Case>, etat: { cle: string, libelle: string, prochaine: string } }} LigneSuivi */
// Lignes du tableau : MD suivi·es (anciens compris), état, triées par nom.
/** @param {{ mds: Ligne[], bilans: Ligne[], rapports: Ligne[], visites: Ligne[], typeMd: number }} D @param {number} rentree @returns {LigneSuivi[]} */
export function lignesSuivi(D, rentree) {
  const b = bilansDuSuivi(D);
  return [...D.mds].sort((x, y) => `${norm(x.Nom)} ${norm(x.Prenom)}`.localeCompare(`${norm(y.Nom)} ${norm(y.Prenom)}`))
    .map(md => { const cases = b.get(md.id) || new Map(); return { md, cases, etat: etatMd(cases, rentree, auPlan(md, D.visites, rentree)) }; });
}
/** @param {LigneSuivi[]} lignes @param {{ q?: string, etat?: string, anciens?: boolean }} f */
export function filtrerMds(lignes, f) {
  const q = norm(f.q);
  return lignes.filter(l => (f.anciens || l.md.En_poste !== false)
    && (!f.etat || l.etat.cle === f.etat)
    && (!q || norm(`${l.md.Nom} ${l.md.Prenom} ${l.md.UAI} ${l.md.Etab_nom} ${l.md.Etab_commune}`).includes(q)));
}
/** @param {LigneSuivi[]} lignes MD en poste */
export function compterEtats(lignes) {
  /** @type {Record<string, number>} */
  const n = Object.fromEntries(ETATS_MD.map(e => [e.cle, 0]));
  for (const l of lignes) if (l.md.En_poste !== false) n[l.etat.cle]++;
  return n;
}

// Contrôle avant enregistrement.
/** @param {Ligne} md */
export const validerMd = md => (!String(md.Nom || '').trim() ? 'Le nom est obligatoire.' : '');
/** @param {{ annee: string, visiteur: any, positionnement: Record<string, { niveau: string }> }} b @param {number} rentree */
export function validerBilan(b, rentree) {
  if (!b.annee) return 'Année scolaire attendue (ex. 2024-2025).';
  if (rentreeAnnee(b.annee) > rentree) return 'Année à venir : un bilan se saisit après la visite.';
  if (!Object.values(b.positionnement).some(x => x && x.niveau)) return 'Indiquer au moins un niveau.';
  return '';
}

// Droits : écran réservé aux comptes qui lisent Maitres_delegues (IA-IPR, admins).
/** @param {{ L: string, C: string, M: string, S: string }} dMd @param {{ L: string, C: string, M: string, S: string }} dBilans */
export const droitsSuivi = (dMd, dBilans) => ({ voir: dMd.L !== 'Non', ajouter: dMd.C === 'Oui', modifier: dMd.M === 'Oui', supprimer: dMd.S === 'Oui',
  saisir: dBilans.C === 'Oui', corriger: dBilans.M === 'Oui', effacer: dBilans.S === 'Oui' });
