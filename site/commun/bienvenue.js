// @ts-check
// Fenêtre « Comment ça marche » à la première ouverture de chaque écran (APP § 11, 2026-11-14) : quelques points
// selon le profil (IA-IPR ou CMi), case « Ne plus montrer » (mémorisée dans ce navigateur), lien vers l'aide (?).
// Sans « Ne plus montrer », la fenêtre revient à la prochaine session du navigateur, une fois par écran.
// Les textes sont ici, en un seul endroit, pour tous les écrans.
import { PREFIXE } from './config.js';
import { liste } from './donnees.js';

/** @typedef {[string, string]} Point titre, explication */
/** @type {Record<string, { titre: string, ipr: Point[], cmi?: Point[] }>} */
export const TEXTES = {
  accueil: {
    titre: 'Bienvenue dans « Rapports et suivis »',
    ipr: [
      ['Une carte par écran', 'Cliquez sur une carte pour ouvrir l\'écran ; le menu en haut y mène aussi.'],
      ['Ce qui vous attend', 'Les chiffres des cartes comptent ce qui est à faire : rapports à relire, à transmettre, visites à caler, stagiaires sans visite.'],
      ['Aide', 'Le (?) en haut à droite de chaque écran ouvre son mode d\'emploi ; la grille en dessous mène au menu des applications.'],
    ],
    cmi: [
      ['Une carte par écran', 'Cliquez sur une carte pour ouvrir l\'écran ; le menu en haut y mène aussi.'],
      ['Ce qui vous attend', 'Les chiffres des cartes comptent vos visites à caler, vos rapports à reprendre et vos brouillons.'],
      ['Aide', 'Le (?) en haut à droite de chaque écran ouvre son mode d\'emploi.'],
    ],
  },
  plan: {
    titre: 'Plan d\'inspection',
    ipr: [
      ['Suivi', 'Toutes les visites de l\'année : compteurs par état (cliquables), bilan par CMi, rapports rédigés hors plan.'],
      ['Tri et filtres', 'Dans chaque en-tête : le bouton flèches trie la colonne, l\'entonnoir la filtre.'],
      ['Colonne EdT', 'Coche verte : emploi du temps versé ; croix rouge : pas encore versé ; ? rouge : absent de Siiprien.'],
      ['Fiche d\'une visite', 'Cliquez sur une ligne : CMi, période, établissement réel (à choisir dans la liste si l\'affectation du fichier est fausse, par exemple « Rectorat »).'],
      ['Ajouter', '« + Visite » une par une, ou « Importer un plan » par copier-coller du tableur.'],
    ],
    cmi: [
      ['Mes visites', 'Les visites que vos IA-IPR vous ont confiées, rangées par état.'],
      ['Caler une date', 'Saisissez la date dans la carte ; « Emploi du temps » prépare le créneau et le mail à l\'établissement.'],
      ['Rédiger', '« Rédiger le rapport » crée le rapport, déjà rempli (professeur·e, établissement), et le relie à la visite.'],
    ],
  },
  edt: {
    titre: 'Emplois du temps',
    ipr: [
      ['Choisir', 'Un établissement (tous ceux de l\'académie), puis un·e ou plusieurs professeur·es, ou « Toute l\'équipe ».'],
      ['Couleurs des établissements', 'Gris clair : pas encore d\'emplois du temps (« Ajouter EdT via Siiprien ») ; rouge : absents de Siiprien (case à cocher).'],
      ['Préparer la visite', 'Cliquez sur un cours : visite, entretien, réunion d\'équipe ; le planning se construit sous la grille.'],
      ['Ensuite', 'Mémoriser, « Visite calée » (date reportée au plan), mail par modèle, ajout à votre agenda.'],
    ],
    cmi: [
      ['Choisir', 'Un établissement, puis un·e ou plusieurs professeur·es, ou « Toute l\'équipe ».'],
      ['Préparer la visite', 'Cliquez sur un cours : visite, entretien, réunion d\'équipe ; le planning se construit sous la grille.'],
      ['Ensuite', 'Mémoriser, « Visite calée » (date reportée au plan), mail par modèle, ajout à votre agenda (réglé dans Mon compte).'],
      ['EdT manquant', 'Établissement en gris clair ou en rouge : les emplois du temps ne sont pas versés ; vos IA-IPR les ajoutent depuis Siiprien.'],
    ],
  },
  rapports: {
    titre: 'Rapports',
    ipr: [
      ['Liste', 'Tous les rapports, par statut ; ceux à relire sont en tête.'],
      ['Relire', 'Vos modifications deviennent des suggestions ; sélectionnez un passage pour le commenter.'],
      ['Valider et transmettre', '« Signer et valider », puis imprimer en PDF et « Transmettre » au secrétariat.'],
    ],
    cmi: [
      ['Créer', '« + » : cherchez le ou la professeur·e ou l\'établissement ; le type (Classique, PSTG, MD) est proposé.'],
      ['Rédiger', 'Un cadre par rubrique, avec la consigne et des phrases types ; « Aperçu » montre le rapport imprimé.'],
      ['Soumettre', 'Signez puis soumettez ; vous acceptez ou refusez ensuite les suggestions de l\'IA-IPR.'],
    ],
  },
  suivis: {
    titre: 'Suivis',
    ipr: [
      ['Suivi MD', 'Un rond par visite et par année ; la règle des trois ans est signalée.'],
      ['Suivi PSTG', 'Liste des stagiaires de l\'année (ajout depuis le fichier, tuteur·trices), puis « Suivi des retours ».'],
      ['Mettre au plan', 'Crée les visites des stagiaires qui n\'en ont pas, pour un·e CMi ou un·e IA-IPR.'],
    ],
  },
  modeles: {
    titre: 'Modèles & phrases',
    ipr: [
      ['Rubriques et types', 'La structure des rapports : titres, consignes, textes de départ.'],
      ['Phrases types', 'La bibliothèque commune ; les phrases proposées par les CMi attendent votre validation.'],
      ['Mails et paramètres', 'Modèles de mails des emplois du temps, secrétariat, textes des mails de transmission.'],
    ],
    cmi: [
      ['Consulter', 'Les rubriques, la grille de positionnement et les phrases types validées.'],
      ['Mes phrases', 'Vos phrases personnelles ; cochez « Proposer à tous » pour les soumettre aux IA-IPR.'],
    ],
  },
  annuaire: {
    titre: 'Annuaire',
    ipr: [
      ['Fiches', 'IA-IPR puis CMi, groupé·es par référent·e : initiales, titre de signature, visites dues.'],
      ['Accès', '« Donner accès à l\'application » crée le compte relié à la fiche.'],
    ],
    cmi: [['Fiches', 'Les IA-IPR et les CMi de l\'académie, avec leurs coordonnées.']],
  },
  admin: {
    titre: 'Mon compte',
    ipr: [
      ['Signature', 'Collez ou choisissez l\'image de votre signature : elle sera proposée dans les rapports.'],
      ['Agenda', 'Choisissez votre agenda (Google, Outlook ou fichier .ics) pour « Ajouter à mon agenda » dans Emplois du temps.'],
      ['Administration', 'Pour les administrateur·trices : « Premier démarrage » (étapes à cocher), Académie (logo, en-tête), import du fichier Siiprien, accès, permissions, contrôles, chiffrement.'],
    ],
  },
};

const cleMemo = (/** @type {string} */ ecran) => `${PREFIXE}Bienvenue_${ecran}`;
const lireStock = (/** @type {Storage} */ st, /** @type {string} */ k) => { try { return st.getItem(k); } catch (e) { return null; } };
const ecrireStock = (/** @type {Storage} */ st, /** @type {string} */ k, /** @type {string} */ v) => { try { st.setItem(k, v); } catch (e) { /* stockage indisponible */ } };

// Profil d'après le compte (ligne Utilisateurs) : 'ipr' (IA-IPR, admins) ou 'cmi'.
/** @param {Record<string, any> | null | undefined} moi */
export function profilDe(moi) {
  const r = moi ? liste(moi.Roles) : [];
  return r.includes('IA-IPR') || r.includes('Administrateur·trice') ? 'ipr' : 'cmi';
}
// Points à montrer pour un écran et un profil (le texte des IA-IPR sert aux CMi quand il n'y a qu'une version).
/** @param {string} ecran @param {string} profil @returns {{ titre: string, points: Point[] } | null} */
export function pointsDe(ecran, profil) {
  const t = TEXTES[ecran];
  if (!t) return null;
  return { titre: t.titre, points: (profil === 'cmi' && t.cmi) || t.ipr };
}

let montre = false;
// Montre la fenêtre si elle n'a pas été écartée (« Ne plus montrer ») ni déjà vue dans cette session du navigateur.
// options.aide : adresse du mode d'emploi (défaut : tuto.html de l'écran) ; options.forcer : toujours montrer.
/** @param {string} ecran @param {string} profil @param {{ aide?: string, forcer?: boolean }} [options] */
export function bienvenue(ecran, profil, options = {}) {
  if (typeof document === 'undefined' || (montre && !options.forcer)) return;
  const c = pointsDe(ecran, profil);
  if (!c) return;
  if (!options.forcer && (lireStock(localStorage, cleMemo(ecran)) === 'non' || lireStock(sessionStorage, cleMemo(ecran)) === 'vu')) return;
  montre = true;
  ecrireStock(sessionStorage, cleMemo(ecran), 'vu');
  const esc = (/** @type {string} */ s) => String(s).replace(/[&<>"]/g, x => (/** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }))[x]);
  const d = document.createElement('dialog');
  d.className = 'bienvenue';
  d.setAttribute('aria-labelledby', 'bienvenue-titre');
  const aide = options.aide === undefined ? 'tuto.html' : options.aide;
  d.innerHTML = `<h2 id="bienvenue-titre">${esc(c.titre)} : comment ça marche</h2>
    <ol>${c.points.map(([t, x]) => `<li><strong>${esc(t)}</strong> — ${esc(x)}</li>`).join('')}</ol>
    <div class="pied"><label><input type="checkbox" id="bienvenue-plus"> Ne plus montrer</label>
      <span>${aide ? `<a href="${esc(aide)}" target="_blank" rel="noopener">Mode d'emploi complet</a>` : ''}
      <button type="button" class="primary" id="bienvenue-ok">Compris</button></span></div>`;
  document.body.appendChild(d);
  const fermer = () => {
    if (/** @type {HTMLInputElement} */ (d.querySelector('#bienvenue-plus')).checked) ecrireStock(localStorage, cleMemo(ecran), 'non');
    d.close(); d.remove();
  };
  /** @type {HTMLElement} */ (d.querySelector('#bienvenue-ok')).addEventListener('click', fermer);
  d.addEventListener('cancel', e => { e.preventDefault(); fermer(); });
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  /** @type {HTMLElement} */ (d.querySelector('#bienvenue-ok')).focus();
}
// Remettre toutes les fenêtres « Comment ça marche » (Mon compte).
export function remettreBienvenues() {
  for (const e of Object.keys(TEXTES)) { try { localStorage.removeItem(cleMemo(e)); sessionStorage.removeItem(cleMemo(e)); } catch (x) { /* rien */ } }
}

if (typeof document !== 'undefined' && !document.getElementById('style-bienvenue')) {
  const st = document.createElement('style'); st.id = 'style-bienvenue';
  st.textContent = `dialog.bienvenue { max-width: min(560px, calc(100vw - 32px)); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px 14px;
  background: var(--bg); color: var(--fg); box-shadow: 0 12px 40px rgba(0,0,0,.25); border-top: 5px solid var(--accent); }
dialog.bienvenue::backdrop { background: rgba(20,10,40,.35); }
dialog.bienvenue h2 { font-size: 17px; margin: 0 0 10px; color: var(--accent); text-transform: none; letter-spacing: 0; }
dialog.bienvenue ol { margin: 0 0 12px; padding-left: 20px; line-height: 1.45; font-size: 14px; }
dialog.bienvenue li { margin-bottom: 6px; }
dialog.bienvenue .pied { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 10px; font-size: 13px; }
dialog.bienvenue .pied > span { display: inline-flex; gap: 12px; align-items: center; }
dialog.bienvenue .pied a { color: var(--accent); }`;
  document.head.appendChild(st);
}
