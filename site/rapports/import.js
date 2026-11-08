// @ts-check
// Import d'un ancien rapport collé depuis Word (ou le texte d'un PDF) : logique pure, testée avec Node
// (tests/rapports-import.test.js). Spécification : specifications/ecrans/rapports.md, « Import d'un ancien rapport ».
// Le texte est lu tel qu'il est (aucune coquille corrigée) : en-tête par ses libellés, puis blocs de texte répartis dans
// les rubriques du type ; l'écran montre le résultat pour vérification avant l'enregistrement.
import { norm } from '../commun/donnees.js';

/** @typedef {Record<string, any>} Ligne */

// Libellés de l'en-tête (« Libellé : valeur », valeur parfois à la ligne suivante ou dans la case suivante).
const LIBELLES = [
  ['prof', /^nom(?: et pr[ée]nom)? du professeur(?:·?e)?$/],
  ['prof', /^(?:professeur(?:·?e)?|enseignant(?:·?e)?)$/],
  ['statut', /^statut$/],
  ['echelon', /^[ée]chelon$/],
  ['discipline', /^discipline$/],
  ['etab', /^(?:coordonn[ée]es (?:de l'?)?[ée]tablissement|[ée]tablissement)$/],
  ['date', /^date de (?:la )?visite$/],
  ['cmi', /^nom d[eu] (?:la |le )?charg[ée]e? de mission$/],
  ['ipr', /^nom de l'?inspect(?:eur|rice)(?:·?trice)?$/],
  ['classe', /^classe$/],
  ['effectif', /^effectif$/],
  ['heure', /^heure$/],
  ['theme', /^th[èe]me(?: de la s[ée]ance)?$/],
];
const IGNORER = /^(inspection acad[ée]mique|inspection p[ée]dagogique r[ée]gionale|math[ée]matiques|rapport de visite.*|acad[ée]mie.*)$/i;
const FIN = /^(pris connaissance|l['’]int[ée]ress[ée]|le charg[ée] de mission|la charg[ée]e de mission|l['’]ia-ipr|l['’]inspect)/i;
// Titres de partie reconnus dans le corps : rattachés à une rubrique par son code ou son titre.
const TITRES = [
  { re: /^(?:rapide )?(?:pr[ée]sentation|description)(?: de la s[ée]ance)?\s*:?$/i, cle: 'seance' },
  { re: /^entretien.*$/i, cle: 'entretien' },
  { re: /^bilan par comp[ée]tences?\s*:?$/i, cle: 'competences' },
  { re: /^pr[ée]-?conclusion\s*:?$/i, cle: 'preconclusion' },
  { re: /^(?:bilan|conclusion)\s*:?$/i, cle: 'bilan' },
  { re: /^(?:les )?conseils.*$/i, cle: 'conseils' },
];
const PUCE = /^[•●▪◦‣\-–*]\s*/;

const nettoyer = (/** @type {string} */ t) => t.replace(/\u00a0/g, ' ').replace(/[ \f\v]+/g, ' ').trim();
const cleLib = (/** @type {string} */ t) => norm(t).replace(/[’]/g, "'").replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').trim();

// Date « 24/01/2022 », « 24-01-22 », « 24 janvier 2022 » → AAAA-MM-JJ.
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
/** @param {any} t @returns {string} */
export function lireDate(t) {
  const s = norm(t);
  let m = s.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/);
  let j, mo, a;
  if (m) { j = +m[1]; mo = +m[2]; a = +m[3]; } else {
    m = s.match(/(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})/);
    if (!m) return '';
    j = +m[1]; mo = MOIS.indexOf(m[2]) + 1; a = +m[3];
    if (!mo) return '';
  }
  if (a < 100) a += 2000;
  if (!(mo >= 1 && mo <= 12 && j >= 1 && j <= 31)) return '';
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}
// « M. Antoine ANONYME », « ANONYME2 Mouloud », « Mme Ada DE LA TOUR » : nom = mots en capitales, prénom = le reste.
/** @param {any} t */
export function lireNomPrenom(t) {
  let s = nettoyer(String(t || ''));
  let civilite = '';
  const c = s.match(/^(M\.|Mr\.?|Monsieur|Mme\.?|Madame|Mlle\.?)\s+/i);
  if (c) { civilite = /^m(\.|r|onsieur)/i.test(c[1]) && !/^mme|^madame|^mlle/i.test(c[1]) ? 'M.' : 'Mme'; s = s.slice(c[0].length); }
  const mots = s.split(/\s+/).filter(Boolean);
  const maj = (/** @type {string} */ m) => /\p{L}/u.test(m) && m === m.toUpperCase() && m.replace(/[^\p{L}]/gu, '').length >= 2;
  const nom = mots.filter(maj), prenom = mots.filter(m => !maj(m));
  if (!nom.length && mots.length > 1) return { civilite, nom: mots[mots.length - 1].toUpperCase(), prenom: mots.slice(0, -1).join(' ') };
  return { civilite, nom: nom.join(' '), prenom: prenom.join(' ') };
}
// « Lycée … à Gien   UAI 0450106W » → nom, commune, UAI.
/** @param {any} t */
export function lireEtab(t) {
  let s = nettoyer(String(t || ''));
  const u = s.match(/\b(\d{7}[A-Za-z])\b/);
  const uai = u ? u[1].toUpperCase() : '';
  s = s.replace(/\(?\s*(?:UAI|RNE)?\s*:?\s*\d{7}[A-Za-z]\s*\)?/i, '').replace(/[\s,–-]+$/, '').trim();
  const a = s.match(/^(.*\S)\s+(?:à|a)\s+([A-ZÉÈÀÂÎÔ][\p{L}' -]+)$/u);
  return a ? { nom: a[1].trim(), commune: a[2].trim(), uai } : { nom: s, commune: '', uai };
}
// Statut du rapport → type proposé.
/** @param {string} statut @param {string} texte */
export function typeImporte(statut, texte = '') {
  const s = norm(`${statut} ${texte.slice(0, 400)}`);
  if (/ma[iî]tre(?:sse)?\s*d[ée]l[ée]gu|\bmd\d?\b/.test(s)) return 'MD';
  if (/stagiaire|\bpstg\b|\bstg\b/.test(s)) return 'PSTG';
  return 'CLASSIQUE';
}

/** @typedef {{ titre: string, cle: string, texte: string }} Bloc */
/** @typedef {{ champs: Record<string, string>, blocs: Bloc[], alertes: string[] }} Lecture */
// Lecture du texte collé : champs de l'en-tête, puis blocs du corps (séparés par une ligne vide ou un titre reconnu).
/** @param {string} texte @returns {Lecture} */
export function lireCollage(texte) {
  const lignes = String(texte || '').replace(/\r\n?/g, '\n').split('\n');
  /** @type {Record<string, string>} */
  const champs = {};
  const alertes = [];
  let i = 0, attente = '';
  // En-tête : chaque ligne coupée en cases (tabulations de Word) ; « Libellé : valeur » ou « Libellé : » + case suivante.
  const poser = (/** @type {string} */ k, /** @type {string} */ v) => { v = nettoyer(v); if (v && !champs[k]) champs[k] = v; };
  for (; i < lignes.length; i++) {
    const brute = lignes[i];
    if (!nettoyer(brute)) continue;
    const annee = brute.match(/ann[ée]e scolaire\s*:?\s*(\d{4})\s*[-/–]\s*(\d{4})/i);
    if (annee) { champs.annee = `${annee[1]}-${annee[2]}`; continue; }
    const cases = brute.split(/\t+| {3,}/).map(nettoyer).filter(Boolean);
    let lue = false, corps = false;
    for (const c of cases) {
      if (IGNORER.test(c)) { lue = true; continue; }
      const m = c.match(/^([^:]{2,60}?)\s*:\s*(.*)$/);
      const k = m ? (LIBELLES.find(([, re]) => re.test(cleLib(m[1]))) || [])[0] : '';
      if (k) {
        lue = true;
        if (m[2]) {
          // « Statut : … » et « Effectif : 30 » peuvent partager une case ; « Professeur certifié stagiaire Echelon : 4 »
          poser(k, m[2]); attente = '';
        } else attente = k;
        continue;
      }
      const u = c.match(/^(?:UAI|RNE)\s*:?\s*(\d{7}[A-Za-z])$/i);
      if (u) { poser('uai', u[1].toUpperCase()); lue = true; continue; }
      const e = c.match(/^(.*?)\s*[ée]chelon\s*:?\s*(\d{1,2})\b/i);
      if (e) { if (e[1]) poser('statut', e[1]); poser('echelon', e[2]); lue = true; attente = ''; continue; }
      if (attente) { poser(attente, c); attente = ''; lue = true; continue; }
      if (!champs.statut && champs.prof && !champs.date && c.length < 80 && /professeur|enseignant|stagiaire|certifi|agr[ée]g|ma[iî]tre|contractuel|titulaire/i.test(c)) {
        poser('statut', c); lue = true; continue;
      }
      if (c.length > 60 || /[.!?]$/.test(c)) { corps = true; break; }
      lue = true;   // ligne courte d'en-tête non reconnue (logo, sigle) : ignorée
    }
    if (corps || (!lue && Object.keys(champs).length > 2)) break;
    if (champs.theme && !attente) { i++; break; }
  }
  // Corps : jusqu'aux signatures ; blocs séparés par une ligne vide ou un titre reconnu.
  /** @type {Bloc[]} */
  const blocs = [];
  let cur = /** @type {Bloc | null} */ (null);
  const fermer = () => { if (cur && cur.texte.trim()) blocs.push({ ...cur, texte: cur.texte.trim() }); cur = null; };
  for (; i < lignes.length; i++) {
    const l = nettoyer(lignes[i].replace(/\t/g, ' '));
    if (!l) { fermer(); continue; }
    if (FIN.test(l) && l.length < 160) break;
    const t = l.length <= 60 && !/[.;,]$/.test(l) ? TITRES.find(x => x.re.test(l)) : null;
    if (t) { fermer(); cur = { titre: l.replace(/\s*:$/, ''), cle: t.cle, texte: '' }; continue; }
    const ligne = PUCE.test(l) ? `• ${l.replace(PUCE, '')}` : l;
    if (!cur) cur = { titre: '', cle: '', texte: '' };
    cur.texte += (cur.texte ? '\n' : '') + ligne;
  }
  fermer();
  // Civilité absente de l'en-tête : « M. NOM » ou « Madame NOM » dans le texte.
  const np = lireNomPrenom(champs.prof || '');
  if (!np.civilite && np.nom) {
    const re = new RegExp(`\\b(M\\.|Monsieur|Mme|Madame)\\s+${np.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const m = blocs.map(b => b.texte).join('\n').match(re);
    if (m) champs.civilite = /^m(\.|onsieur)/i.test(m[1]) ? 'M.' : 'Mme';
  }
  const iso = lireDate(champs.date || '');
  if (champs.annee && iso && anneeDeIso(iso) !== champs.annee)
    alertes.push(`La date de visite (${champs.date}) n'est pas dans l'année scolaire de l'en-tête (${champs.annee}) : vérifier.`);
  if (!champs.prof) alertes.push('Nom du ou de la professeur·e non trouvé : à saisir.');
  if (!champs.date) alertes.push('Date de la visite non trouvée : à saisir.');
  if (!blocs.length) alertes.push('Aucun texte trouvé après l\'en-tête.');
  return { champs, blocs, alertes };
}

// Année scolaire d'une date AAAA-MM-JJ (rentrée en août).
/** @param {string} iso */
export const anneeDeIso = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); if (!m) return ''; const a = +m[1] - (+m[2] < 8 ? 1 : 0); return `${a}-${a + 1}`; };

// Répartition des blocs dans les rubriques du type : titre reconnu → rubrique du même code (ou de titre voisin) ;
// « En conclusion… » → bilan / pré-conclusion ; sinon, la rubrique suivante dans l'ordre (la dernière reçoit le reste).
/** @param {Bloc[]} blocs @param {{ code: string, titre: string }[]} rubriques @returns {string[]} code de rubrique par bloc */
export function repartir(blocs, rubriques) {
  const codes = rubriques.map(r => r.code);
  const parCle = (/** @type {string} */ cle, /** @type {string} */ titre) => {
    if (!cle && !titre) return -1;
    const t = norm(titre);
    let k = cle ? codes.findIndex(c => norm(c) === cle) : -1;
    if (k < 0 && cle === 'bilan') k = codes.findIndex(c => /conclu|^bilan$/.test(norm(c)));
    if (k < 0 && cle === 'competences') k = codes.findIndex(c => /comp/.test(norm(c)));
    if (k < 0 && cle) k = codes.findIndex(c => norm(c).startsWith(cle));
    if (k < 0 && t) k = rubriques.findIndex(r => norm(r.titre) === t || (t.length >= 8 && (norm(r.titre).startsWith(t) || t.startsWith(norm(r.titre)))));
    return k;
  };
  const conclusion = codes.findIndex(c => /^(bilan|preconclusion|pre-conclusion|conclusion)$/.test(norm(c)));
  let pos = -1;
  return blocs.map(b => {
    let k = parCle(b.cle, b.titre);
    if (k < 0 && /^(en conclusion|en resume|pour conclure|au final|en definitive)/.test(norm(b.texte)) && conclusion >= 0) k = conclusion;
    if (k < 0) k = Math.min(pos + 1, codes.length - 1);
    if (k >= 0) pos = Math.max(pos, k);
    return codes[k] || '';
  });
}
// Contenu { code : texte } : blocs d'une même rubrique réunis (une ligne vide entre deux) ; titre du bloc gardé en tête
// quand il ne correspond pas au titre de la rubrique.
/** @param {Bloc[]} blocs @param {string[]} codes @param {{ code: string, titre: string }[]} rubriques */
export function contenuImporte(blocs, codes, rubriques) {
  /** @type {Record<string, string>} */
  const c = {};
  blocs.forEach((b, i) => {
    const code = codes[i];
    if (!code) return;
    const r = rubriques.find(x => x.code === code);
    const titre = b.titre && r && norm(r.titre).startsWith(norm(b.titre)) ? '' : b.titre;
    const t = (titre ? `${titre}\n` : '') + b.texte;
    c[code] = c[code] ? `${c[code]}\n\n${t}` : t;
  });
  return c;
}
// Personne (CMi, IA-IPR) d'après « Prénom NOM » (ordre indifférent).
/** @param {string} t @param {Ligne[]} personnes */
export function trouverPersonne(t, personnes) {
  const cle = (/** @type {any} */ x) => norm(x).replace(/[^a-z' -]/g, ' ').split(/[\s-]+/).filter(Boolean).sort().join(' ');
  const c = cle(t);
  return c ? personnes.find(p => cle(`${p.Prenom} ${p.Nom}`) === c) || null : null;
}
// Professeur·es du fichier portant ce nom (et ce prénom s'il est connu), les plus proches d'abord (même UAI).
/** @param {{ nom: string, prenom: string, uai?: string }} x @param {Ligne[]} profs */
export function candidatsProf(x, profs) {
  const n = norm(x.nom).replace(/[\s'-]+/g, ' '), p = norm(x.prenom).replace(/[\s'-]+/g, ' ');
  if (!n) return [];
  return profs.filter(y => norm(y.Nom).replace(/[\s'-]+/g, ' ') === n && (!p || norm(y.Prenom).replace(/[\s'-]+/g, ' ') === p))
    .sort((a, b) => Number(String(b.UAI) === x.uai) - Number(String(a.UAI) === x.uai));
}
// Contrôle avant enregistrement.
/** @param {{ nom: string, date: string, type: string, ipr: number }} x */
export function validerImport(x) {
  const e = [];
  if (!String(x.nom || '').trim()) e.push('Nom du ou de la professeur·e à indiquer.');
  if (!x.date) e.push('Date de la visite à indiquer.');
  if (!x.type) e.push('Type de rapport à choisir.');
  if (!x.ipr) e.push('IA-IPR à choisir (fiche de l\'annuaire).');
  return e;
}
