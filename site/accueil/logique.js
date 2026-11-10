// @ts-check
// Logique pure de la page d'accueil (sans DOM ni grist) : testable avec Node (tests/accueil.test.js).
import { liste } from '../commun/donnees.js';
import { etat, rentreeDe } from '../plan/logique.js';
import { retoursDe } from '../suivis/pstg.js';

/** @typedef {Record<string, any>} Ligne */
/** @typedef {{ titre: string, accroche: string, texte: string }} Texte */

// Une carte par écran du menu ; texte selon le profil (cmi, ipr ; admin = ipr). Écran sans entrée ici (Administration,
// Mon compte) : pas de carte, il reste dans le menu. Six cartes au plus (deux rangées de trois). À ADAPTER (APP § 9).
/** @type {Record<string, { cmi: Texte | null, ipr: Texte }>} */
export const CARTES = {
  plan: {
    cmi: { titre: "Plan d'inspection", accroche: 'Mes visites', texte: "Vos visites de l'année, les contacts de l'établissement, une date à caler en deux clics." },
    ipr: { titre: "Plan d'inspection", accroche: "Le plan, d'un coup d'œil", texte: 'Qui visite qui, où en est chaque visite, et ce qui manque encore au plan.' },
  },
  edt: {
    cmi: { titre: 'Emplois du temps', accroche: 'Trouver le bon créneau', texte: "L'emploi du temps de l'équipe, le cours à visiter, l'entretien, la réunion : le mail est prêt." },
    ipr: { titre: 'Emplois du temps', accroche: 'Préparer et caler', texte: 'Les EdT Siiprien de chaque établissement, stagiaires et MD repéré·es, planning et mails prêts.' },
  },
  rapports: {
    cmi: { titre: 'Rapports', accroche: 'Écrire, relire, signer', texte: "Des cadres guidés, vos phrases types, la relecture avec suggestions, l'aperçu et le PDF." },
    ipr: { titre: 'Rapports', accroche: 'Relire et valider', texte: 'Suggestions et commentaires comme dans Word, signature, PDF et transmission au secrétariat.' },
  },
  suivis: {
    cmi: null,
    ipr: { titre: 'Suivis', accroche: 'Stagiaires et MD', texte: "Retours, positionnements et visites de l'année ; la règle des trois ans des maître·sses délégué·es." },
  },
  annuaire: {
    cmi: { titre: 'Annuaire', accroche: 'Qui est qui', texte: 'Les CMi et les IA-IPR, les référent·es et leurs coordonnées.' },
    ipr: { titre: 'Annuaire', accroche: "L'équipe d'inspection", texte: "Fiches, référent·es, initiales et accès à l'application." },
  },
  modeles: {
    cmi: { titre: 'Modèles & phrases', accroche: 'Votre bibliothèque', texte: 'Vos phrases types, classées par rubrique, compétence et niveau ; proposez les meilleures à tous.' },
    ipr: { titre: 'Modèles & phrases', accroche: 'Les modèles du rapport', texte: 'Rubriques, phrases à valider, grilles de positionnement, mails et paramètres.' },
  },
};

// Mon compte : carte des CMi seulement (sixième carte, à la place de Suivis), pour leur signature.
CARTES.compte = { cmi: { titre: 'Mon compte', accroche: 'Ma signature', texte: 'Votre signature enregistrée, réutilisée à chaque rapport, et votre fiche.' },
  ipr: /** @type {any} */ (null) };

// Profil d'affichage : IA-IPR ou administrateur·trice → « ipr », sinon « cmi ».
/** @param {Ligne | null | undefined} moi */
export function profil(moi) {
  const r = moi ? liste(moi.Roles) : [];
  return r.includes('IA-IPR') || r.includes('Administrateur·trice') ? 'ipr' : 'cmi';
}
// Libellé du rôle pour le bandeau.
/** @param {Ligne | null | undefined} moi */
export function libelleRole(moi) {
  const r = moi ? liste(moi.Roles) : [];
  return ['IA-IPR', 'CMi', 'Administrateur·trice'].filter(x => r.includes(x)).join(' · ');
}
// Cartes à afficher : entrées du menu (dans leur ordre), texte du profil ; écrans sans texte pour ce profil ignorés.
/** @param {{ cle: string, libelle: string }[]} menu @param {'cmi' | 'ipr'} p */
export function cartes(menu, p) {
  return menu.filter(e => e.cle !== 'accueil' && CARTES[e.cle] && CARTES[e.cle][p])
    .map(e => ({ cle: e.cle, ...(/** @type {Texte} */ (CARTES[e.cle][p])), titre: e.libelle || /** @type {Texte} */ (CARTES[e.cle][p]).titre }));
}

// Année scolaire « 2026-2027 » d'une date Grist (secondes) ; rentrée = août.
/** @param {number} auj */
export const anneeScolaire = auj => { const a = rentreeDe(auj); return a ? `${a}-${a + 1}` : ''; };

// Compteurs des cartes : [{ ecran, n, libelle, alerte }] (n > 0 seulement).
/**
 * @param {{ visites?: Ligne[], rapports?: Ligne[], stagiaires?: Ligne[], retours?: Ligne[], personnes?: Ligne[], types?: Ligne[] }} D
 * @param {number} moiId fiche Personnes @param {'cmi' | 'ipr'} p @param {number} auj date Grist du jour
 */
export function compteurs(D, moiId, p, auj) {
  const visites = D.visites || [], rapports = D.rapports || [], rentree = rentreeDe(auj);
  /** @type {{ ecran: string, n: number, libelle: string, alerte?: boolean }[]} */
  const c = [];
  const ajouter = (/** @type {string} */ ecran, /** @type {number} */ n, /** @type {string} */ un, /** @type {string} */ plusieurs, alerte = false) => {
    if (n > 0) c.push({ ecran, n, libelle: n > 1 ? plusieurs : un, alerte });
  };
  const deLAnnee = (/** @type {Ligne} */ v) => { const r = rentreeDe(v.Mois_debut || v.Date_prevue); return !r || r === rentree; };
  if (p === 'cmi') {
    const mes = visites.filter(v => v.CMi === moiId && deLAnnee(v));
    ajouter('plan', mes.filter(v => etat(v, rapports.find(r => r.id === v.Rapport), auj).cle === 'a_caler').length, 'visite à caler', 'visites à caler');
    ajouter('rapports', rapports.filter(r => r.Auteur === moiId && r.Statut === 'À reprendre').length, 'rapport à reprendre', 'rapports à reprendre', true);
    ajouter('rapports', rapports.filter(r => r.Auteur === moiId && r.Statut === 'Brouillon').length, 'brouillon', 'brouillons');
    return c;
  }
  ajouter('rapports', rapports.filter(r => r.Valideur === moiId && r.Auteur !== moiId && r.Statut === 'Soumis').length, 'rapport à relire', 'rapports à relire', true);
  ajouter('rapports', rapports.filter(r => r.Valideur === moiId && r.Statut === 'Validé' && !r.Importe).length, 'rapport à transmettre', 'rapports à transmettre');
  const annee = rentree ? `${rentree}-${rentree + 1}` : '';
  const stg = (D.stagiaires || []).filter(s => String(s.Annee) === annee && s.Suivi !== 'Écarté·e');
  if (stg.length) {
    const typePstg = (D.types || []).find(t => t.Code === 'PSTG');
    const R = { retours: D.retours || [], rapports, personnes: D.personnes || [], typePstg: typePstg ? typePstg.id : 0, echellePstg: [] };
    const sansIpr = stg.filter(s => s.Corps === 'AGREG' && !retoursDe(s, R).some(r => r.type === 'Visite IA-IPR')).length;
    ajouter('suivis', sansIpr, 'agrégé·e sans visite IA-IPR', 'agrégé·es sans visite IA-IPR', true);
    const auPlan = new Set(visites.map(v => v.Stagiaire).filter(Boolean));
    ajouter('suivis', stg.filter(s => !auPlan.has(s.id) && !retoursDe(s, R).some(r => /^Visite (CMi|IA-IPR)$/.test(r.type))).length,
      'stagiaire sans visite', 'stagiaires sans visite');
  }
  ajouter('plan', visites.filter(v => deLAnnee(v) && etat(v, rapports.find(r => r.id === v.Rapport), auj).cle === 'a_caler').length, 'visite à caler', 'visites à caler');
  return c;
}
