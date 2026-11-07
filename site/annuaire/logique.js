// @ts-check
// Logique pure de l'écran Annuaire (sans DOM ni grist) : testée avec Node (tests/annuaire-ecran.test.js).
// Fiches des CMi et IA-IPR (table Personnes) ; spécification : specifications/ecrans/annuaire.md.
import { liste, norm } from '../commun/donnees.js';

export const TABLE = 'Personnes';
export const FONCTIONS = ['IA-IPR', 'CMi'];
// Titres de signature proposés (saisis, jamais calculés : APP § 3).
export const TITRES = ['La chargée de mission', 'Le chargé de mission', "L'IA-IPR"];

/** @param {Ligne} p */
export const nomComplet = p => [p.Prenom, p.Nom].map(x => String(x ?? '').trim()).filter(Boolean).join(' ');

// Liste : IA-IPR, puis CMi regroupé·es par référent·e (« sans référent·e » à la fin) ; recherche sans accent.
/** @param {Ligne[]} personnes @param {string} recherche */
export function grouper(personnes, recherche = '') {
  const mots = norm(recherche).split(/\s+/).filter(Boolean);
  const garde = personnes.filter(p => mots.every(m => norm([p.Prenom, p.Nom, p.Initiales, p.Email, p.Fonction].join(' ')).includes(m)));
  const tri = (/** @type {Ligne} */ a, /** @type {Ligne} */ b) => String(a.Nom || '').localeCompare(String(b.Nom || ''), 'fr')
    || String(a.Prenom || '').localeCompare(String(b.Prenom || ''), 'fr');
  const ipr = personnes.filter(p => p.Fonction === 'IA-IPR').sort(tri);
  /** @type {{ cle: string, titre: string, personnes: Ligne[] }[]} */
  const groupes = [{ cle: 'IA-IPR', titre: 'IA-IPR', personnes: garde.filter(p => p.Fonction === 'IA-IPR').sort(tri) }];
  for (const i of ipr) groupes.push({ cle: `ref-${i.id}`, titre: `CMi · réf. ${nomComplet(i)}`,
    personnes: garde.filter(p => p.Fonction !== 'IA-IPR' && p.Referent === i.id).sort(tri) });
  groupes.push({ cle: 'sans', titre: 'CMi · sans référent·e', personnes: garde.filter(p => p.Fonction !== 'IA-IPR'
    && !ipr.some(i => i.id === p.Referent)).sort(tri) });
  return groupes.filter(g => g.personnes.length);
}

// Initiales proposées : première lettre de chaque partie du prénom et du nom (« Jean-Marc Dupont » → « JMD »).
/** @param {string} prenom @param {string} nom */
export function initialesProposees(prenom, nom) {
  const l = (/** @type {string} */ s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s'-]+/).filter(Boolean).map(x => x[0]).join('');
  return (l(prenom) + l(nom)).toUpperCase();
}

// Validation d'une fiche : obligatoires, initiales et e-mail uniques, référent·e IA-IPR.
/** @param {Record<string, any>} f @param {Ligne[]} personnes @param {number | null} id */
export function validerFiche(f, personnes, id) {
  /** @type {string[]} */
  const e = [];
  if (!String(f.Prenom || '').trim()) e.push('Prénom obligatoire.');
  if (!String(f.Nom || '').trim()) e.push('Nom obligatoire.');
  if (!FONCTIONS.includes(f.Fonction)) e.push('Fonction à choisir (CMi ou IA-IPR).');
  const autres = personnes.filter(p => p.id !== id);
  const ini = norm(f.Initiales).trim();
  if (ini && autres.some(p => norm(p.Initiales).trim() === ini)) e.push(`Initiales « ${f.Initiales} » déjà prises.`);
  if (ini && !/^[a-z]{1,5}$/.test(ini)) e.push('Initiales : 1 à 5 lettres.');
  const mail = String(f.Email || '').trim().toLowerCase();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) e.push('E-mail invalide.');
  if (mail && autres.some(p => String(p.Email || '').trim().toLowerCase() === mail)) e.push('E-mail déjà utilisé par une autre fiche.');
  if (f.Referent) {
    const r = personnes.find(p => p.id === f.Referent);
    if (!r || r.Fonction !== 'IA-IPR') e.push('Le ou la référent·e doit être un·e IA-IPR.');
    if (f.Referent === id) e.push('Une personne ne peut pas être sa propre référente.');
  }
  return e;
}

// Champs à écrire (Referent seulement pour un·e CMi ; Stagiaires seulement pour un·e IA-IPR).
/** @param {Record<string, any>} f */
// avecDues : la colonne nb_visites_dues (visites attendues selon la lettre de mission) existe dans le document.
/** @param {Record<string, any>} f @param {boolean} [avecDues] */
export function champsFiche(f, avecDues = false) {
  const ipr = f.Fonction === 'IA-IPR';
  /** @type {Record<string, any>} */
  const c = { Prenom: String(f.Prenom || '').trim(), Nom: String(f.Nom || '').trim(), Fonction: f.Fonction,
    Initiales: String(f.Initiales || '').trim().toUpperCase(), Referent: ipr ? 0 : (f.Referent || 0),
    Titre_signature: String(f.Titre_signature || '').trim(), Stagiaires: ipr && !!f.Stagiaires, Email: String(f.Email || '').trim() };
  if (avecDues) { const n = parseInt(String(f.nb_visites_dues ?? ''), 10); c.nb_visites_dues = ipr || !Number.isFinite(n) || n < 0 ? 0 : n; }
  return c;
}

// Peut-on modifier cette fiche ? « Limité » : la sienne (même condition que la règle d'accès).
/** @param {DroitsTable | { M: string }} droits @param {Ligne | null | undefined} moi @param {Ligne} p */
export const peutModifier = (droits, moi, p) => droits.M === 'Oui' || (droits.M === 'Limité' && !!moi && moi.Personne === p.id);
// Suppression : seulement une fiche sans rapport ni phrase ni CMi rattaché·e.
/** @param {Ligne} p @param {{ rapports: Ligne[], phrases: Ligne[], personnes: Ligne[] }} d @returns {string} raison du refus, '' sinon */
export function empecheSuppression(p, d) {
  const n = d.rapports.filter(r => r.Auteur === p.id || r.Valideur === p.id).length;
  if (n) return `${n} rapport(s) la mentionnent`;
  if (d.personnes.some(x => x.Referent === p.id)) return 'des CMi l\'ont pour référent·e';
  if (d.phrases.some(x => x.Auteur === p.id)) return 'des phrases types sont à son nom';
  return '';
}

// Accès à l'application : compte Utilisateurs relié à la fiche (par Personne, sinon par e-mail).
/** @param {Ligne} p @param {Ligne[]} utilisateurs */
export const compteDe = (p, utilisateurs) => utilisateurs.find(u => u.Personne === p.id)
  || utilisateurs.find(u => p.Email && String(u.Email || '').toLowerCase() === String(p.Email).toLowerCase()) || null;
// Action « Donner accès » : crée le compte (rôle = fonction) ou complète le compte existant (fiche, rôle, actif).
/** @param {Ligne} p @param {Ligne[]} utilisateurs @returns {any[] | null} null si pas d'e-mail */
export function actionsAcces(p, utilisateurs) {
  const email = String(p.Email || '').trim();
  if (!email) return null;
  const u = compteDe(p, utilisateurs);
  if (!u) return [['AddRecord', 'Utilisateurs', null, { Email: email, Roles: ['L', p.Fonction], Personne: p.id, Actif: true }]];
  const roles = liste(u.Roles);
  return [['UpdateRecord', 'Utilisateurs', u.id, { Personne: p.id, Actif: true, Roles: ['L', ...new Set([...roles, p.Fonction])] }]];
}
