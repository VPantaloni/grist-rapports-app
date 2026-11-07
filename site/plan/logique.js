// @ts-check
// Logique pure de l'écran Plan d'inspection (sans DOM ni grist) : testée avec Node (tests/plan.test.js).
// Table Visites : une visite à faire, attribuée à un·e CMi par un·e IA-IPR, reliée au rapport rédigé.
// Spécification : specifications/ecrans/plan.md.
import { norm, liste } from '../commun/donnees.js';

export const TABLE = 'Visites';

// --- Dates Grist (secondes UTC à minuit) ---
/** @param {number} a @param {number} m mois 1-12 @param {number} [j] */
export const gristDe = (a, m, j = 1) => Date.UTC(a, m - 1, j) / 1000;
/** @param {any} s @returns {Date | null} */
const dateDe = s => (typeof s === 'number' && Number.isFinite(s) && s ? new Date(s * 1000) : null);
/** @param {any} s */
export function dateIso(s) { const d = dateDe(s); return d ? d.toISOString().slice(0, 10) : ''; }
/** @param {any} s */
export function dateFr(s) {
  const d = dateDe(s);
  return d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '';
}
/** @param {string} iso @returns {number | null} */
export function isoVersGrist(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  return m ? gristDe(+m[1], +m[2], +m[3]) : null;
}
/** @param {Date} [d] */
export const aujourdhui = (d = new Date()) => gristDe(d.getFullYear(), d.getMonth() + 1, d.getDate());

// Année scolaire : début (septembre) d'une date ; août compte pour l'année qui commence.
/** @param {any} s @returns {number} année de la rentrée, 0 si pas de date */
export function rentreeDe(s) {
  const d = dateDe(s);
  if (!d) return 0;
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
/** @param {number} rentree */
export const libelleAnnee = rentree => `${rentree}-${rentree + 1}`;

// Mois d'une année scolaire, de septembre à juillet : { s: date Grist du 1er, lib: « nov. 2026 » }.
export const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** @param {number} rentree */
export function moisScolaires(rentree) {
  return [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7].map(m => { const a = m >= 8 ? rentree : rentree + 1; return { s: gristDe(a, m), lib: `${MOIS[m - 1]} ${a}` }; });
}
/** @param {any} s */
export function libelleMois(s) { const d = dateDe(s); return d ? `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; }
// Période « nov. → déc. 2026 » (année répétée seulement si elle change).
/** @param {Ligne} v */
export function periode(v) {
  const a = dateDe(v.Mois_debut), b = dateDe(v.Mois_fin);
  if (!a && !b) return '';
  if (!a || !b) return libelleMois(v.Mois_debut || v.Mois_fin);
  if (a.getTime() === b.getTime()) return libelleMois(v.Mois_debut);
  return a.getUTCFullYear() === b.getUTCFullYear()
    ? `${MOIS[a.getUTCMonth()]} → ${libelleMois(v.Mois_fin)}` : `${libelleMois(v.Mois_debut)} → ${libelleMois(v.Mois_fin)}`;
}
// Dernier jour du mois de fin (ou du mois de début si pas de fin).
/** @param {Ligne} v @returns {number | null} */
export function finPeriode(v) {
  const d = dateDe(v.Mois_fin) || dateDe(v.Mois_debut);
  return d ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / 1000 : null;
}

// --- Lecture du tableur des collègues ---
// Mois écrits à la main : « Nov », « Déc », « Janv », « févr », « sept »… (sans accent ni casse) → 1-12.
const NOMS_MOIS = [['janv', 1], ['jan', 1], ['fev', 2], ['mars', 3], ['mar', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['jun', 6],
  ['juil', 7], ['jul', 7], ['aout', 8], ['sept', 9], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]];
/** @param {string} t @returns {number} 0 si inconnu */
export function numeroMois(t) {
  const x = norm(t).replace(/[^a-z]/g, '');
  if (!x) return 0;
  const m = NOMS_MOIS.find(([n]) => x.startsWith(n) || (x.length >= 3 && n.startsWith(x)));
  return m ? /** @type {number} */ (m[1]) : 0;
}
// « Nov-Dec », « Déc-Fév », « Nov à Janv », « Octobre » → { debut, fin } (dates Grist du 1er du mois) dans l'année
// scolaire `rentree` ; null si illisible.
/** @param {string} texte @param {number} rentree */
export function lirePeriode(texte, rentree) {
  const parts = String(texte || '').split(/\s*[-–—/→]\s*|\s+(?:à|au)\s+/i).map(numeroMois).filter(Boolean);
  if (!parts.length) return null;
  const date = (/** @type {number} */ m) => gristDe(m >= 8 ? rentree : rentree + 1, m);
  return { debut: date(parts[0]), fin: date(parts[parts.length - 1]) };
}
// « 03/11/2026 », « 3/11/26 », « 2026-11-03 », et « 06 nov » (année tirée de l'année scolaire `rentree`) → date
// Grist, ou null.
/** @param {string} t @param {number} [rentree] */
export function lireDateFr(t, rentree = 0) {
  const x = String(t || '').trim();
  const j = /^(\d{1,2})\s*([a-zéèêûôîç.]+)$/i.exec(x);
  if (j && rentree) { const m = numeroMois(j[2]); if (m) return gristDe(m >= 8 ? rentree : rentree + 1, m, +j[1]); }
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(x);
  if (m) { const a = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return gristDe(a, +m[2], +m[1]); }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
  return m ? gristDe(+m[1], +m[2], +m[3]) : null;
}

// Colonnes du tableur (en-têtes reconnus sans accent ni casse) ; sans en-tête : NOM, Prénom, statut, établissement,
// ville, période de visite, Visite INSPE, UAI (ordre du tableur des collègues). Facultatives : CMi (« Prénom NOM »),
// date calée, notes.
export const COLONNES_PLAN = ['nom', 'prenom', 'statut', 'etablissement', 'ville', 'periode', 'inspe', 'uai'];
/** @type {Record<string, string[]>} */
const ENTETES = { nom: ['nom'], prenom: ['prenom'], statut: ['statut'], etablissement: ['etablissement', 'etab'], ville: ['ville', 'commune'],
  periode: ['periode', 'periodedevisite', 'mois'], inspe: ['visiteinspe', 'inspe', 'inspe1', 'visisteinspe', 'dateinspe'],
  uai: ['uai', 'rne', 'codeetablissement'], cmi: ['cmi', 'chargedemission', 'chargeedemission'],
  date: ['datecalee', 'visitecmi', 'datedevisite', 'datevisite', 'visite1'], notes: ['notes', 'remarques', 'commentaire'] };
/** @param {string} h */
const cleEntete = h => { const x = norm(h).replace(/[^a-z]/g, ''); return Object.keys(ENTETES).find(k => ENTETES[k].includes(x)) || ''; };
// Texte collé (tableur : tabulations ; sinon point-virgule) → lignes { nom, prenom, … , n } (n = n° de ligne collée).
/** @param {string} texte @returns {Record<string, string>[]} */
export function lireTableauColle(texte) {
  const lignes = String(texte || '').split(/\r?\n/).filter(l => l.trim());
  if (!lignes.length) return [];
  const sep = lignes[0].includes('\t') ? '\t' : ';';
  const cases = lignes.map(l => l.split(sep).map(x => x.trim()));
  const cles = cases[0].map(cleEntete);
  const avecEntete = cles.filter(Boolean).length >= 2;
  const ordre = avecEntete ? cles : COLONNES_PLAN;
  return cases.slice(avecEntete ? 1 : 0).map((c, i) => {
    /** @type {Record<string, string>} */
    const o = { n: String(i + 1) };
    ordre.forEach((k, j) => { if (k && c[j] !== undefined && !o[k]) o[k] = c[j]; });
    return o;
  }).filter(o => (o.nom || '').trim());
}

// Professeur·e d'une ligne du plan : même UAI et même nom (prénom s'il est donné) ; sinon même nom et prénom ailleurs,
// si une seule personne correspond. → { prof, ambigu }.
// Plusieurs affectations (même nom et prénom) : celle dont la commune de l'établissement commence comme la ville du plan.
/** @param {Record<string, string>} l @param {Ligne[]} profs @param {Ligne[]} [etabs] */
export function trouverProf(l, profs, etabs = []) {
  const nom = norm(l.nom).trim(), prenom = norm(l.prenom).trim(), uai = String(l.uai || '').replace(/\s+/g, '').toUpperCase();
  const memeNom = profs.filter(p => norm(p.Nom).trim() === nom && (!prenom || norm(p.Prenom).trim() === prenom));
  const ici = memeNom.filter(p => String(p.UAI || '').toUpperCase() === uai);
  if (ici.length) return { prof: ici[0], ambigu: false };
  if (memeNom.length === 1 && prenom) return { prof: memeNom[0], ambigu: false };
  const ville = norm(l.ville).replace(/[^a-z ]/g, ' ').trim().split(/\s+/)[0] || '';
  if (memeNom.length > 1 && ville) {
    const la = memeNom.filter(p => norm((etabs.find(e => String(e.UAI || '').toUpperCase() === String(p.UAI || '').toUpperCase()) || {}).Commune).replace(/[^a-z ]/g, ' ').trim().startsWith(ville));
    if (la.length === 1) return { prof: la[0], ambigu: false };
  }
  return { prof: null, ambigu: memeNom.length > 1 };
}
// CMi d'une ligne (« Prénom NOM » ou « NOM Prénom ») : fiche de Personnes, sinon professeur·e du fichier académique du
// même nom (pour créer sa fiche, avec son e-mail). → { personne, prof }.
/** @param {string} texte @param {Ligne[]} personnes @param {Ligne[]} profs */
export function trouverCmi(texte, personnes, profs) {
  const mots = norm(texte).replace(/[^a-z' -]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  if (!mots) return { personne: null, prof: null };
  const cle = (/** @type {any} */ a, /** @type {any} */ b) => norm(`${a} ${b}`).replace(/[^a-z' -]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  const personne = personnes.find(p => cle(p.Prenom, p.Nom) === mots) || null;
  const prof = personne ? null : profs.find(p => cle(p.Prenom, p.Nom) === mots) || null;
  return { personne, prof };
}

// Visite déjà au plan pour cette personne, cette année scolaire ?
/** @param {Ligne[]} visites @param {{ prof?: number, nom: string, prenom: string, uai: string }} x @param {number} rentree */
export function dejaAuPlan(visites, x, rentree) {
  return visites.find(v => rentreeDe(v.Mois_debut || v.Date_prevue) === rentree && (x.prof ? v.Professeur === x.prof
    : norm(v.Prof_nom).trim() === norm(x.nom).trim() && norm(v.Prof_prenom).trim() === norm(x.prenom).trim()
      && String(v.UAI || '').toUpperCase() === String(x.uai || '').toUpperCase())) || null;
}

// Lignes collées → visites à créer, avec alertes. cmi : id Personnes pour les lignes sans colonne CMi (0 = aucun·e) ;
// rentree : année scolaire. Un·e CMi absent·e de Personnes mais trouvé·e dans Professeurs est à créer (`nouvelleCmi`,
// clé « Prénom|Nom ») : les visites de cette personne attendent son id (CMi: 0).
/**
 * @param {Record<string, string>[]} lignes @param {{ profs: Ligne[], etabs: Ligne[], visites: Ligne[], personnes?: Ligne[] }} D
 * @param {number} cmi @param {number} rentree
 * @returns {{ n: string, libelle: string, cmi: string, nouvelleCmi: Ligne | null, champs: Record<string, any> | null, prof: Ligne | null, alertes: string[], ignoree: string }[]}
 */
export function preparerImport(lignes, D, cmi, rentree) {
  /** @type {Set<string>} */
  const vues = new Set();
  const personnes = D.personnes || [];
  return lignes.map(l => {
    const alertes = [];
    const uai = String(l.uai || '').replace(/\s+/g, '').toUpperCase();
    const { prof, ambigu } = trouverProf(l, D.profs, D.etabs);
    if (!prof) alertes.push(ambigu ? 'plusieurs professeur·es de ce nom : à choisir après l\'import' : 'pas trouvé·e dans Professeurs : nom recopié tel quel');
    else if (uai && String(prof.UAI || '').toUpperCase() !== uai) alertes.push(`trouvé·e dans un autre établissement (${prof.UAI})`);
    const per = lirePeriode(l.periode, rentree);
    if (l.periode && !per) alertes.push(`période « ${l.periode} » illisible`);
    if (!l.periode) alertes.push('pas de période');
    const inspe = lireDateFr(l.inspe, rentree);
    if (l.inspe && !inspe) alertes.push(`date INSPE « ${l.inspe} » illisible`);
    const date = lireDateFr(l.date, rentree);
    // CMi : colonne du tableur, sinon celui ou celle choisi·e pour le lot.
    let idCmi = cmi, nomCmi = '', nouvelleCmi = null;
    if (String(l.cmi || '').trim()) {
      const t = trouverCmi(l.cmi, personnes, D.profs);
      if (t.personne) { idCmi = t.personne.id; nomCmi = String(t.personne.Nom_complet || `${t.personne.Prenom} ${t.personne.Nom}`); }
      else if (t.prof) { idCmi = 0; nouvelleCmi = t.prof; nomCmi = `${t.prof.Prenom} ${t.prof.Nom}`; alertes.push(`CMi ${nomCmi} : fiche à créer dans l'annuaire (e-mail ${t.prof.Email || 'inconnu'})`); }
      else { idCmi = cmi; nomCmi = String(l.cmi).trim(); alertes.push(`CMi « ${nomCmi} » introuvable${cmi ? ' : CMi du lot utilisé·e' : ''}`); }
    } else if (cmi) { const p = personnes.find(x => x.id === cmi); nomCmi = p ? String(p.Nom_complet || `${p.Prenom} ${p.Nom}`) : ''; }
    if (!idCmi && !nouvelleCmi) alertes.push('pas de CMi');
    const u = prof ? String(prof.UAI || '') : uai;
    const etab = D.etabs.find(e => String(e.UAI || '').toUpperCase() === u.toUpperCase());
    if (!etab && u) alertes.push(`UAI ${u} absent de Etablissements`);
    const x = { prof: prof ? prof.id : 0, nom: prof ? prof.Nom : String(l.nom || '').trim(), prenom: prof ? prof.Prenom : String(l.prenom || '').trim(), uai: u };
    const cle = `${x.prof || ''}|${norm(x.nom)}|${norm(x.prenom)}|${u}`;
    const deja = dejaAuPlan(D.visites, x, rentree);
    const ignoree = deja ? 'déjà au plan' : vues.has(cle) ? 'en double dans le collage' : !idCmi && !nouvelleCmi ? 'sans CMi' : '';
    vues.add(cle);
    return { n: l.n, libelle: [x.nom, x.prenom].filter(Boolean).join(' '), cmi: nomCmi, nouvelleCmi, prof, alertes, ignoree, champs: ignoree ? null : {
      Professeur: x.prof, Prof_nom: x.nom, Prof_prenom: x.prenom, UAI: u,
      Etab_nom: etab ? String(etab.Nom || '') : [l.etablissement, l.ville].map(y => String(y || '').trim()).filter(Boolean).join(', '),
      Statut_plan: String(l.statut || '').trim(), CMi: idCmi, Mois_debut: per ? per.debut : null, Mois_fin: per ? per.fin : null,
      Visite_inspe: inspe, Date_prevue: date, Notes: String(l.notes || '').trim(), Rapport: 0 } };
  });
}
// Fiches de CMi à créer avant l'enregistrement des visites (une par professeur·e trouvé·e), sans doublon.
/** @param {{ nouvelleCmi: Ligne | null, champs: Record<string, any> | null }[]} lot */
export function fichesCmiACreer(lot) {
  /** @type {Map<number, Record<string, any>>} */
  const m = new Map();
  for (const x of lot) if (x.champs && x.nouvelleCmi && !m.has(x.nouvelleCmi.id)) {
    const p = x.nouvelleCmi;
    const prenom = String(p.Prenom || '').trim(), nom = String(p.Nom || '').trim();
    const ini = (prenom + ' ' + nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s'-]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase();
    m.set(p.id, { Prenom: prenom, Nom: nom, Fonction: 'CMi', Initiales: ini, Email: String(p.Email || '').trim(), Titre_signature: '', Stagiaires: false, Referent: 0 });
  }
  return m;
}

// --- État d'une visite ---
/** @typedef {{ cle: string, libelle: string, rang: number, faite: boolean }} Etat */
/** @type {Etat[]} */
export const ETATS = [
  { cle: 'a_caler', libelle: 'À caler', rang: 1, faite: false },
  { cle: 'calee', libelle: 'Calée', rang: 2, faite: false },
  { cle: 'redaction', libelle: 'En cours', rang: 3, faite: true },
  { cle: 'reprendre', libelle: 'À reprendre', rang: 4, faite: true },
  { cle: 'relecture', libelle: 'En relecture', rang: 5, faite: true },
  { cle: 'valide', libelle: 'Validé', rang: 7, faite: true },
  { cle: 'transmis', libelle: 'Transmis', rang: 8, faite: true },
];
const etatCle = (/** @type {string} */ k) => /** @type {Etat} */ (ETATS.find(e => e.cle === k));
// Date calée passée sans rapport : « en cours » (APP § 11).
const PAR_STATUT = /** @type {Record<string, string>} */ ({ Brouillon: 'redaction', 'À reprendre': 'reprendre', Soumis: 'relecture', 'Validé': 'valide', Transmis: 'transmis' });
// rapport : la ligne de Rapports reliée (ou undefined) ; auj : date Grist du jour.
/** @param {Ligne} v @param {Ligne | undefined} rapport @param {number} auj @returns {Etat} */
export function etat(v, rapport, auj) {
  if (rapport) return etatCle(PAR_STATUT[String(rapport.Statut)] || 'redaction');
  if (v.Date_prevue) return etatCle(v.Date_prevue <= auj ? 'redaction' : 'calee');
  return etatCle('a_caler');
}
// Période passée sans date calée ni rapport : signalée dans « À caler » (pas un état à part).
/** @param {Ligne} v @param {Etat} e @param {number} auj */
export const periodeDepassee = (v, e, auj) => { const f = finPeriode(v); return e.cle === 'a_caler' && f !== null && f < auj; };
// Visites avec leur état et leur rapport ; triées par date calée (sinon début de période), puis nom.
/** @param {Ligne[]} visites @param {Ligne[]} rapports @param {number} auj */
export function enrichir(visites, rapports, auj) {
  return visites.map(v => { const r = rapports.find(x => x.id === v.Rapport); return { v, r, e: etat(v, r, auj) }; })
    .sort((a, b) => (Number(a.v.Date_prevue || a.v.Mois_debut) || 9e9) - (Number(b.v.Date_prevue || b.v.Mois_debut) || 9e9)
      || String(a.v.Prof_nom || '').localeCompare(String(b.v.Prof_nom || ''), 'fr'));
}
// Compteurs par état.
/** @param {{ e: Etat }[]} lignes */
export function compter(lignes) {
  /** @type {Record<string, number>} */
  const n = Object.fromEntries(ETATS.map(e => [e.cle, 0]));
  for (const l of lignes) n[l.e.cle]++;
  return n;
}
// Filtres du suivi : CMi, état (ou « faites » / « a_faire »), recherche (nom, établissement, UAI, statut).
/** @param {{ v: Ligne, e: Etat }[]} lignes @param {{ cmi?: number, cmis?: number[], etat?: string, q?: string }} f */
export function filtrer(lignes, f) {
  const mots = norm(f.q || '').split(/\s+/).filter(Boolean);
  return lignes.filter(({ v, e }) => (!f.cmi || v.CMi === f.cmi) && (!f.cmis || f.cmis.includes(Number(v.CMi)))
    && (!f.etat || (f.etat === 'faites' ? e.faite : f.etat === 'a_faire' ? !e.faite : e.cle === f.etat))
    && mots.every(m => norm([v.Prof_nom, v.Prof_prenom, v.Etab_nom, v.UAI, v.Statut_plan].join(' ')).includes(m)));
}

// Bilan par CMi : visites prévues, effectuées (rapport commencé ou date passée), rapports validés ou transmis, en
// relecture, et rapports rédigés hors plan (à ajouter au plan). CMi sans visite mais avec rapports compris.
/**
 * @param {{ v: Ligne, r?: Ligne, e: Etat }[]} lignes @param {Ligne[]} horsPlan rapports de l'année sans visite
 * @param {Ligne[]} personnes
 */
export function bilanParCmi(lignes, horsPlan, personnes) {
  const ids = [...new Set([...lignes.map(l => Number(l.v.CMi) || 0), ...horsPlan.map(r => Number(r.Auteur) || 0)])];
  const nom = (/** @type {number} */ id) => { const p = personnes.find(x => x.id === id); return p ? String(p.Nom_complet || [p.Prenom, p.Nom].join(' ')) : 'sans CMi'; };
  return ids.map(id => {
    const m = lignes.filter(l => (Number(l.v.CMi) || 0) === id);
    return { id, nom: nom(id), prevues: m.length, faites: m.filter(l => l.e.faite).length,
      relecture: m.filter(l => l.e.cle === 'relecture').length,
      validees: m.filter(l => l.e.cle === 'valide' || l.e.cle === 'transmis').length,
      horsPlan: horsPlan.filter(r => (Number(r.Auteur) || 0) === id).length };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
// Rapports de l'année scolaire sans visite au plan.
/** @param {Ligne[]} rapports @param {Ligne[]} visites @param {number} rentree */
export const rapportsHorsPlan = (rapports, visites, rentree) => rapports
  .filter(r => rentreeDe(r.Date_visite) === rentree && !visites.some(v => v.Rapport === r.id));
// Visite à ajouter au plan d'après un rapport hors plan (période = mois de la visite, date calée = date de la visite).
/** @param {Ligne} r */
export function visiteDepuisRapport(r) {
  const d = dateDe(r.Date_visite);
  const mois = d ? gristDe(d.getUTCFullYear(), d.getUTCMonth() + 1) : null;
  return { Professeur: Number(r.Professeur) || 0, Prof_nom: String(r.Prof_nom || ''), Prof_prenom: String(r.Prof_prenom || ''),
    UAI: String(r.UAI || ''), Etab_nom: String(r.Etab_nom || ''), Statut_plan: '', CMi: Number(r.Auteur) || 0,
    Mois_debut: mois, Mois_fin: mois, Visite_inspe: null, Date_prevue: r.Date_visite || null, Notes: 'ajoutée d\'après un rapport hors plan', Rapport: r.id };
}

// Visites d'un·e CMi, regroupées par mois (date calée, sinon début de période), rapports validés ou transmis à la fin.
/** @param {{ v: Ligne, r?: Ligne, e: Etat }[]} lignes */
export function grouperMesVisites(lignes) {
  /** @type {{ cle: string, titre: string, lignes: typeof lignes }[]} */
  const g = [];
  const ajouter = (/** @type {string} */ cle, /** @type {string} */ titre, /** @type {typeof lignes[0]} */ l) => {
    let x = g.find(y => y.cle === cle);
    if (!x) g.push(x = { cle, titre, lignes: [] });
    x.lignes.push(l);
  };
  const encours = lignes.filter(x => x.e.rang < 7)
    .sort((a, b) => (Number(a.v.Date_prevue || a.v.Mois_debut) || 9e9) - (Number(b.v.Date_prevue || b.v.Mois_debut) || 9e9));
  for (const l of encours) { const s = l.v.Date_prevue || l.v.Mois_debut; const lib = libelleMois(s); ajouter('m' + (lib || '?'), lib ? lib[0].toUpperCase() + lib.slice(1) : 'Sans période', l); }
  for (const l of lignes.filter(x => x.e.rang >= 7)) ajouter('fini', 'Rapports validés ou transmis', l);
  return g;
}

// Contacts de l'établissement : e-mail de la table (sinon ce.<UAI>@ac-orleans-tours.fr) et téléphone.
/** @param {Ligne | undefined} etab @param {string} uai */
export function contacts(etab, uai) {
  const u = String(uai || '').trim().toLowerCase();
  const mel = String((etab && etab.Mel) || '').trim() || (/^\d{7}[a-z]$/.test(u) ? `ce.${u}@ac-orleans-tours.fr` : '');
  const tel = String((etab && etab.Telephone) || '').trim();
  return { mel, tel, telLien: tel.replace(/[^\d+]/g, '') };
}

// Droits (mêmes conditions que les règles d'accès) : 'tout' pour qui remplit le plan (Modifier « Oui »), 'date' pour
// le ou la CMi de la visite (Modifier « Limité » : date calée et notes seulement), '' sinon.
/** @param {DroitsTable} d @param {Ligne | null | undefined} moi @param {Ligne} v */
export function peutModifier(d, moi, v) {
  if (d.M === 'Oui') return 'tout';
  return d.M === 'Limité' && !!moi && !!moi.Personne && v.CMi === moi.Personne ? 'date' : '';
}
/** @param {DroitsTable} d */
export const peutPlanifier = d => d.C === 'Oui';
// Onglets proposés : Suivi pour qui remplit le plan ; Mes visites pour qui a une fiche (CMi, ou IA-IPR qui visite).
/** @param {DroitsTable} d @param {Ligne | null | undefined} moi @param {Ligne[]} visites */
export function onglets(d, moi, visites) {
  const o = [];
  const roles = liste(moi && moi.Roles);
  if (d.C === 'Oui' || d.L === 'Oui' || roles.includes('IA-IPR') || roles.includes('Administrateur·trice')) o.push('suivi');
  if (moi && moi.Personne && (visites.some(v => v.CMi === moi.Personne) || liste(moi.Roles).includes('CMi') || !o.length)) o.push('mes');
  return o.length ? o : ['mes'];
}

// Validation d'une visite saisie à la main.
/** @param {Record<string, any>} f */
export function valider(f) {
  const e = [];
  if (!String(f.Prof_nom || '').trim()) e.push('Professeur·e : à choisir (ou nom à saisir).');
  if (!Number(f.CMi)) e.push('CMi : à choisir.');
  if (f.Mois_debut && f.Mois_fin && f.Mois_fin < f.Mois_debut) e.push('Période : le mois de fin précède le mois de début.');
  return e;
}
