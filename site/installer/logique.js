// @ts-check
// Logique pure de l'écran installer/ (installation scriptée, banc de vérification, analyse d'un document existant,
// SPEC § 7 bis et § 9) : testable avec Node.
import { liste } from '../commun/donnees.js';
import { MEMO_REGLES, cible as cibleRef } from '../commun/installation.js';

// Fichiers choisis (dossier installation/ de l'application) → schéma, CSV par table, formules par nom de fichier.
// Les chemins viennent de webkitRelativePath (dossier) ou du seul nom (fichiers choisis un par un).
/**
 * @param {{ name: string, webkitRelativePath?: string }[]} fichiers
 * @returns {{ schema: any, csv: Record<string, any>, formules: Record<string, any>, ignores: string[] }}
 */
export function rangerFichiers(fichiers) {
  /** @type {{ schema: any, csv: Record<string, any>, formules: Record<string, any>, ignores: string[] }} */
  const r = { schema: null, csv: {}, formules: {}, ignores: [] };
  for (const f of fichiers) {
    const chemin = f.webkitRelativePath || f.name;
    if (f.name === 'schema.json') r.schema = f;
    else if (/\.csv$/i.test(f.name) && !/(^|\/)modele\//.test(chemin)) r.csv[f.name.replace(/\.csv$/i, '')] = f;
    else if (/\.py$/i.test(f.name)) r.formules[f.name] = f;
    else r.ignores.push(chemin);
  }
  return r;
}

// Rapport du banc de vérification, à copier dans une conversation ou un ticket : une ligne par essai.
/** @param {{ titre: string, etat: 'ok' | 'echec' | 'saute', detail: string }[]} resultats @param {string} [contexte] */
export function texteRapport(resultats, contexte = '') {
  const signe = { ok: 'OK', echec: 'ÉCHEC', saute: '—' };
  return [`Vérification de Grist (kit grist-app-generator)${contexte ? ` — ${contexte}` : ''}`,
    ...resultats.map(r => `- [${signe[r.etat]}] ${r.titre}${r.detail ? ` : ${r.detail}` : ''}`),
    `Bilan : ${resultats.filter(r => r.etat === 'ok').length} OK, ${resultats.filter(r => r.etat === 'echec').length} échec(s).`].join('\n');
}

// Identifiant de la table d'essai du banc : jamais celui d'une table existante.
/** @param {string[]} existantes @param {number} [n] */
export function nomTableEssai(existantes, n = Date.now()) {
  let nom = `Essai_kit_${n.toString(36)}`;
  while (existantes.includes(nom)) nom += '_';
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

// --- 4. Analyse d'un document existant (reprise, SPEC § 9) ---
// Lit seulement les métadonnées du document (_grist_*), jamais les valeurs des cellules. Reconnaît un document fait
// avec le kit, tire un brouillon de installation/schema.json et un rapport de reprise à déposer dans documents-source/.
// Un document v1 et un document v2 ont la même structure (tables d'administration, attribut Profil, règles D1 à D4) :
// seules les règles marquées par cet écran prouvent la v2 ; sinon, le site des widgets le dit (dossier commun/ en v2
// seulement, testé par la page sur un clic). La page installer/ ne prouve rien : c'est souvent celle de l'analyse
// (constaté sur un document v1 le 2026-10-21).

/**
 * @typedef {Record<string, any>} Ligne
 * @typedef {{ tables: Ligne[], colonnes: Ligne[], vues: Ligne[], sections: Ligne[], pages: Ligne[], ressources: Ligne[], regles: Ligne[] }} MetaDocument
 * @typedef {{ page: string, titre: string, table: string, url: string, origine: string, ecran: string, acces: string, associations: boolean }} Widget
 * @typedef {{ statut: 'rien' | 'partiel' | 'kit' | 'v2', indices: string[], manquantes: string[], incompletes: string[], origines: string[], depot: string }} Origine
 */

// Tables d'administration du kit (v1 et v2) et leurs colonnes indispensables.
/** @type {Record<string, string[]>} */
export const TABLES_ADMIN = {
  Utilisateurs: ['Email', 'Roles', 'Actif'],
  Permissions: ['Role', 'Table', 'Lire', 'Creer', 'Modifier', 'Supprimer'],
  Navigation: ['Libelle', 'Widget', 'Ordre', 'Roles', 'Visible'],
};
export const LIBELLES_ORIGINE = {
  rien: 'Document sans le kit',
  partiel: 'Ressemble au kit, mais incomplet',
  kit: 'Fait avec le kit (v1 ou v2 : tester le site des widgets)',
  v2: 'Fait avec le kit v2',
};
const TYPES_KIT = ['Text', 'Numeric', 'Int', 'Bool', 'Date', 'Choice', 'ChoiceList', 'Any', 'Ref', 'RefList'];
const TABLE_IGNOREE = /^(_grist|GristDocTour$|GristDocTutorial$|Essai_kit_)/;
const COLONNE_TECHNIQUE = /^(manualSort$|gristHelper_)/;
/** @param {any} s @param {any} defaut */
const json = (s, defaut) => {
  if (s && typeof s === 'object') return s;
  try { return s ? JSON.parse(s) : defaut; } catch (e) { return defaut; }
};

// Widgets personnalisés posés sur des pages : adresse, écran (dernier dossier de l'adresse), accès, associations de
// colonnes (contraires à SPEC § 3.3 : les écrans du kit lisent les tables par leur nom).
/** @param {MetaDocument} meta @returns {Widget[]} */
export function widgetsPersonnalises(meta) {
  const vues = new Map(meta.vues.map(v => [v.id, v.name]));
  const surPage = new Set(meta.pages.map(p => p.viewRef));
  const tables = new Map(meta.tables.map(t => [t.id, t.tableId]));
  return meta.sections.filter(s => s.parentKey === 'custom' && surPage.has(s.parentId)).map(s => {
    const cv = json(json(s.options, {}).customView, {}) || {};
    const url = String(cv.url || (cv.widgetDef && cv.widgetDef.url) || '');
    let origine = '', ecran = '';
    try {
      const u = new URL(url);
      origine = u.origin;
      ecran = u.pathname.replace(/\/index\.html$/, '').split('/').filter(Boolean).pop() || '';
    } catch (e) { /* adresse absente ou relative */ }
    const associations = Object.values(json(cv.columnsMapping, {}) || {}).some(v => v !== null && v !== undefined);
    return { page: String(vues.get(s.parentId) || ''), titre: String(s.title || ''), table: String(tables.get(s.tableRef) || ''), url, origine, ecran,
      acces: String(cv.access || ''), associations };
  });
}

// Origine du document : rien, partiel, kit (v1 ou v2), v2 ; avec les indices trouvés.
/** @param {MetaDocument} meta @param {Widget[]} widgets @returns {Origine} */
export function reconnaitre(meta, widgets) {
  const parNom = new Map(meta.tables.map(t => [t.tableId, t]));
  /** @param {string} t */
  const colonnesDe = t => { const x = parNom.get(t); return x ? meta.colonnes.filter(c => c.parentId === x.id).map(c => c.colId) : []; };
  const indices = [], manquantes = [], incompletes = [];
  let completes = 0;
  for (const [t, cols] of Object.entries(TABLES_ADMIN)) {
    if (!parNom.has(t)) { manquantes.push(t); continue; }
    const absentes = cols.filter(c => !colonnesDe(t).includes(c));
    if (absentes.length) incompletes.push(`${t} (sans ${absentes.join(', ')})`);
    else completes++;
  }
  if (completes) indices.push(`tables d'administration du kit : ${completes} sur 3${manquantes.length ? ` (absentes : ${manquantes.join(', ')})` : ''}`);
  if (incompletes.length) indices.push(`tables au nom du kit, colonnes différentes : ${incompletes.join(' ; ')}`);
  const droits = ['Droits', 'Moi'].filter(c => colonnesDe('Utilisateurs').includes(c));
  if (droits.length) indices.push(`Utilisateurs : colonne(s) ${droits.join(', ')}`);
  const profil = meta.regles.some(r => { const a = json(r.userAttributes, null); return a && a.name === 'Profil' && a.tableId === 'Utilisateurs'; });
  if (profil) indices.push('attribut utilisateur Profil (Utilisateurs)');
  const conteneur = widgets.filter(w => w.ecran === 'app');
  if (conteneur.length) indices.push(`conteneur app/ : ${[...new Set(conteneur.map(w => w.url))].join(', ')}`);
  const marquees = meta.regles.filter(r => r.memo === MEMO_REGLES).length;
  if (marquees) indices.push(`${marquees} règle(s) d'accès écrite(s) par l'écran installer/ (kit v2)`);
  if (widgets.some(w => w.ecran === 'installer')) indices.push('page de l\'écran installer/ (sans doute celle de cette analyse : ne prouve pas la v2)');
  /** @type {Origine['statut']} */
  let statut = 'rien';
  if (marquees) statut = 'v2';
  else if (completes === 3 && (profil || conteneur.length)) statut = 'kit';
  else if (completes || incompletes.length || profil || conteneur.length) statut = 'partiel';
  const origines = [...new Set(conteneur.map(w => w.origine).filter(Boolean))];
  return { statut, indices, manquantes, incompletes, origines, depot: depotDe(origines) };
}
// Nom du dépôt d'après l'adresse du conteneur (https://<depot>.vercel.app), sinon vide.
/** @param {string[]} origines */
export function depotDe(origines) {
  const m = /^https:\/\/([a-z0-9-]+)\.vercel\.app$/.exec(origines[0] || '');
  return m ? m[1] : '';
}
// Table sans colonne nommée (seulement A, B, C… de Grist) : rangement des pages (page parente sans contenu) ou reste
// d'essai. Jugée sur la structure seule : ses lignes ne sont pas lues.
/** @param {Ligne[]} colonnes de la table, sans les colonnes techniques */
const sansColonneNommee = colonnes => colonnes.every(c => /^[A-Z]$/.test(c.colId) && (!c.label || c.label === c.colId) && !String(c.formula || '').trim());

// Site des widgets testé par la page : commun/favicon.svg chargé (true) = site v2 ; refusé (false) = v1 ou injoignable.
/** @param {Record<string, boolean>} resultats origine → chargé */
export function versionSelonSite(resultats) {
  const v = Object.values(resultats);
  if (!v.length) return '';
  if (v.every(Boolean)) return 'v2';
  if (!v.some(Boolean)) return 'v1';
  return 'mélange';
}

// Brouillon de installation/schema.json d'après le document, tel qu'il est (noms gardés : les écrans lisent les
// tables par leur nom). Formule de plusieurs lignes (ou longue) → fichier installation/formules/<Table>_<Colonne>.py.
// Tout ce que le kit ne sait pas reproduire est signalé dans alertes, pas corrigé.
/** @param {MetaDocument} meta @param {{ date?: string, document?: string }} [o] */
export function brouillonSchema(meta, o = {}) {
  /** @type {string[]} */
  const alertes = [];
  /** @type {Record<string, string>} */
  const formules = {};
  const colParId = new Map(meta.colonnes.map(c => [c.id, c]));
  const resumees = meta.tables.filter(t => t.summarySourceTable && !TABLE_IGNOREE.test(t.tableId)).map(t => t.tableId);
  if (resumees.length) alertes.push(`tables résumées ignorées (à refaire dans Grist après l'installation) : ${resumees.join(', ')}`);
  // Colonne affichée de chaque table : la plus souvent montrée par les références qui la visent.
  /** @type {Record<string, Record<string, number>>} */
  const vues = {};
  for (const c of meta.colonnes) {
    const k = cibleRef(c.type), v = c.visibleCol && colParId.get(c.visibleCol);
    if (!k || !v) continue;
    (vues[k] = vues[k] || {})[v.colId] = (vues[k][v.colId] || 0) + 1;
  }
  const colonnesDe = (/** @type {Ligne} */ t) => meta.colonnes.filter(c => c.parentId === t.id && !COLONNE_TECHNIQUE.test(c.colId)).sort((a, b) => (a.parentPos || 0) - (b.parentPos || 0));
  const candidates = meta.tables.filter(t => !TABLE_IGNOREE.test(t.tableId) && !t.summarySourceTable);
  const rangement = candidates.filter(t => sansColonneNommee(colonnesDe(t))).map(t => String(t.tableId));
  if (rangement.length) alertes.push(`tables sans colonne nommée, non décrites (rangement des pages ou reste d'essai, à vérifier) : ${rangement.join(', ')}`);
  const tables = candidates.filter(t => !rangement.includes(t.tableId)).map(t => {
    const cols = colonnesDe(t);
    /** @type {Record<string, any>[]} */
    const colonnes = [];
    for (const c of cols) {
      const ici = `${t.tableId}.${c.colId}`, formule = String(c.formula || '').trim(), type = String(c.type || 'Any');
      if (c.isFormula && !formule) { alertes.push(`${ici} : colonne vide (formule sans texte), ignorée`); continue; }
      /** @type {Record<string, any>} */
      const col = { id: c.colId };
      if (c.label && c.label !== c.colId) col.libelle = c.label;
      col.type = type;
      if (!TYPES_KIT.includes(type.split(':')[0])) alertes.push(`${ici} : type ${type} non géré par le kit (Text, Numeric, Int, Bool, Date, Choice, ChoiceList, Ref, RefList, Any) : à décider`);
      if (/^Choice/.test(type)) {
        const choix = (json(c.widgetOptions, {}) || {}).choices;
        if (Array.isArray(choix) && choix.length) col.choix = choix;
        else alertes.push(`${ici} : liste de choix vide (à compléter)`);
      }
      if (c.isFormula) {
        if (/\n/.test(formule) || formule.length > 120) {
          const nom = `${t.tableId}_${c.colId}.py`;
          formules[nom] = formule + '\n';
          col.fichier = `installation/formules/${nom}`;
        } else col.formule = formule;
      } else if (formule && c.recalcWhen === 1) {
        alertes.push(`${ici} : formule de déclenchement désactivée (jamais recalculée), ignorée : colonne de données`);
      } else if (formule) {
        col.initialisation = formule;
        if (c.recalcWhen === 2 || liste(c.recalcDeps).length) {
          alertes.push(`${ici} : formule de déclenchement recalculée ${c.recalcWhen === 2 ? 'à chaque modification de la ligne' : 'quand d\'autres colonnes changent'} ; le kit ne pose qu'une formule d'initialisation (à la création) : réglage à reprendre dans Grist`);
        }
      }
      colonnes.push(col);
    }
    /** @type {Record<string, any>} */
    const table = { id: t.tableId };
    if (TABLES_ADMIN[t.tableId]) table.administration = true;
    const v = vues[t.tableId];
    if (v) table.affichee = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
    table.colonnes = colonnes;
    return table;
  });
  const sansAffichee = new Set(), absentes = new Set();
  for (const t of tables) {
    if (t.affichee && !t.colonnes.some((/** @type {any} */ c) => c.id === t.affichee)) { alertes.push(`${t.id} : colonne affichée ${t.affichee} ignorée, à choisir`); delete t.affichee; }
  }
  for (const t of tables) for (const c of t.colonnes) {
    const k = cibleRef(c.type);
    if (!k) continue;
    const vise = tables.find(x => x.id === k);
    if (!vise) absentes.add(`${t.id}.${c.id} → ${k}`);
    else if (!vise.affichee) sansAffichee.add(k);
  }
  if (absentes.size) alertes.push(`références vers une table absente du brouillon : ${[...absentes].join(', ')}`);
  if (sansAffichee.size) alertes.push(`tables visées par des références sans colonne affichée (numéro de ligne affiché) : ${[...sansAffichee].join(', ')} — choisir « affichee »`);
  const schema = {
    $description: `Brouillon tiré du document${o.document ? ` « ${o.document} »` : ''}${o.date ? ` le ${o.date}` : ''} par l'écran installer/ (volet 4) : à relire et compléter (rôles des tables et des colonnes, « obligatoire », règles), puis node scripts/schema.js verifier.`,
    tables,
  };
  return { schema, formules, alertes, rangement };
}

// Rapport de reprise (Markdown), à déposer dans documents-source/ : origine, tables, widgets, règles d'accès, points à
// reprendre du brouillon, formules longues, proposition de tableau de reprise (APP § 2, à valider).
/**
 * @param {{ document?: string, date?: string, origine: Origine, version?: string, widgets: Widget[], regles: { statut: string, n: number },
 *   brouillon: ReturnType<typeof brouillonSchema>, nbPages: number }} a
 */
export function rapportReprise(a) {
  const { origine, widgets, regles, brouillon } = a;
  const tables = brouillon.schema.tables;
  const cel = (/** @type {any} */ s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const L = [`# Analyse du document${a.document ? ` « ${a.document} »` : ''} pour le kit grist-app-generator`, '',
    `${a.date ? `Le ${a.date}, p` : 'P'}ar l'écran installer/ (volet 4). Aucune valeur de cellule n'a été lue ; les formules et les listes de choix sont`,
    'recopiées telles quelles (relire avant de partager). À déposer dans documents-source/ (jamais publié).', ''];

  L.push('## 1. Origine', '', `**${LIBELLES_ORIGINE[origine.statut]}**${a.version ? ` — site des widgets : ${a.version}` : ''}`, '');
  for (const i of origine.indices) L.push(`- ${i}`);
  if (!origine.indices.length) L.push('- aucun indice du kit');
  const depot = origine.depot ? ` \`${origine.depot}\`` : '';
  const suite = {
    rien: 'Projet existant sans le kit : `/reprise` (SPEC § 9). Décrire le document tel qu\'il est dans schema.json (brouillon ci-joint), ajouter les tables d\'administration avec l\'écran installer/, fusionner les règles d\'accès à la main.',
    partiel: 'Ressemble au kit : vérifier les tables d\'administration (§ 5), puis `/reprise` (SPEC § 9).',
    kit: `Fait avec le kit : si le dépôt${depot} a un fichier KIT_VERSION, c'est une application v2 (\`sh outils/mettre-a-jour.sh\` du kit) ; sinon, \`/reprise\`, partie « Application faite avec la v1 du kit ».`,
    v2: `Application v2 : le dépôt${depot} a un fichier KIT_VERSION ; mise à jour par \`sh outils/mettre-a-jour.sh\` du kit (README du kit § 5).`,
  };
  L.push('', `Suite : ${suite[origine.statut]}`, '');

  L.push(`## 2. Tables (${tables.length})`, '', '| Table | Colonnes | Formules | Références vers | Colonne affichée |', '|---|---|---|---|---|');
  for (const t of tables) {
    const refs = [...new Set(t.colonnes.map((/** @type {any} */ c) => cibleRef(c.type)).filter(Boolean))];
    L.push(`| ${cel(t.id)}${t.administration ? ' (administration)' : ''} | ${t.colonnes.length} | ${t.colonnes.filter((/** @type {any} */ c) => c.formule || c.fichier).length} | ${cel(refs.join(', ')) || '—'} | ${cel(t.affichee) || '—'} |`);
  }
  L.push('');

  L.push(`## 3. Widgets personnalisés (${widgets.length}, sur ${a.nbPages} page(s))`, '');
  if (widgets.length) {
    L.push('| Page | Widget | Adresse | Accès | Remarque |', '|---|---|---|---|---|');
    for (const w of widgets) {
      const r = [];
      if (w.ecran === 'app') r.push('conteneur du kit');
      if (w.ecran === 'installer') r.push('écran installer/ du kit');
      if (w.associations) r.push('associations de colonnes (SPEC § 3.3 : lire les tables par leur nom)');
      if (w.acces && w.acces !== 'full') r.push(`accès ${w.acces} (le kit demande l'accès complet)`);
      L.push(`| ${cel(w.page)} | ${cel(w.titre) || '—'} | ${cel(w.url) || '—'} | ${cel(w.acces) || '—'} | ${cel(r.join(' ; ')) || '—'} |`);
    }
  } else L.push('Aucun widget personnalisé.');
  L.push('');

  L.push('## 4. Règles d\'accès', '');
  L.push({
    vierge: '- Aucune règle : l\'écran installer/ peut écrire celles du kit (volet 3).',
    kit: `- ${regles.n} règle(s) écrite(s) par l'écran installer/ : réécriture possible (volet 3).`,
    autres: `- ${regles.n} règle(s) saisie(s) hors de l'écran installer/ : il n'écrira rien ; les compléter à la main avec installation/regles-acces.md.`,
  }[regles.statut] || '');
  L.push('');

  L.push('## 5. Tables d\'administration', '');
  if (origine.manquantes.length) L.push(`- À créer par l'écran installer/ (volet 2) : ${origine.manquantes.join(', ')}`);
  if (origine.incompletes.length) L.push(`- **Nom déjà pris, colonnes différentes** (à examiner avant d'installer) : ${origine.incompletes.join(' ; ')}`);
  if (!origine.manquantes.length && !origine.incompletes.length) L.push('- Les trois sont en place (Utilisateurs, Permissions, Navigation).');
  L.push('');

  L.push(`## 6. Brouillon de schema.json : points à reprendre (${brouillon.alertes.length})`, '');
  for (const x of brouillon.alertes) L.push(`- ${x}`);
  if (!brouillon.alertes.length) L.push('- aucun');
  L.push('');

  const fichiers = Object.entries(brouillon.formules);
  if (fichiers.length) {
    L.push(`## 7. Formules longues (${fichiers.length}) : fichiers de installation/formules/`, '');
    for (const [nom, texte] of fichiers) L.push(`### ${nom}`, '', '```python', texte.replace(/\n$/, ''), '```', '');
  }

  L.push(`## ${fichiers.length ? 8 : 7}. Tableau de reprise (proposition, à valider puis reporter dans APP § 2)`, '',
    '| Élément | Proposition | Raison, effet sur le document |', '|---|---|---|');
  for (const t of tables.filter((/** @type {any} */ t) => !t.administration)) L.push(`| table ${cel(t.id)} | garder | décrite telle quelle dans schema.json (aucun renommage) |`);
  for (const t of brouillon.rangement) L.push(`| table ${cel(t)} | à vérifier | sans colonne nommée : rangement des pages (garder, hors schema.json) ou reste d'essai (supprimer) |`);
  for (const t of origine.manquantes) L.push(`| table ${t} | créer | administration du kit (écran installer/, volet 2) |`);
  for (const t of origine.incompletes) L.push(`| table ${cel(t)} | à décider | nom du kit déjà pris : compléter les colonnes ou renommer l'existante |`);
  for (const w of widgets) {
    const nom = `widget ${cel(w.titre || w.ecran || w.url)} (page ${cel(w.page)})`;
    if (w.ecran === 'app') L.push(`| ${nom} | garder | conteneur du kit${origine.statut === 'v2' ? '' : ' ; v1 : remplacé par celui de la v2, même adresse si le dossier app/ est gardé'} |`);
    else if (w.ecran === 'installer') L.push(`| ${nom} | garder | outil des propriétaires, hors du menu |`);
    else L.push(`| ${nom} | ${w.associations ? 'ajuster' : 'garder, puis reprendre'} | ${w.associations ? 'lecture des tables par leur nom (SPEC § 3.3) ; ' : ''}dans le conteneur tel quel, puis sur un gabarit (\`/nouvel-ecran\`) ; l'adresse change si le dossier change |`);
  }
  if (regles.statut === 'autres') L.push('| règles d\'accès existantes | ajuster | fusion à la main avec installation/regles-acces.md (copie .grist d\'abord) |');
  L.push('', 'Avant toute modification du document : **Télécharger le document (.grist)**, puis « ajouter d\'abord, supprimer ensuite » (SPEC § 9).');
  return L.join('\n') + '\n';
}
