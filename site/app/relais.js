// @ts-check
// Relais de l'API Grist pour les écrans hébergés par le conteneur (SPEC § 6.2) : testable avec Node (tests/relais.test.js).
// Chaque écran, dans son cadre (même site), appelle window.parent.appHote.api(window) et reçoit un objet « grist »
// réduit à ce qu'utilisent les écrans : ready, onRecords, docApi.fetchTable, docApi.applyUserActions.
// Les appels passent par l'API du conteneur : identité et règles d'accès de la personne connectée.
// En plus : cache partagé des lectures, lien entre écrans, état partagé entre écrans (SPEC § 6.2).

/**
 * @typedef {object} OptionsRelais
 * @property {() => GristApi} api                 API Grist du conteneur (window.grist)
 * @property {(cle: string) => boolean} dansMenu  écran présent dans le menu de la personne connectée ?
 * @property {(cle: string) => void} ouvrir       affiche l'écran (crée son cadre au besoin)
 * @property {(fenetre: object) => string} cleDe  clé de l'écran dont le cadre contient cette fenêtre ('' si aucun)
 * @property {() => { page: string, diag: string }} [adresse]  adresse de la page Application (diagnostic)
 * @property {string[]} [tablesStables]           tables gardées en cache jusqu'à une écriture ou viderCache()
 * @property {number} [dureeCache]                durée de vie d'une lecture en cache, en ms (1000 par défaut)
 * @property {() => number} [maintenant]          horloge (tests)
 * @property {(cle: string, actif: boolean) => Promise<string> | string} [pleinEcran]  plein écran demandé par un écran
 */

/** @param {OptionsRelais} o */
export function creerRelais(o) {
  const maintenant = o.maintenant || (() => Date.now());
  const dureeCache = o.dureeCache ?? 1000;
  const stables = new Set(o.tablesStables || []);
  /** @type {Map<object, Function[]>} fenêtre de l'écran → rappels onRecords */
  const abonnes = new Map();
  /** @type {Record<string, object | null>} clé d'écran → demande en attente (ex. { projet: 12 }) */
  const demandes = {};
  /** @type {Map<string, { promesse: Promise<Colonnes>, t: number }>} table → lecture en cours ou récente */
  const cache = new Map();
  /** @type {Map<string, any>} état partagé : clé → valeur (en mémoire, le temps de la page) */
  const etat = new Map();
  /** @type {Map<object, Map<string, Function[]>>} fenêtre → clé d'état → rappels */
  const suivis = new Map();

  // Lecture partagée : une lecture identique en cours ou récente (dureeCache) est reprise ; une table stable est
  // gardée jusqu'à viderCache(). Une lecture en échec n'est pas gardée.
  /** @param {string} table @returns {Promise<Colonnes>} */
  function lire(table) {
    const c = cache.get(table);
    if (c && (stables.has(table) || maintenant() - c.t < dureeCache)) return c.promesse;
    const promesse = o.api().docApi.fetchTable(table);
    cache.set(table, { promesse, t: maintenant() });
    promesse.catch(() => { if (cache.get(table)?.promesse === promesse) cache.delete(table); });
    return promesse;
  }

  // Vide le cache : tout, ou seulement les tables qui ne sont pas stables (relecture périodique).
  /** @param {{ saufStables?: boolean }} [options] */
  function viderCache(options = {}) {
    for (const t of [...cache.keys()]) if (!(options.saufStables && stables.has(t))) cache.delete(t);
  }

  /** @param {string} cle @param {any} valeur @param {object | null} [source] fenêtre qui écrit (pas prévenue) */
  function ecrireEtat(cle, valeur, source = null) {
    etat.set(cle, valeur);
    for (const [f, parCle] of suivis) {
      if (f === source) continue;
      for (const r of parCle.get(cle) || []) { try { r(valeur); } catch (e) { /* écran fermé ou en erreur */ } }
    }
  }
  /** @param {object} fenetre @param {string} cle @param {Function} rappel */
  function suivreEtat(fenetre, cle, rappel) {
    if (!suivis.has(fenetre)) suivis.set(fenetre, new Map());
    const parCle = /** @type {Map<string, Function[]>} */ (suivis.get(fenetre));
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle)?.push(rappel);
  }

  const hote = {
    /** @param {object} fenetre */
    api(fenetre) {
      return {
        ready() { /* le conteneur a déjà fait grist.ready (accès complet) */ },
        /** @param {Function} rappel */
        onRecords(rappel) {
          if (!abonnes.has(fenetre)) abonnes.set(fenetre, []);
          abonnes.get(fenetre)?.push(rappel);
        },
        docApi: {
          fetchTable: lire,
          /** @param {any[]} actions */
          applyUserActions: async actions => {
            try { return await o.api().docApi.applyUserActions(actions); }
            finally { viderCache(); }   // écriture (réussie ou non) : les prochaines lectures repartent de Grist
          },
        },
      };
    },
    // Relecture demandée par un écran (bouton ↻) : tout le cache, tables stables comprises.
    viderCache: () => viderCache(),
    // Passage d'un écran à l'autre (APP § 9) : seulement vers un écran du menu de la personne connectée.
    /** @param {string} cle */
    peutOuvrir: cle => o.dansMenu(cle),
    /** @param {string} cle @param {object} [demande] */
    ouvrirEcran(cle, demande) {
      if (!o.dansMenu(cle)) return false;
      demandes[cle] = demande || null;
      o.ouvrir(cle);   // nouveau cadre : l'écran prend la demande à son chargement ; sinon il est prévenu et relit
      return true;
    },
    // Adresse reconstituée de la page Grist de l'application ('' si introuvable) : diagnostic de l'Administration.
    adressePage: () => (o.adresse ? o.adresse().page : ''),
    diagAdresse: () => (o.adresse ? o.adresse().diag : ''),
    // L'écran récupère (une seule fois) la demande qui l'a ouvert, ou null.
    /** @param {object} fenetre */
    prendreDemande(fenetre) {
      const cle = o.cleDe(fenetre);
      const d = cle ? demandes[cle] : null;
      if (cle) delete demandes[cle];
      return d || null;
    },
    // État partagé entre les écrans (ex. clé de déchiffrement, n° 8) : lireEtat(cle), ecrireEtat(cle, valeur, fenetre),
    // suivreEtat(fenetre, cle, rappel) — rappel(valeur) à chaque changement venu d'un autre écran ou du conteneur.
    /** @param {string} cle */
    lireEtat: cle => etat.get(cle),
    ecrireEtat,
    suivreEtat,
    // Plein écran demandé par un écran (ex. lecture d'un document) : le conteneur masque son menu tant que cet écran est affiché, et
    // tente le plein écran du navigateur. Renvoie 'navigateur' (obtenu), 'conteneur' (menu masqué seulement) ou 'ecran'
    // (aucun conteneur : l'écran se débrouille seul).
    /** @param {object} fenetre @param {boolean} actif */
    pleinEcran: async (fenetre, actif) => {
      const cle = o.cleDe(fenetre);
      return cle && o.pleinEcran ? o.pleinEcran(cle, actif) : 'ecran';
    },
  };

  // Prévenir un écran (ou tous, fenetre = null) qu'il doit relire ses tables.
  /** @param {object | null} fenetre */
  function prevenir(fenetre) {
    for (const [f, rappels] of abonnes) {
      if (fenetre && f !== fenetre) continue;
      for (const r of rappels) { try { r([], {}); } catch (e) { /* écran fermé ou en erreur : les autres sont prévenus */ } }
    }
  }

  // Cadre retiré (écran sorti du menu) : ses rappels ne sont plus appelés.
  /** @param {object} fenetre */
  function oublier(fenetre) { abonnes.delete(fenetre); suivis.delete(fenetre); }

  return { hote, prevenir, oublier, viderCache };
}
