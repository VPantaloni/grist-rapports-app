// @ts-check
// Assistant de premier démarrage (spécification ecrans/demarrage.md, APP § 11, 2026-11-21) : logique pure, testée avec
// Node (tests/demarrage.test.js). Ouvert par le conteneur tant que l'installation n'est pas terminée (app/logique.js,
// assistantAOuvrir) ; étapes : inscription de l'administrateur·trice (à la place du compte d'exemple), académie,
// discipline, établissements (open data), données d'exemple, chiffrement, fichier Siiprien, collègues.
import { identifierMoi } from '../commun/droits.js';
import { liste } from '../commun/donnees.js';
import { initialesProposees } from '../annuaire/logique.js';

/** @typedef {Record<string, any>} Ligne */

export const ETAPES = [
  { cle: 'inscription', titre: 'Votre compte' },
  { cle: 'academie', titre: 'Académie' },
  { cle: 'discipline', titre: 'Discipline' },
  { cle: 'etablissements', titre: 'Établissements' },
  { cle: 'exemples', titre: 'Données d\'exemple' },
  { cle: 'chiffrement', titre: 'Phrase de chiffrement' },
  { cle: 'siiprien', titre: 'Professeur·es (Siiprien)' },
  { cle: 'collegues', titre: 'Collègues' },
];
export const ROLE_ADMIN = 'Administrateur·trice';
const txt = (/** @type {any} */ v) => String(v ?? '').trim();
/** @param {any} email */
export const estExemple = email => /\.example$/i.test(txt(email));
/** @param {any} email */
const cle = email => txt(email).toLowerCase();

// Compte d'exemple à remplacer (« Benny B » du modèle) : compte .example administrateur·trice, de préférence relié à une
// fiche ; sinon le premier compte .example ; null s'il n'y en a pas.
/** @param {Ligne[]} utilisateurs @returns {Ligne | null} */
export function compteExemple(utilisateurs) {
  const ex = (utilisateurs || []).filter(u => estExemple(u.Email));
  const admins = ex.filter(u => liste(u.Roles).includes(ROLE_ADMIN));
  return admins.find(u => u.Personne) || admins[0] || ex[0] || null;
}

// Saisie de l'inscription : erreurs (liste vide = valide).
/** @param {{ prenom: string, nom: string, email: string }} s @returns {string[]} */
export function validerInscription(s) {
  const e = [];
  if (!txt(s.prenom)) e.push('Prénom obligatoire.');
  if (!txt(s.nom)) e.push('Nom obligatoire.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(s.email))) e.push('Adresse e-mail invalide.');
  else if (estExemple(s.email)) e.push('Indiquer votre propre adresse, celle de votre compte Grist.');
  return e;
}

// Fiche Personnes de l'administrateur·trice : celle du compte d'exemple (remplacée), ou une fiche à la même adresse,
// sinon une nouvelle. Renvoie l'action et l'id de la fiche existante (null : AddRecord, id rendu par Grist).
/**
 * @param {{ prenom: string, nom: string, email: string, ipr: boolean }} s @param {Ligne | null} compte @param {Ligne[]} personnes
 * @returns {{ id: number | null, actions: any[] }}
 */
export function actionsPersonne(s, compte, personnes) {
  const p = (compte && compte.Personne && personnes.find(x => x.id === compte.Personne))
    || personnes.find(x => cle(x.Email) === cle(s.email)) || null;
  const autres = personnes.filter(x => !p || x.id !== p.id).map(x => txt(x.Initiales).toUpperCase());
  let ini = initialesProposees(s.prenom, s.nom) || 'XX';
  for (let i = 2; autres.includes(ini); i++) ini = initialesProposees(s.prenom, s.nom) + i;
  /** @type {Record<string, any>} */
  const champs = { Prenom: txt(s.prenom), Nom: txt(s.nom), Email: cle(s.email), Initiales: ini,
    Fonction: s.ipr ? 'IA-IPR' : (p && p.Fonction) || 'IA-IPR' };
  if (s.ipr && (!p || !txt(p.Titre_signature) || estExemple(p.Email))) champs.Titre_signature = 'L\'IA-IPR';
  return p ? { id: p.id, actions: [['UpdateRecord', 'Personnes', p.id, champs]] } : { id: null, actions: [['AddRecord', 'Personnes', null, champs]] };
}

// Compte Utilisateurs : celui de même adresse s'il existe, sinon le compte d'exemple, sinon un nouveau ; rôles
// administrateur·trice (+ IA-IPR), actif, relié à la fiche.
/**
 * @param {{ email: string, ipr: boolean }} s @param {Ligne | null} compte @param {Ligne[]} utilisateurs @param {number} personne
 * @returns {any[]}
 */
export function actionsCompte(s, compte, utilisateurs, personne) {
  const u = utilisateurs.find(x => cle(x.Email) === cle(s.email)) || compte;
  const champs = { Email: cle(s.email), Roles: ['L', ROLE_ADMIN, ...(s.ipr ? ['IA-IPR'] : [])], Actif: true, Personne: personne };
  return u ? [['UpdateRecord', 'Utilisateurs', u.id, champs]] : [['AddRecord', 'Utilisateurs', null, champs]];
}

// Après l'inscription : le compte connecté est-il bien reconnu (Moi vrai sur la ligne de cette adresse) ?
// 'ok' ; 'autre-adresse' (l'adresse saisie n'est pas celle du compte Grist connecté) ; 'regles' (règles d'accès absentes).
/** @param {Ligne[]} lignes Utilisateurs relus @param {string} email @returns {'ok' | 'autre-adresse' | 'regles'} */
export function inscriptionVerifiee(lignes, email) {
  const { moi, statut } = identifierMoi(lignes);
  if (statut === 'sans-regles') return 'regles';
  return moi && cle(moi.Email_cle ?? moi.Email) === cle(email) ? 'ok' : 'autre-adresse';
}

// --- Établissements ---
/** @typedef {import('../commun/annuaire.js').FicheGeoloc} FicheGeoloc */
// Ajout ou mise à jour des établissements téléchargés (clé : UAI). Edt_absent n'est jamais touché ; e-mail et téléphone
// pris dans `complements` (Annuaire de l'éducation) s'ils y sont, sinon gardés. Seules les colonnes du document sont écrites.
/**
 * @param {FicheGeoloc[]} fiches @param {Ligne[]} existants @param {Map<string, { email?: string, telephone?: string }>} complements
 * @param {string[]} colonnes colonnes de la table Etablissements dans le document
 * @returns {{ actions: any[], ajouts: number, majs: number }}
 */
export function actionsEtablissements(fiches, existants, complements, colonnes) {
  const ont = new Set(colonnes);
  const parUai = new Map(existants.map(e => [txt(e.UAI).toUpperCase(), e]));
  /** @type {Record<string, any>[]} */
  const nouveaux = [];
  /** @type {{ id: number, champs: Record<string, any> }[]} */
  const majs = [];
  const vus = new Set();
  for (const f of fiches) {
    if (vus.has(f.uai)) continue;
    vus.add(f.uai);
    const c = complements.get(f.uai) || {};
    /** @type {Record<string, any>} */
    const v = { UAI: f.uai, Nom: f.nom, Sigle: f.sigle, Secteur: f.secteur, Adresse: f.adresse, Code_postal: f.codePostal, Commune: f.commune,
      Departement: f.departement, Lat: f.lat, Lon: f.lon, Mel: txt(c.email), Telephone: txt(c.telephone) };
    for (const k of Object.keys(v)) if (!ont.has(k) || v[k] === null || v[k] === '') delete v[k];
    const e = parUai.get(f.uai);
    if (!e) { nouveaux.push(v); continue; }
    /** @type {Record<string, any>} */
    const champs = {};
    for (const [k, x] of Object.entries(v)) if (k !== 'UAI' && String(e[k] ?? '') !== String(x)) champs[k] = x;
    if (Object.keys(champs).length) majs.push({ id: e.id, champs });
  }
  const actions = [];
  const PAQUET = 500;
  for (let i = 0; i < nouveaux.length; i += PAQUET) actions.push(enBloc('BulkAddRecord', nouveaux.slice(i, i + PAQUET).map(v => ({ id: null, champs: v }))));
  // Mises à jour regroupées par jeu de colonnes identique (une colonne absente n'est pas effacée).
  /** @type {Map<string, { id: number, champs: Record<string, any> }[]>} */
  const groupes = new Map();
  for (const m of majs) { const k = Object.keys(m.champs).sort().join(','); if (!groupes.has(k)) groupes.set(k, []); /** @type {any} */ (groupes.get(k)).push(m); }
  for (const g of groupes.values()) for (let i = 0; i < g.length; i += PAQUET) actions.push(enBloc('BulkUpdateRecord', g.slice(i, i + PAQUET)));
  return { actions, ajouts: nouveaux.length, majs: majs.length };
}
// Lignes → action groupée (colonnes réunies ; en ajout, valeur absente d'une ligne = vide ; en mise à jour, les lignes
// d'un même bloc ont les mêmes colonnes).
/** @param {string} type @param {{ id: number | null, champs: Record<string, any> }[]} lignes */
function enBloc(type, lignes) {
  const cols = [...new Set(lignes.flatMap(l => Object.keys(l.champs)))];
  if (type === 'BulkUpdateRecord') {
    return ['BulkUpdateRecord', 'Etablissements', lignes.map(l => l.id), Object.fromEntries(cols.map(c => [c, lignes.map(l => l.champs[c] ?? null)]))];
  }
  return ['BulkAddRecord', 'Etablissements', lignes.map(() => null), Object.fromEntries(cols.map(c => [c, lignes.map(l => l.champs[c] ?? null)]))];
}

// --- Données d'exemple ---
// Ordre de suppression : les lignes qui citent d'abord, les lignes citées ensuite.
export const ORDRE_SUPPRESSION = ['Retours_PSTG', 'Tutorats', 'Bilans_MD', 'EdT_memo', 'Visites', 'Rapports', 'Stagiaires',
  'Maitres_delegues', 'EDT', 'Signatures', 'Phrases', 'Professeurs', 'Utilisateurs', 'Personnes', 'Etablissements'];
const sansAccents = (/** @type {any} */ s) => txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

// Lignes d'exemple, reconnues à des marques sûres (jamais une donnée réelle) : adresses en .example, et ce qui s'y
// rattache (rapports, visites, stagiaires, tuteur·trices, retours, MD, bilans, plannings, emplois du temps des
// professeur·es d'exemple), établissement « (fictif) ». `garder` : fiche et compte de l'administrateur·trice.
/**
 * @param {Record<string, Ligne[]>} T tables lues @param {{ personne?: number, utilisateur?: number }} [garder]
 * @returns {Record<string, number[]>}
 */
export function donneesExemple(T, garder = {}) {
  const t = (/** @type {string} */ n) => T[n] || [];
  const ids = (/** @type {Ligne[]} */ l) => new Set(l.map(x => x.id));
  const pers = ids(t('Personnes').filter(p => estExemple(p.Email) && p.id !== garder.personne));
  const profsL = t('Professeurs').filter(p => estExemple(p.Email));
  const profs = ids(profsL);
  const stg = ids(t('Stagiaires').filter(s => estExemple(s.Email) || profs.has(s.Professeur)));
  const md = ids(t('Maitres_delegues').filter(m => profs.has(m.Professeur) || /\(fictif\)/i.test(txt(m.Etab_nom))));
  const rap = ids(t('Rapports').filter(r => pers.has(r.Auteur) || profs.has(r.Professeur)));
  const noms = profsL.map(p => [sansAccents(p.Nom), sansAccents(p.Prenom)]).filter(([n]) => n);
  // Emplois du temps : tout versement (même établissement, même date) qui contient un·e professeur·e d'exemple.
  const lotsEdt = new Set(t('EDT').filter(x => { const n = sansAccents(x.Nom); return typeof x.Nom === 'string' && noms.some(([a, b]) => n.includes(a) && n.includes(b)); })
    .map(x => `${x.UAI}|${x.Importe_le}`));
  /** @type {Record<string, Ligne[]>} */
  const r = {
    Retours_PSTG: t('Retours_PSTG').filter(x => stg.has(x.Stagiaire)),
    Tutorats: t('Tutorats').filter(x => stg.has(x.Stagiaire) || estExemple(x.Email)),
    Bilans_MD: t('Bilans_MD').filter(x => md.has(x.MD)),
    EdT_memo: t('EdT_memo').filter(x => pers.has(x.Auteur)),
    Visites: t('Visites').filter(x => pers.has(x.CMi) || profs.has(x.Professeur) || stg.has(x.Stagiaire) || rap.has(x.Rapport)),
    Rapports: t('Rapports').filter(x => rap.has(x.id)),
    Stagiaires: t('Stagiaires').filter(x => stg.has(x.id)),
    Maitres_delegues: t('Maitres_delegues').filter(x => md.has(x.id)),
    EDT: t('EDT').filter(x => lotsEdt.has(`${x.UAI}|${x.Importe_le}`)),
    Signatures: t('Signatures').filter(x => estExemple(x.Email)),
    // Phrases : seulement les brouillons personnels des comptes d'exemple ; la bibliothèque validée est gardée (Grist vide
    // la référence Auteur quand la fiche est supprimée).
    Phrases: t('Phrases').filter(x => pers.has(x.Auteur) && x.Validee !== true),
    Professeurs: profsL,
    Utilisateurs: t('Utilisateurs').filter(u => estExemple(u.Email) && u.id !== garder.utilisateur),
    Personnes: t('Personnes').filter(x => pers.has(x.id)),
    Etablissements: t('Etablissements').filter(x => /\(fictif\)/i.test(txt(x.Nom))),
  };
  return Object.fromEntries(ORDRE_SUPPRESSION.map(n => [n, r[n].map(x => x.id)]).filter(([, l]) => l.length));
}
/** @param {Record<string, number[]>} ex */
export const actionsSuppression = ex => ORDRE_SUPPRESSION.filter(n => (ex[n] || []).length).map(n => ['BulkRemoveRecord', n, ex[n]]);
/** @param {Record<string, number[]>} ex */
export const nombreExemples = ex => Object.values(ex).reduce((n, l) => n + l.length, 0);

// Autre discipline que les mathématiques : phrases types d'exemple (propres aux maths) à retirer, celles des
// comptes réels gardées. Discipline Mathématiques : rien.
/** @param {string} discipline @param {Ligne[]} phrases @param {Ligne[]} personnes @returns {number[]} */
export function phrasesAVider(discipline, phrases, personnes) {
  if (/^math/i.test(txt(discipline))) return [];
  const reels = new Set(personnes.filter(p => !estExemple(p.Email)).map(p => p.id));
  return phrases.filter(p => !reels.has(p.Auteur)).map(p => p.id);
}

// Étapes faites, d'après les données (cases cochées du panneau de gauche).
/**
 * @param {{ inscrit: boolean, params: Record<string, string>, etabs: Ligne[], profs: Ligne[], exemples: number,
 *   chiffrement: boolean | null, utilisateurs: Ligne[] }} d
 * @returns {Record<string, boolean>}
 */
export function etapesFaites(d) {
  const p = d.params || {};
  return {
    inscription: d.inscrit,
    academie: !!txt(p.academie),
    discipline: !!txt(p.discipline),
    etablissements: d.etabs.filter(e => !/\(fictif\)/i.test(txt(e.Nom))).length > 30,
    exemples: d.exemples === 0 || txt(p.installation_exemples) === 'gardés',
    chiffrement: d.chiffrement !== false,
    siiprien: d.profs.some(x => !estExemple(x.Email)),
    collegues: d.utilisateurs.filter(u => u.Actif === true && !estExemple(u.Email)).length > 1,
  };
}
