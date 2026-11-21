// @ts-check
// Réglages propres à l'académie (APP § 11, 2026-11-15), pour que l'application serve à toute académie : lus dans la
// table Parametres (clés academie, departements, domaine_mail, logo), sinon déduits des établissements versés.
// Logique pure, testée avec Node (tests/commun.test.js). Saisis dans Administration → Académie.
/** @typedef {Record<string, any>} Ligne */

export const CLES_ACADEMIE = ['academie', 'departements', 'domaine_mail', 'logo'];
// Domaine historique (application créée pour Orléans-Tours) : son logo n'est proposé d'office qu'à ce domaine.
export const DOMAINE_ORLEANS = 'ac-orleans-tours.fr';
const txt = (/** @type {any} */ v) => String(v ?? '').trim();
// Département d'un établissement d'après son UAI : 0450939B → « 45 » ; 9710003C (outre-mer) → « 971 ».
/** @param {any} uai */
export function departementDe(uai) {
  const u = txt(uai).toUpperCase();
  if (!/^\d{7}[A-Z]$/.test(u)) return '';
  return /^9[78]/.test(u) ? u.slice(0, 3) : u.slice(1, 3);
}
// Domaine des adresses des établissements : réglé (domaine_mail), sinon le plus fréquent des « ce.<uai>@domaine ».
/** @param {Record<string, string>} params @param {Ligne[]} etabs */
export function domaineMail(params, etabs) {
  const r = txt(params && params.domaine_mail).replace(/^@/, '').toLowerCase();
  if (r) return r;
  /** @type {Map<string, number>} */
  const n = new Map();
  for (const e of etabs || []) {
    const m = /^ce\.[0-9]{7}[a-z]@([a-z0-9.-]+)$/i.exec(txt(e.Mel));
    if (m) n.set(m[1].toLowerCase(), (n.get(m[1].toLowerCase()) || 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
// Adresse d'un établissement : Etablissements.Mel, sinon ce.<uai>@domaine (vide si le domaine est inconnu).
/** @param {any} uai @param {Ligne | undefined} etab @param {string} domaine */
export function mailDe(uai, etab, domaine) {
  const u = txt(uai).toLowerCase();
  return txt(etab && etab.Mel) || (domaine && /^\d{7}[a-z]$/.test(u) ? `ce.${u}@${domaine}` : '');
}
// Départements proposés (filtres d'Emplois du temps) : réglés (« 18 ; 28 ; 36 »), sinon ceux des établissements.
/** @param {Record<string, string>} params @param {Ligne[]} etabs @returns {string[]} */
export function departements(params, etabs) {
  const r = txt(params && params.departements).split(/[;,\s]+/).filter(Boolean);
  if (r.length) return r;
  return [...new Set((etabs || []).map(e => departementDe(e.UAI)).filter(Boolean))].sort();
}
// Logo des rapports : image réglée (data URL), sinon celui d'Orléans-Tours pour ce seul domaine, sinon aucun.
/** @param {Record<string, string>} params @param {string} domaine @param {string} logoOrleans */
export function logoAcademie(params, domaine, logoOrleans) {
  const l = txt(params && params.logo);
  if (/^data:image\//.test(l) || /^https:\/\//.test(l)) return l;
  return domaine === DOMAINE_ORLEANS ? logoOrleans : '';
}
// Nom affiché : « Académie de Lyon » (réglé), sinon déduit du domaine (ac-lyon.fr → « Académie ac-lyon »), sinon ''.
/** @param {Record<string, string>} params */
export const nomAcademie = params => txt(params && params.academie);

// Écritures dans Parametres : une ligne par clé, créée si absente, modifiée si la valeur change.
/**
 * @param {Ligne[]} lignes lignes de Parametres @param {Record<string, string>} valeurs { cle: valeur }
 * @param {Record<string, string>} [descriptions] description d'une clé créée
 */
export function actionsParametres(lignes, valeurs, descriptions = {}) {
  /** @type {any[]} */
  const actions = [];
  for (const [cle, v] of Object.entries(valeurs)) {
    const l = (lignes || []).find(x => txt(x.Cle) === cle);
    if (l) { if (txt(l.Valeur) !== txt(v)) actions.push(['UpdateRecord', 'Parametres', l.id, { Valeur: v }]); }
    else if (txt(v)) actions.push(['AddRecord', 'Parametres', null, { Cle: cle, Valeur: v, Description: descriptions[cle] || '' }]);
  }
  return actions;
}

// Académies (noms de l'Annuaire de l'éducation) : liste de secours si le service ne répond pas.
export const ACADEMIES = ['Aix-Marseille', 'Amiens', 'Besançon', 'Bordeaux', 'Clermont-Ferrand', 'Corse', 'Créteil', 'Dijon', 'Grenoble',
  'Guadeloupe', 'Guyane', 'La Réunion', 'Lille', 'Limoges', 'Lyon', 'Martinique', 'Mayotte', 'Montpellier', 'Nancy-Metz', 'Nantes',
  'Nice', 'Normandie', 'Orléans-Tours', 'Paris', 'Poitiers', 'Reims', 'Rennes', 'Strasbourg', 'Toulouse', 'Versailles'];
// Domaine des adresses de l'académie, d'après son nom (Annuaire de l'éducation) : « Orléans-Tours » → ac-orleans-tours.fr ;
// quelques exceptions connues. Proposé seulement : modifiable (Administration → Académie).
const DOMAINES_PARTICULIERS = { 'clermont-ferrand': 'ac-clermont.fr', 'la-reunion': 'ac-reunion.fr', 'reunion': 'ac-reunion.fr' };
/** @param {any} academie */
export function domaineAcademie(academie) {
  const slug = txt(academie).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? DOMAINES_PARTICULIERS[slug] || `ac-${slug}.fr` : '';
}

// Disciplines proposées au premier démarrage (« Autre » : saisie libre). La discipline s'imprime dans le tableau
// d'identification, la dernière ligne de l'en-tête et le bas de page des rapports.
export const DISCIPLINES = ['Mathématiques', 'Physique-chimie', 'Sciences de la vie et de la Terre', 'Numérique et sciences informatiques',
  'Lettres', 'Histoire-géographie', 'Philosophie', 'Anglais', 'Allemand', 'Espagnol', 'Italien', 'Langues vivantes',
  'Sciences économiques et sociales', 'Économie et gestion', 'Sciences et techniques industrielles', 'Biotechnologies',
  'Technologie', 'Éducation physique et sportive', 'Arts plastiques', 'Éducation musicale', 'Établissements et vie scolaire'];
// « de mathématiques », « d'anglais », « d'éducation musicale ».
/** @param {any} discipline */
export function deDiscipline(discipline) {
  const d = txt(discipline).toLowerCase();
  return /^[aeiouyhàâéèêëîïôöûü]/.test(d) ? `d'${d}` : `de ${d}`;
}
// Paramètres écrits pour une discipline : discipline, en-tête (sa dernière ligne = la discipline) et bas de page.
/** @param {any} discipline @param {any} entete en-tête actuel (Parametres.entete) */
export function parametresDiscipline(discipline, entete) {
  const d = txt(discipline);
  const lignes = txt(entete).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const base = lignes.length >= 3 ? lignes.slice(0, -1) : ['Inspection académique', 'Inspection pédagogique régionale'];
  return { discipline: d, entete: [...base, d].join('\n'), pied: `RAPPORT DE VISITE - inspection ${deDiscipline(d)}` };
}

// Premier démarrage (Administration) : étapes, faites ou non, dans l'ordre.
/**
 * @param {{ params: Record<string, string>, etabs: Ligne[], profs: Ligne[], chiffrement: boolean | null,
 *   utilisateurs: Ligne[], structure: { tables: string[], colonnes: string[] } | null,
 *   regleChiffrement?: 'ok' | 'manquante' | 'sans-regles' | null }} d
 *   chiffrement : null = application sans chiffrement ; structure : null = non vérifiée ; regleChiffrement : null =
 *   règles illisibles (compte non propriétaire) ou table Chiffrement absente
 */
export function etapesDemarrage(d) {
  const comptes = (d.utilisateurs || []).filter(u => u.Actif === true);
  const e = [
    { cle: 'structure', titre: 'Structure du document à jour', onglet: 'controles',
      fait: !!d.structure && !d.structure.tables.length && !d.structure.colonnes.length,
      detail: d.structure ? (d.structure.tables.length + d.structure.colonnes.length ? 'Page « Installer » → « Créer la structure »' : '') : 'non vérifiée' },
    { cle: 'academie', titre: 'Académie et logo', onglet: 'academie',
      fait: !!nomAcademie(d.params) && !!logoAcademie(d.params, domaineMail(d.params, d.etabs), 'x'),
      detail: 'nom, logo des rapports, domaine des mails' },
  ];
  if (d.chiffrement !== null) e.push({ cle: 'chiffrement', titre: 'Phrase de chiffrement', onglet: 'chiffrement', fait: !!d.chiffrement, detail: 'à garder précieusement : sans elle, rapports illisibles' });
  if (d.regleChiffrement) e.push({ cle: 'revele', titre: '« Révéler » ouvert aux IA-IPR et CMi', onglet: 'chiffrement', fait: d.regleChiffrement === 'ok',
    detail: d.regleChiffrement === 'ok' ? 'règle d\'accès de la table Chiffrement en place'
      : d.regleChiffrement === 'manquante' ? 'règle d\'accès à ajouter (onglet Chiffrement)' : 'règles d\'accès pas encore écrites (page Installer, volet 3)' });
  e.push(
    { cle: 'siiprien', titre: 'Fichier Siiprien des professeur·es', onglet: 'import', fait: (d.profs || []).length > 0 && (d.etabs || []).length > 0,
      detail: `${(d.profs || []).length} professeur·es, ${(d.etabs || []).length} établissements` },
    { cle: 'comptes', titre: 'Comptes des CMi et IA-IPR', onglet: 'utilisateurs', fait: comptes.length > 1, detail: `${comptes.length} compte${comptes.length > 1 ? 's' : ''} actif${comptes.length > 1 ? 's' : ''}` },
  );
  return e;
}
