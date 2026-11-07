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

// Interroge l'Annuaire pour ces UAI (valides, sans doublon) : Map UAI → fiche. Erreur si le service ne répond pas.
/**
 * @param {string[]} uais @param {{ fetch?: typeof fetch, progres?: (fait: number, total: number) => void }} [o]
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
    const rep = await f(urls[i]);
    if (!rep.ok) throw new Error(`Annuaire de l'éducation indisponible (HTTP ${rep.status}).`);
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
