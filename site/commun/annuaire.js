// @ts-check
// Annuaire de l'éducation (data.education.gouv.fr, jeu « fr-en-annuaire-education », Licence Ouverte 2.0) : fiche d'un
// établissement d'après son UAI (nom, nature, commune, département, e-mail, téléphone, position). Repris de grist-labo-widget.
// Sert à l'import (déclaration `annuaire`, SPEC § 4.5). Parties pures testées (tests/annuaire.test.js).
// Seuls des UAI (codes publics d'établissements) sont envoyés à l'API ; aucune donnée de personne.
import { nombre } from './donnees.js';

export const ANNUAIRE_URL = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';
const CHAMPS_API = 'identifiant_de_l_etablissement,nom_etablissement,libelle_nature,nom_commune,code_postal,code_departement,'
  + 'libelle_departement,mail,telephone,latitude,longitude';

/** @typedef {{ uai: string, nom: string, nature: string, commune: string, codePostal: string, departement: string,
 *   libelleDepartement: string, email: string, telephone: string, lat: number | null, lon: number | null }} FicheAnnuaire */

// UAI : 7 chiffres et une lettre (« 0451442h » → « 0451442H »).
/** @param {any} s */
export const normUai = s => String(s ?? '').replace(/\s+/g, '').toUpperCase();
/** @param {string} u */
export const uaiValide = u => /^\d{7}[A-Z]$/.test(u);

// Adresses des requêtes : par paquets de `taille` UAI (une requête « in (…) » chacune).
/** @param {string[]} uais @param {number} [taille] @returns {string[]} */
export function requetesAnnuaire(uais, taille = 50) {
  const urls = [];
  for (let i = 0; i < uais.length; i += taille) {
    const liste = uais.slice(i, i + taille).map(u => `"${u}"`).join(',');
    urls.push(`${ANNUAIRE_URL}?select=${encodeURIComponent(CHAMPS_API)}`
      + `&where=${encodeURIComponent(`identifiant_de_l_etablissement in (${liste})`)}&limit=100`);
  }
  return urls;
}

// Enregistrement de l'API → fiche. Département sans zéros de tête (« 045 » → « 45 », « 02A » → « 2A »).
/** @param {any} r @returns {FicheAnnuaire} */
export function ficheAnnuaire(r) {
  return {
    uai: normUai(r.identifiant_de_l_etablissement), nom: String(r.nom_etablissement || '').replace(/\s+/g, ' ').trim(),
    nature: String(r.libelle_nature || ''), commune: String(r.nom_commune || ''), codePostal: String(r.code_postal || ''),
    departement: String(r.code_departement || '').trim().toUpperCase().replace(/^0+(?=.)/, ''),
    libelleDepartement: String(r.libelle_departement || ''), email: String(r.mail || ''), telephone: String(r.telephone || ''),
    lat: nombre(r.latitude), lon: nombre(r.longitude),
  };
}

// Une requête, réessayée une fois après une pause (service saturé, requêtes trop rapprochées, coupure du réseau).
// Échec : message lisible, avec l'erreur d'origine (celle du navigateur ou le code HTTP) pour le dépannage.
/** @param {typeof fetch} f @param {string} url @param {number} pause */
async function requeteAnnuaire(f, url, pause) {
  let derniere = '';
  for (let essai = 0; essai < 2; essai++) {
    if (essai) await new Promise(r => setTimeout(r, pause));
    try {
      const rep = await f(url);
      if (rep.ok) return rep;
      derniere = `réponse HTTP ${rep.status}`;
      if (rep.status >= 400 && rep.status < 500 && rep.status !== 429) break;   // requête refusée : inutile de réessayer
    } catch (e) { derniere = `erreur du navigateur : ${(e && /** @type {any} */ (e).message) || e}`; }
  }
  throw new Error(`Annuaire de l'éducation (data.education.gouv.fr) injoignable (${derniere}). Réseau ou pare-feu de `
    + `l'établissement à vérifier ; réessayer plus tard.`);
}

// Interroge l'Annuaire pour ces UAI (valides, sans doublon) : Map UAI → fiche. Erreur si le service ne répond pas.
/**
 * @param {string[]} uais @param {{ fetch?: typeof fetch, progres?: (fait: number, total: number) => void, pause?: number }} [o]
 * @returns {Promise<Map<string, FicheAnnuaire>>}
 */
export async function chercherAnnuaire(uais, o = {}) {
  const f = o.fetch || fetch;
  const valides = [...new Set(uais.map(normUai).filter(uaiValide))];
  const urls = requetesAnnuaire(valides);
  /** @type {Map<string, FicheAnnuaire>} */
  const fiches = new Map();
  for (let i = 0; i < urls.length; i++) {
    if (o.progres) o.progres(i, urls.length);
    const rep = await requeteAnnuaire(f, urls[i], o.pause ?? 2000);
    for (const r of (await rep.json()).results || []) { const fiche = ficheAnnuaire(r); fiches.set(fiche.uai, fiche); }
  }
  return fiches;
}

/**
 * @typedef {object} RegleAnnuaire                 déclaration `annuaire` de l'import
 * @property {string} uai                          colonne du fichier qui donne l'UAI
 * @property {Record<string, keyof FicheAnnuaire>} colonnes   colonne du fichier → champ de la fiche à y mettre
 * @property {'fichier' | 'annuaire'} [priorite]   valeur du fichier gardée si présente (défaut), ou l'Annuaire l'emporte
 */

// Complète les lignes lues avec les fiches : chaque colonne déclarée reçoit le champ de la fiche si elle est vide dans
// le fichier (ou toujours, priorité « annuaire »). UAI invalide ou introuvable : alerte, ligne laissée telle quelle.
/**
 * @param {{ n: number, v: Record<string, any> }[]} lignes @param {Map<string, FicheAnnuaire>} fiches @param {RegleAnnuaire} regle
 * @returns {{ lignes: { n: number, v: Record<string, any> }[], remarques: { niveau: 'alerte' | 'info', ligne?: number, message: string }[], trouves: number }}
 */
export function completerParAnnuaire(lignes, fiches, regle) {
  /** @type {{ niveau: 'alerte' | 'info', ligne?: number, message: string }[]} */
  const remarques = [];
  let trouves = 0;
  const sortie = lignes.map(l => {
    if (!(regle.uai in l.v)) return l;
    const u = normUai(l.v[regle.uai]);
    if (!uaiValide(u)) { remarques.push({ niveau: 'alerte', ligne: l.n, message: `UAI « ${l.v[regle.uai]} » invalide (7 chiffres + 1 lettre) : pas de complément.` }); return l; }
    const fiche = fiches.get(u);
    if (!fiche) { remarques.push({ niveau: 'alerte', ligne: l.n, message: `UAI ${u} introuvable dans l'Annuaire de l'éducation.` }); return l; }
    trouves++;
    const v = { ...l.v, [regle.uai]: u };
    for (const [col, champ] of Object.entries(regle.colonnes)) {
      const x = fiche[champ];
      if (x === null || x === undefined || x === '') continue;
      if (regle.priorite === 'annuaire' || v[col] === undefined) v[col] = x;
    }
    return { n: l.n, v };
  });
  return { lignes: sortie, remarques, trouves };
}

// --- Établissements d'une académie (premier démarrage) ---
// Jeu « Adresse et géolocalisation des établissements d'enseignement du premier et second degrés »
// (data.education.gouv.fr, Licence Ouverte 2.0) : tous les établissements d'une académie, avec sigle, nature, secteur,
// adresse et position. E-mail et téléphone n'y sont pas : complétés ensuite par chercherAnnuaire.
export const GEOLOC_URL = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-adresse-et-geolocalisation-etablissements-premier-et-second-degre';
const CHAMPS_GEOLOC = 'numero_uai,appellation_officielle,denomination_principale,patronyme_uai,secteur_public_prive_libe,adresse_uai,'
  + 'code_postal_uai,libelle_commune,libelle_departement,latitude,longitude,nature_uai,nature_uai_libe,etat_etablissement_libe,sigle';

/** @typedef {{ uai: string, nom: string, sigle: string, secteur: string, adresse: string, codePostal: string, commune: string,
 *   departement: string, lat: number | null, lon: number | null, nature: string, natureCode: number | null, ferme: boolean }} FicheGeoloc */

// Liste des académies (noms exacts du jeu de données), triée.
export const URL_ACADEMIES = `${GEOLOC_URL}/records?select=libelle_academie&group_by=libelle_academie&limit=100`;
/** @param {any} json @returns {string[]} */
export const academiesDe = json => [...new Set(((json && json.results) || []).map((/** @type {any} */ r) => String(r.libelle_academie || '').trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'fr'));
// Établissements du second degré (natures 300 à 399) d'une académie : un seul export, sans limite de nombre.
/** @param {string} academie */
export function urlEtablissementsAcademie(academie) {
  const where = `libelle_academie="${String(academie).replace(/["\\]/g, '')}" and nature_uai>=300 and nature_uai<400`;
  return `${GEOLOC_URL}/exports/json?select=${encodeURIComponent(CHAMPS_GEOLOC)}&where=${encodeURIComponent(where)}`;
}
// Enregistrement → fiche (secteur « Public » ou « Privé », nom : appellation officielle, sinon dénomination + patronyme).
/** @param {any} r @returns {FicheGeoloc} */
export function ficheGeoloc(r) {
  const t = (/** @type {any} */ v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const nom = t(r.appellation_officielle) || [t(r.denomination_principale), t(r.patronyme_uai)].filter(Boolean).join(' ');
  const code = Number(r.nature_uai);
  return { uai: normUai(r.numero_uai), nom, sigle: t(r.sigle), secteur: /priv/i.test(t(r.secteur_public_prive_libe)) ? 'Privé' : 'Public',
    adresse: t(r.adresse_uai), codePostal: t(r.code_postal_uai), commune: t(r.libelle_commune), departement: t(r.libelle_departement),
    lat: nombre(r.latitude), lon: nombre(r.longitude), nature: t(r.nature_uai_libe), natureCode: Number.isFinite(code) ? code : null,
    ferme: /^ferm/i.test(t(r.etat_etablissement_libe)) };
}
// Natures retenues d'office : collèges, lycées (général, technologique, polyvalent, professionnel, agricole), EREA ;
// pas les sections ni les annexes (même établissement qu'un lycée), réglables au cas par cas.
/** @param {string} libelle */
export const natureRetenue = libelle => /coll[eè]ge|lyc[ée]e|erea|enseignement adapt/i.test(libelle) && !/section|annexe|segpa/i.test(libelle);
// Interroge le jeu pour une académie : fiches (fermés écartés), avec un second essai comme l'Annuaire.
/** @param {string} academie @param {{ fetch?: typeof fetch, pause?: number }} [o] @returns {Promise<FicheGeoloc[]>} */
export async function etablissementsAcademie(academie, o = {}) {
  const rep = await requeteAnnuaire(o.fetch || fetch, urlEtablissementsAcademie(academie), o.pause ?? 2000);
  const json = await rep.json();
  return (Array.isArray(json) ? json : (json && json.results) || []).map(ficheGeoloc).filter(f => uaiValide(f.uai) && !f.ferme);
}
// Liste des académies (null si le service ne répond pas).
/** @param {{ fetch?: typeof fetch }} [o] @returns {Promise<string[] | null>} */
export async function listeAcademies(o = {}) {
  try { return academiesDe(await (await requeteAnnuaire(o.fetch || fetch, URL_ACADEMIES, 1000)).json()); } catch (e) { return null; }
}
