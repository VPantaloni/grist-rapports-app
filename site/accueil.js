// @ts-check
// Logique pure de la page d'accueil (sans DOM) : testable avec Node (tests/accueil.test.js).

// Adresse d'une page Grist en mode épuré (sans l'interface de Grist, modifiable selon les droits) :
// on garde le chemin de la page et on remplace paramètres et ancre par « ?style=singlePage ».
/** @param {string} url @returns {string} */
export function lienEpure(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Adresse non https : ' + url);
  return `${u.origin}${u.pathname}?style=singlePage`;
}

// Document transmis par le bouton Accueil de l'application (n° 3) : fragment « #g=… », JSON compact
// { d: adresse du document, p: { dossier: n° de page } } encodé en base64url (masqué à l'œil, pas secret).
// Tout est vérifié : site de la liste `sites`, chemin …/o/<espace>/<document>/<libellé>, pages entières pour les seuls
// dossiers de `dossiers`. Sinon null (la page garde la démonstration).
/**
 * @param {string} hash @param {string[]} sites @param {string[]} dossiers
 * @returns {{ document: string, pages: Record<string, string> } | null}
 */
export function lireDocumentAccueil(hash, sites, dossiers) {
  const m = /^#g=([A-Za-z0-9_-]{1,2000})$/.exec(String(hash || ''));
  if (!m) return null;
  let donnees;
  try {
    const b = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    donnees = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(b, c => c.charCodeAt(0))));
  } catch (e) { return null; }
  if (!donnees || typeof donnees.d !== 'string') return null;
  let u;
  try { u = new URL(donnees.d); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !sites.includes(u.hostname) || u.port || u.username || u.password
    || u.search || u.hash || !/^\/o\/[a-z0-9-]+\/[A-Za-z0-9]+\/[A-Za-z0-9-]+$/.test(u.pathname)) return null;
  const document = u.origin + u.pathname;
  /** @type {Record<string, string>} */
  const pages = {};
  const p = donnees.p && typeof donnees.p === 'object' ? donnees.p : {};
  for (const dossier of dossiers) {
    const n = p[dossier];
    if (Number.isInteger(n) && n > 0 && n < 1e6) pages[dossier] = `${document}/p/${n}`;
  }
  return { document, pages };
}
