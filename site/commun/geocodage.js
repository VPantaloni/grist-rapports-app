// @ts-check
// Géocodage par le service de la Géoplateforme de l'IGN (data.geopf.fr, sans clé) : position d'une adresse ou d'une
// commune. Repris de grist-rdvc-app. Parties pures testées (tests/geocodage.test.js).
// Seules des adresses de lieux (établissements, communes) sont envoyées ; jamais l'adresse d'une personne.
import { norm } from './donnees.js';

export const GEOCODAGE_URL = 'https://data.geopf.fr/geocodage/search';
// Délai entre deux requêtes : le service limite le nombre de requêtes par seconde.
export const PAUSE_MS = 150;

/** @typedef {{ label: string, precision: string, lat: number, lon: number, score: number, communeOk: boolean,
 *   commune: string, codePostal: string, contexte: string }} ResultatGeocodage */

// Commune sans « CEDEX » ni numéro de distribution (« Orléans CEDEX 2 » → « Orléans »).
/** @param {any} v */
export const sansCedex = v => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/\s+CEDEX(\s*\d+)?$/i, '').trim();

// Position absente, illisible, ou (0, 0) (valeur d'une colonne Numérique jamais remplie) : à placer.
/** @param {any} lat @param {any} lon */
export function sansCoordonnees(lat, lon) {
  const ok = /** @param {any} v */ v => typeof v === 'number' && Number.isFinite(v);
  return !ok(lat) || !ok(lon) || (lat === 0 && lon === 0) || Math.abs(lat) > 90 || Math.abs(lon) > 180;
}

// Adresse de la requête. type : '' (adresse, rue, lieu) ou 'municipality' (communes seulement).
/** @param {string} q @param {{ type?: string, limite?: number }} [o] */
export function urlGeocodage(q, o = {}) {
  return `${GEOCODAGE_URL}?q=${encodeURIComponent(q)}&index=address${o.type ? `&type=${o.type}` : ''}&limit=${o.limite || 6}`;
}

// Réponse du service → résultats sans doublon, du plus probable au moins probable. communeOk : la commune trouvée est
// celle attendue (« CEDEX », accents et casse ignorés).
/** @param {any} json @param {string} [commune] @returns {ResultatGeocodage[]} */
export function resultatsGeocodage(json, commune = '') {
  /** @type {ResultatGeocodage[]} */
  const res = [];
  const vus = new Set();
  for (const ft of (json && json.features) || []) {
    const p = ft.properties || {}, c = (ft.geometry && ft.geometry.coordinates) || [];
    const lon = Number(c[0]), lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = p.label || p.city || p.name || '';
    if (!label || vus.has(label)) continue;
    vus.add(label);
    const precision = p.type === 'housenumber' ? 'adresse' : p.type === 'street' ? 'rue'
      : p.type === 'municipality' ? 'centre de la commune' : 'lieu-dit';
    res.push({ label, precision, lat, lon, score: Number(p.score) || 0, commune: p.city || p.name || '', codePostal: p.postcode || '',
      contexte: p.context || '', communeOk: !commune || norm(sansCedex(p.city)) === norm(sansCedex(commune)) });
  }
  return res;
}

// Résultat retenu automatiquement : le premier, s'il est dans la bonne commune et assez sûr ; sinon null (à choisir à
// la main).
/** @param {ResultatGeocodage[]} res @param {number} [scoreMin] */
export function choixAutomatique(res, scoreMin = 0.5) {
  const r = res[0];
  return r && r.communeOk && r.score >= scoreMin ? r : null;
}

// Interroge le service (une requête). Erreur si le service ne répond pas.
/**
 * @param {string} q @param {{ commune?: string, type?: string, limite?: number, fetch?: typeof fetch, signal?: AbortSignal }} [o]
 * @returns {Promise<ResultatGeocodage[]>}
 */
export async function geocoder(q, o = {}) {
  const rep = await (o.fetch || fetch)(urlGeocodage(q, o), o.signal ? { signal: o.signal } : undefined);
  if (!rep.ok) throw new Error(`Service de géocodage indisponible (HTTP ${rep.status}).`);
  return resultatsGeocodage(await rep.json(), o.commune || '');
}

/**
 * @typedef {object} RegleGeocodage                déclaration `geocodage` de l'import
 * @property {string[]} adresse                     colonnes du fichier mises bout à bout (ex. ['adresse', 'commune'])
 * @property {string} [commune]                     colonne de la commune attendue (contrôle du résultat)
 * @property {string} lat                           colonnes du fichier qui reçoivent la position
 * @property {string} lon
 * @property {number} [scoreMin]                    score minimal du choix automatique (0.5 par défaut)
 */

// Lignes à géocoder (sans position valide), avec leur requête ; une même requête n'est faite qu'une fois.
/** @param {{ n: number, v: Record<string, any> }[]} lignes @param {RegleGeocodage} regle */
export function requetesAGeocoder(lignes, regle) {
  /** @type {Map<string, { q: string, commune: string, lignes: number[] }>} */
  const parRequete = new Map();
  for (const l of lignes) {
    if (!sansCoordonnees(l.v[regle.lat], l.v[regle.lon])) continue;
    const q = regle.adresse.map(c => (c === regle.commune ? sansCedex(l.v[c]) : String(l.v[c] ?? '').trim())).filter(Boolean).join(' ');
    if (q.length < 3) continue;
    const k = norm(q);
    if (!parRequete.has(k)) parRequete.set(k, { q, commune: regle.commune ? sansCedex(l.v[regle.commune]) : '', lignes: [] });
    parRequete.get(k)?.lignes.push(l.n);
  }
  return [...parRequete.values()];
}

// Positions trouvées → lignes : position écrite si le choix automatique est sûr ; sinon alerte (à placer à la main).
/**
 * @param {{ n: number, v: Record<string, any> }[]} lignes @param {RegleGeocodage} regle
 * @param {{ q: string, lignes: number[], res: ResultatGeocodage[] | null, erreur?: string }[]} reponses
 */
export function appliquerGeocodage(lignes, regle, reponses) {
  /** @type {Map<number, ResultatGeocodage>} */
  const choix = new Map();
  /** @type {{ niveau: 'alerte' | 'info', ligne?: number, message: string }[]} */
  const remarques = [];
  for (const r of reponses) {
    const c = r.res ? choixAutomatique(r.res, regle.scoreMin) : null;
    for (const n of r.lignes) {
      if (c) choix.set(n, c);
      else remarques.push({ niveau: 'alerte', ligne: n, message: r.erreur ? `Position de « ${r.q} » : ${r.erreur}`
        : r.res && r.res[0] ? `Position de « ${r.q} » incertaine (${r.res[0].label}, ${r.res[0].communeOk ? 'score faible' : 'autre commune'}) : non écrite, à placer dans les Contrôles.`
          : `Position de « ${r.q} » introuvable : à placer dans les Contrôles.` });
    }
  }
  return {
    lignes: lignes.map(l => { const c = choix.get(l.n); return c ? { n: l.n, v: { ...l.v, [regle.lat]: c.lat, [regle.lon]: c.lon } } : l; }),
    remarques, places: choix.size,
  };
}
