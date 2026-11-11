// @ts-check
// Installation scriptée du document (écran installer/, SPEC § 7 bis) : d'après installation/schema.json, les tables,
// colonnes, choix, libellés, références (colonne affichée), formules et données d'exemple d'un document neuf.
// Logique pure, testée avec Node (tests/installation.test.js). N'ajoute que ce qui manque : une table ou une colonne
// qui existe déjà n'est jamais modifiée (différence de type signalée seulement), sauf sa liste de choix, complétée
// des choix du schéma qui y manquent (sans rien retirer ni changer aux autres réglages de la colonne).
// Constaté sur grist.numerique.gouv.fr (2026-10-19, banc) : AddRawTable ne prend que le nom de la table (pas les
// colonnes) ; les colonnes s'ajoutent ensuite (AddColumn), les colonnes par défaut de la table neuve sont retirées.
// À confirmer par le banc : libellés et widgetOptions par AddColumn, recalcWhen des formules d'initialisation,
// ModifyColumn visibleCol + SetDisplayFormula.

/**
 * @typedef {{ id: string, libelle?: string, type: string, choix?: string[], formule?: string, fichier?: string, initialisation?: string, obligatoire?: boolean, role?: string }} ColonneSchema
 * @typedef {{ id: string, role?: string, affichee?: string, administration?: boolean, colonnes: ColonneSchema[] }} TableSchema
 * @typedef {{ tables: TableSchema[] }} Schema
 * @typedef {{ tables: { id: number, tableId: string }[], colonnes: { id: number, parentId: number, colId: string, type: string, visibleCol?: number, widgetOptions?: string }[] }} Meta
 */

export const cible = (/** @type {string} */ type) => (type.match(/^Ref(?:List)?:(.+)$/) || [])[1] || '';
const calculee = (/** @type {ColonneSchema} */ c) => !!(c.formule || c.fichier);

// Tables dans l'ordre de l'import : tables visées par des références de DONNÉES d'abord (même règle que
// scripts/schema.js ordreTables).
/** @param {Schema} schema @returns {TableSchema[]} */
export function ordreTables(schema) {
  const tables = schema.tables || [], faites = /** @type {TableSchema[]} */ ([]), vues = new Set();
  /** @param {TableSchema} t @param {Set<string>} pile */
  const visiter = (t, pile) => {
    if (vues.has(t.id) || pile.has(t.id)) return;
    pile.add(t.id);
    for (const c of t.colonnes || []) {
      if (calculee(c)) continue;
      const k = tables.find(x => x.id === cible(c.type));
      if (k && k !== t) visiter(k, pile);
    }
    vues.add(t.id); faites.push(t);
  };
  for (const t of tables) visiter(t, new Set());
  return faites;
}

// --- Plan : ce qui existe, ce qui sera créé ---
/**
 * @param {Schema} schema @param {Meta} meta
 * @returns {{ tablesACreer: TableSchema[], colonnesAAjouter: { table: string, colonne: ColonneSchema }[], differences: string[], existantes: string[] }}
 */
export function planStructure(schema, meta) {
  const parNom = new Map(meta.tables.map(t => [t.tableId, t]));
  const tablesACreer = [], colonnesAAjouter = [], differences = [], existantes = [];
  for (const t of ordreTables(schema)) {
    const m = parNom.get(t.id);
    if (!m) { tablesACreer.push(t); continue; }
    existantes.push(t.id);
    const cols = new Map(meta.colonnes.filter(c => c.parentId === m.id).map(c => [c.colId, c]));
    for (const c of t.colonnes) {
      const e = cols.get(c.id);
      if (!e) colonnesAAjouter.push({ table: t.id, colonne: c });
      else if (e.type !== c.type) differences.push(`${t.id}.${c.id} : ${e.type} dans le document, ${c.type} dans le schéma (non modifiée)`);
    }
  }
  return { tablesACreer, colonnesAAjouter, differences, existantes };
}

// Colonnes Choix / Liste de choix existantes auxquelles manquent des choix du schéma (ex. nouvelle table dans
// Permissions.Table : la valeur s'affiche en rouge dans Grist tant qu'elle n'est pas dans la liste).
/** @param {Schema} schema @param {Meta} meta @returns {{ table: string, colonne: string, manquants: string[], options: Record<string, any> }[]} */
export function choixManquants(schema, meta) {
  const parNom = new Map(meta.tables.map(t => [t.tableId, t]));
  const res = [];
  for (const t of schema.tables || []) {
    const m = parNom.get(t.id);
    if (!m) continue;
    for (const c of t.colonnes) {
      if (!c.choix || !c.choix.length) continue;
      const e = meta.colonnes.find(x => x.parentId === m.id && x.colId === c.id);
      if (!e || !/^Choice/.test(String(e.type))) continue;
      /** @type {Record<string, any>} */
      let options = {};
      try { options = JSON.parse(e.widgetOptions || '{}') || {}; } catch (err) { options = {}; }
      const deja = Array.isArray(options.choices) ? options.choices : [];
      const manquants = c.choix.filter(x => !deja.includes(x));
      if (manquants.length) res.push({ table: t.id, colonne: c.id, manquants, options: { ...options, choices: [...deja, ...manquants] } });
    }
  }
  return res;
}
/** @param {Schema} schema @param {Meta} meta */
export const actionsChoix = (schema, meta) => choixManquants(schema, meta)
  .map(x => ['ModifyColumn', x.table, x.colonne, { widgetOptions: JSON.stringify(x.options) }]);

// Description Grist d'une colonne (AddRawTable, AddColumn). formules : { 'Nom.py': texte } (fichiers choisis).
/** @param {ColonneSchema} c @param {Record<string, string>} formules */
export function infoColonne(c, formules = {}) {
  /** @type {Record<string, any>} */
  const info = { type: c.type, isFormula: calculee(c), label: c.libelle || c.id, untieColIdFromLabel: true };
  if (c.formule) info.formula = c.formule;
  if (c.fichier) {
    const nom = c.fichier.split('/').pop() || '';
    if (!(nom in formules)) throw new Error(`Formule ${c.fichier} : fichier non choisi`);
    info.formula = formules[nom];
  }
  // Formule d'initialisation : colonne de données, calculée pour les nouvelles lignes seulement (recalcWhen 0 sans
  // dépendances).
  if (c.initialisation) Object.assign(info, { formula: c.initialisation, recalcWhen: 0, recalcDeps: null });
  if (c.choix) info.widgetOptions = JSON.stringify({ choices: c.choix });
  return info;
}
// Structure, en deux envois. 1) Tables neuves, sans page (rangées par Grist dans « Données sources ») : AddRawTable ne prend que
// le nom. 2) Après relecture des métadonnées : colonnes du schéma qui manquent (AddColumn, dans l'ordre du schéma),
// puis, dans les tables créées à l'étape 1 seulement, retrait des colonnes par défaut absentes du schéma (A, B, C…).
/** @param {ReturnType<typeof planStructure>} plan */
export const actionsTables = plan => plan.tablesACreer.map(t => ['AddRawTable', t.id]);
/** @param {Schema} schema @param {Meta} meta @param {Record<string, string>} formules @param {string[]} creees tables créées à l'étape 1 */
export function actionsColonnes(schema, meta, formules = {}, creees = []) {
  const actions = [];
  for (const t of ordreTables(schema)) {
    const m = meta.tables.find(x => x.tableId === t.id);
    if (!m) continue;
    const existantes = meta.colonnes.filter(c => c.parentId === m.id).map(c => c.colId);
    for (const c of t.colonnes) if (!existantes.includes(c.id)) actions.push(['AddColumn', t.id, c.id, infoColonne(c, formules)]);
    if (creees.includes(t.id)) {
      for (const c of existantes) if (c !== 'manualSort' && !/^gristHelper_/.test(c) && !t.colonnes.some(x => x.id === c)) actions.push(['RemoveColumn', t.id, c]);
    }
  }
  return actions;
}
// Colonne affichée des références (après la création : il faut les n° de colonnes de Grist). Pour chaque colonne
// Ref ou RefList du schéma sans colonne affichée : visibleCol, puis la formule d'affichage.
/** @param {Schema} schema @param {Meta} meta */
export function actionsAffichage(schema, meta) {
  const idTable = new Map(meta.tables.map(t => [t.tableId, t.id]));
  /** @param {string} t @param {string} c */
  const col = (t, c) => meta.colonnes.find(x => x.parentId === idTable.get(t) && x.colId === c);
  const actions = [];
  for (const t of schema.tables) for (const c of t.colonnes) {
    const k = cible(c.type), vise = schema.tables.find(x => x.id === k);
    if (!k || !vise || !vise.affichee) continue;
    const ici = col(t.id, c.id), aff = col(k, vise.affichee);
    if (!ici || !aff || ici.visibleCol) continue;
    actions.push(['ModifyColumn', t.id, c.id, { visibleCol: aff.id }], ['SetDisplayFormula', t.id, null, ici.id, `$${c.id}.${vise.affichee}`]);
  }
  return actions;
}

// --- Données d'exemple ---
// CSV (lignes de cellules, en-tête en premier) → lignes { colonne: texte }.
/** @param {string[][]} lignes */
export function objetsCsv(lignes) {
  const [entete, ...reste] = lignes;
  return reste.map(l => Object.fromEntries(entete.map((h, i) => [h.trim(), l[i] ?? ''])));
}
const jour = (/** @type {string} */ v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : null; };
// Lignes d'un CSV → colonnes d'un BulkAddRecord, au format de Grist (SPEC § 4.3). cibles : { Table: lignes déjà dans
// Grist } (relues après leur import : leurs colonnes affichées calculées y sont). Colonnes formules ignorées.
/** @param {TableSchema} table @param {Record<string, string>[]} lignes @param {Schema} schema @param {Record<string, Ligne[]>} cibles */
export function colonnesDonnees(table, lignes, schema, cibles) {
  /** @type {Record<string, any[]>} */
  const cols = {};
  const anomalies = /** @type {string[]} */ ([]);
  // Formule d'initialisation : la valeur du CSV, si elle est donnée, est gardée (la formule ne vaut que sans valeur).
  const presentes = table.colonnes.filter(c => !calculee(c) && lignes.some(l => c.id in l));
  for (const c of presentes) {
    const k = cible(c.type), vise = schema.tables.find(x => x.id === k);
    cols[c.id] = lignes.map((l, i) => {
      const v = String(l[c.id] ?? '').trim();
      if (k) {
        const noms = v ? (/^RefList:/.test(c.type) ? v.split(', ') : [v]) : [];
        const ids = noms.map(n => {
          const r = (cibles[k] || []).find(x => vise && String(x[vise.affichee || '']) === n);
          if (!r) anomalies.push(`${table.id} ligne ${i + 2} : ${c.id} = « ${n} » introuvable dans ${k}`);
          return r ? r.id : 0;
        }).filter(Boolean);
        return /^RefList:/.test(c.type) ? (ids.length ? ['L', ...ids] : null) : (ids[0] || 0);
      }
      if (c.type === 'Bool') return v === 'true';
      if (c.type === 'Numeric' || c.type === 'Int') return v === '' ? null : Number(v);
      if (c.type === 'Date') return v ? jour(v) : null;
      if (c.type === 'ChoiceList') return v ? ['L', ...v.split(', ')] : null;
      return v;
    });
  }
  return { colonnes: cols, n: lignes.length, anomalies };
}

// --- Règles d'accès (installation/regles-acces.md, SPEC § 5.3) ---
// Écriture par script confirmée sur grist.numerique.gouv.fr (banc du 2026-10-19) ; chaque envoi recharge le widget.
// Une règle = une ressource (table, colonnes ; '*' '*' = règles par défaut) + condition + droits (lettres de Grist :
// C créer, R lire, U modifier, D supprimer, S structure ; 'all' / 'none'). « Tout le monde » s'écrit `True` : l'interface
// de Grist refuse une condition vide (seule sa ligne grise « Tous les autres » en a une ; constaté le 2026-10-19).
export const MEMO_REGLES = 'kit grist-app-generator';
/** @typedef {{ tableId: string, colIds: string }} Ressource */
/** @typedef {{ ressource: Ressource, condition: string, droits: string, attribut?: Record<string, string>, libelle: string }} RegleAcces */
const DEFAUT = { tableId: '*', colIds: '*' };
const P = 'user.Profil';

// Règles d'une application d'après son schéma : génériques, puis celles déclarées dans `regles` (portées « Limité »,
// « ma fiche », campagnes…), dans l'ordre où Grist doit les examiner. o.chiffrement : la table Chiffrement (sel et
// vérificateur de la phrase secrète, SPEC § 5.8) existe et doit être lisible des comptes actifs, sinon « Révéler »
// n'apparaît pas pour eux.
/** @param {Schema & { regles?: { table: string, colonne?: string, condition: string, droits: string, libelle?: string }[] }} schema
 *  @param {{ chiffrement?: boolean }} [o] @returns {RegleAcces[]} */
export function reglesAcces(schema, o = {}) {
  /** @type {RegleAcces[]} */
  const r = [];
  const t = (/** @type {string} */ tableId, colIds = '*') => ({ tableId, colIds });
  r.push({ ressource: DEFAUT, condition: '', droits: '', attribut: { name: 'Profil', tableId: 'Utilisateurs', charId: 'Email', lookupColId: 'Email' },
    libelle: 'Attribut utilisateur Profil : Utilisateurs, user.Email ↔ Email' });
  r.push({ ressource: t('Utilisateurs', 'Moi'), condition: 'rec.Email != user.Email', droits: '-R', libelle: 'Utilisateurs.Moi : illisible sauf sur sa ligne' });
  r.push({ ressource: t('Utilisateurs'), condition: 'rec.Email == user.Email', droits: '+R', libelle: 'Utilisateurs : sa ligne' });
  r.push({ ressource: t('Permissions'), condition: 'user.IsLoggedIn', droits: '+R', libelle: 'Permissions : lisible si connecté·e' });
  r.push({ ressource: t('Navigation'), condition: 'True', droits: '+R', libelle: 'Navigation : lisible par tous' });
  if (o.chiffrement) r.push({ ressource: t('Chiffrement'), condition: `${P} and ${P}.Actif`, droits: '+R', libelle: 'Chiffrement : lisible des comptes actifs (pour « Révéler »)' });
  for (const tb of (schema.tables || []).filter(x => !x.administration)) {
    for (const regle of (schema.regles || []).filter(x => x.table === tb.id && x.colonne)) {
      r.push({ ressource: t(tb.id, /** @type {string} */ (regle.colonne)), condition: regle.condition, droits: regle.droits, libelle: regle.libelle || `${tb.id}.${regle.colonne} : règle déclarée` });
    }
    for (const [a, d] of [['L', '+R'], ['C', '+C'], ['M', '+U'], ['S', '+D']]) {
      r.push({ ressource: t(tb.id), condition: `${P} and "${tb.id}:${a}:Oui" in ${P}.Droits`, droits: d, libelle: `${tb.id} : matrice ${a}` });
    }
    for (const regle of (schema.regles || []).filter(x => x.table === tb.id && !x.colonne)) {
      r.push({ ressource: t(tb.id), condition: regle.condition, droits: regle.droits, libelle: regle.libelle || `${tb.id} : règle déclarée` });
    }
  }
  r.push({ ressource: DEFAUT, condition: 'user.Access == OWNER', droits: 'all', libelle: 'D1 : propriétaires, tout' });
  r.push({ ressource: DEFAUT, condition: `not ${P} or not ${P}.Actif`, droits: 'none', libelle: 'D2 : compte inconnu ou inactif, rien' });
  r.push({ ressource: DEFAUT, condition: `"Administrateur·trice" in ${P}.Roles`, droits: '+CRUD', libelle: 'D3 : administration, tout sauf la structure' });
  r.push({ ressource: DEFAUT, condition: 'True', droits: 'none', libelle: 'D4 : tout le monde, rien' });
  return r;
}

// État des règles du document : vierge (seulement les règles spéciales que Grist pose d'office), kit (déjà
// installées par cet écran), autres (règles saisies par ailleurs : l'écran n'écrit rien).
/** @param {Ligne[]} ressources @param {Ligne[]} regles */
export function etatRegles(ressources, regles) {
  const speciale = (/** @type {Ligne} */ r) => { const x = ressources.find(y => y.id === r.resource); return /^\*SPECIAL/.test(String((x && x.tableId) || '')); };
  const utiles = regles.filter(r => !speciale(r) && (r.aclFormula || r.permissionsText || r.userAttributes));
  if (!utiles.length) return { statut: 'vierge', n: 0 };
  if (utiles.every(r => r.memo === MEMO_REGLES)) return { statut: 'kit', n: utiles.length };
  return { statut: 'autres', n: utiles.filter(r => r.memo !== MEMO_REGLES).length };
}
// Réécriture des règles du kit (schéma changé, correction) : retrait des règles marquées par le kit, avant de les écrire.
/** @param {Ligne[]} regles */
export const actionsRetraitKit = regles => regles.filter(r => r.memo === MEMO_REGLES).map(r => ['RemoveRecord', '_grist_ACLRules', r.id]);
// Étape 1 : ressources qui manquent (une par table et colonnes).
/** @param {RegleAcces[]} regles @param {Ligne[]} existantes */
export function actionsRessources(regles, existantes) {
  const vues = new Set(existantes.map(r => `${r.tableId}|${r.colIds}`)), a = [];
  for (const { ressource: x } of regles) {
    const k = `${x.tableId}|${x.colIds}`;
    if (!vues.has(k)) { vues.add(k); a.push(['AddRecord', '_grist_ACLResources', null, { tableId: x.tableId, colIds: x.colIds }]); }
  }
  return a;
}
// Étape 2 : les règles, après relecture des ressources (leurs n°), dans l'ordre (rulePos croissant).
/** @param {RegleAcces[]} regles @param {Ligne[]} ressources */
export function actionsRegles(regles, ressources) {
  return regles.map((r, i) => {
    const res = ressources.find(x => x.tableId === r.ressource.tableId && x.colIds === r.ressource.colIds);
    if (!res) throw new Error(`ressource ${r.ressource.tableId} ${r.ressource.colIds} absente`);
    return ['AddRecord', '_grist_ACLRules', null, { resource: res.id, aclFormula: r.condition, permissionsText: r.droits, rulePos: i + 1, memo: MEMO_REGLES,
      ...(r.attribut ? { userAttributes: JSON.stringify(r.attribut) } : {}) }];
  });
}
