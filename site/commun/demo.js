// @ts-check
// Démonstration en ligne, sans Grist : …/app/?demo=ipr (ou cmi). Une fausse API Grist garde en mémoire les données
// fictives de demo/donnees.json (produit par scripts/demo.js depuis les données d'exemple), recalcule les colonnes
// formules comme Grist, et un bandeau rappelle que rien n'est enregistré (recharger = repartir de zéro).
// Chargé par app/index.html avant le conteneur ; sans « ?demo » dans l'adresse, ne fait rien. Logique pure testée
// avec Node (tests/demo.test.js).

import { nouveauxParametres, deriverCle, creerVerificateur, rangerCle, cryptoDisponible } from './chiffrement.js';

/** @typedef {Record<string, any>} Ligne */
/** @typedef {Record<string, Ligne[]>} Magasin */

// Phrase de chiffrement de la démonstration : les données (en clair) s'ouvrent d'office ; « Masquer » puis « Révéler »
// avec cette phrase pour voir le fonctionnement.
export const PHRASE_DEMO = 'démonstration';
// Profils proposés (comptes d'exemple du modèle).
export const PROFILS = {
  ipr: { email: 'claire.fontaine@ac-exemple.example', libelle: 'IA-IPR', nom: 'Claire Fontaine' },
  cmi: { email: 'thomas.girard@ac-exemple.example', libelle: 'CMi', nom: 'Thomas Girard' },
};
/** @param {string | null} valeur @returns {keyof typeof PROFILS} */
export const profilDe = valeur => (valeur === 'cmi' ? 'cmi' : 'ipr');

const txt = (/** @type {any} */ v) => String(v ?? '');
const iso = (/** @type {any} */ s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : '');
// Année scolaire d'une date (secondes) : à partir d'août, année en cours - année suivante.
/** @param {any} s */
export function anneeScolaire(s) {
  if (!s) return '';
  const d = new Date(s * 1000), y = d.getUTCFullYear();
  return d.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// Colonnes → lignes, lignes → colonnes (format de fetchTable).
/** @param {Record<string, any[]>} c @returns {Ligne[]} */
export function enLignes(c) {
  const cles = Object.keys(c);
  return (c.id || []).map((_, i) => Object.fromEntries(cles.map(k => [k, c[k][i]])));
}
/** @param {Ligne[]} lignes @returns {Record<string, any[]>} */
export function enColonnes(lignes) {
  const cles = [...new Set(['id', ...lignes.flatMap(l => Object.keys(l))])];
  return Object.fromEntries(cles.map(k => [k, lignes.map(l => (l[k] === undefined ? null : l[k]))]));
}

// Décalage des dates : la démonstration reste d'actualité (données préparées autour du lundi de référence). Pas de
// deux semaines : semaines A / B du calendrier gardées ; années scolaires écrites en texte (« 2026-2027 ») décalées
// d'autant d'années scolaires.
const REFERENCE = Date.UTC(2026, 10, 16) / 1000;   // lundi 16 novembre 2026
/** @param {Magasin} M @param {Record<string, string[]>} dates @param {number} maintenant secondes */
export function decalerDates(M, dates, maintenant) {
  const jours = Math.round((maintenant - REFERENCE) / 86400 / 14) * 14;
  if (!jours) return 0;
  const d = jours * 86400;
  const ans = Number(anneeScolaire(REFERENCE + d).slice(0, 4)) - Number(anneeScolaire(REFERENCE).slice(0, 4));
  for (const [t, cols] of Object.entries(dates)) for (const l of M[t] || []) for (const c of cols) if (typeof l[c] === 'number') l[c] += d;
  if (ans) for (const t of ['Stagiaires', 'Bilans_MD']) for (const l of M[t] || []) {
    const m = /^(\d{4})-(\d{4})$/.exec(txt(l.Annee));
    if (m) l.Annee = `${+m[1] + ans}-${+m[2] + ans}`;
  }
  return jours;
}

// Colonnes formules (mêmes calculs que dans Grist, APP § 4) ; Moi : vrai sur la ligne du profil choisi.
/** @param {Magasin} M @param {string} email */
export function recalculer(M, email) {
  const t = (/** @type {string} */ n) => M[n] || [];
  const par = (/** @type {string} */ n) => new Map(t(n).map(l => [l.id, l]));
  for (const p of t('Personnes')) p.Nom_complet = `${txt(p.Prenom)} ${txt(p.Nom)}`;
  for (const e of t('Etablissements')) e.Libelle = `${txt(e.Nom)} (${txt(e.Commune)}) – ${txt(e.UAI)}`;
  const etabs = new Map(t('Etablissements').map(e => [txt(e.UAI), e.id]));
  const COURTES = /** @type {Record<string, string>} */ ({ MATHEMATIQUES: 'MATHS', 'NUMERIQUE SCIENCES INFORMATIQUES': 'NSI' });
  for (const p of t('Professeurs')) {
    const d = txt(p.Discipline).trim().toUpperCase();
    p.Discipline_courte = COURTES[d] || d.slice(0, 8);
    p.Etablissement = etabs.get(txt(p.UAI)) || 0;
    p.Libelle = `${txt(p.Nom)} ${txt(p.Prenom)} – ${txt(p.UAI)}`;
  }
  const pers = par('Personnes'), stg = par('Stagiaires'), md = par('Maitres_delegues');
  for (const r of t('Rapports')) {
    r.Annee = anneeScolaire(r.Date_visite);
    r.Libelle = `${iso(r.Date_visite)} ${txt(r.Prof_nom)} ${txt(r.Prof_prenom)} – ${txt((pers.get(r.Auteur) || {}).Initiales)} #${r.id}`;
  }
  for (const v of t('Visites')) {
    v.Annee = anneeScolaire(v.Mois_debut || v.Date_prevue);
    v.Libelle = `${txt(v.Prof_nom)} ${txt(v.Prof_prenom)} – ${txt(v.UAI)} #${v.id}`;
  }
  for (const m of t('Maitres_delegues')) m.Libelle = `${txt(m.Nom)} ${txt(m.Prenom)} – ${txt(m.UAI)} #${m.id}`;
  for (const b of t('Bilans_MD')) { const m = md.get(b.MD) || {}; b.Libelle = `${txt(m.Nom)} ${txt(m.Prenom)} – ${txt(b.Annee)} #${b.id}`; }
  for (const s of t('Stagiaires')) s.Libelle = `${txt(s.Nom)} ${txt(s.Prenom)} – ${txt(s.Annee)} #${s.id}`;
  for (const x of t('Tutorats')) x.Libelle = `${txt(x.Nom)} ${txt(x.Prenom)} → ${txt((stg.get(x.Stagiaire) || {}).Nom)} #${x.id}`;
  for (const x of t('Retours_PSTG')) x.Libelle = `${txt(x.Type)} – ${txt((stg.get(x.Stagiaire) || {}).Nom)} #${x.id}`;
  // Droits (installation/formules/Utilisateurs_Droits.py) : « Table:Action:Niveau » pour chaque rôle du compte actif.
  const perms = t('Permissions');
  const ACTIONS = /** @type {[string, string][]} */ ([['L', 'Lire'], ['C', 'Creer'], ['M', 'Modifier'], ['S', 'Supprimer']]);
  for (const u of t('Utilisateurs')) {
    u.Email_cle = txt(u.Email).trim().toLowerCase();
    u.Moi = u.Email_cle === email.toLowerCase();
    const roles = Array.isArray(u.Roles) ? u.Roles.slice(u.Roles[0] === 'L' ? 1 : 0) : [];
    const droits = new Set();
    if (u.Actif) for (const p of perms) if (roles.includes(p.Role))
      for (const [a, c] of ACTIONS) if (p[c] === 'Oui' || p[c] === 'Limité') droits.add(`${p.Table}:${a}:${p[c]}`);
    u.Droits = ['L', ...[...droits].sort()];
  }
}

// Actions Grist (applyUserActions) appliquées au magasin ; renvoie retValues (id des lignes ajoutées).
/** @param {Magasin} M @param {any[]} actions @returns {any[]} */
export function appliquer(M, actions) {
  const table = (/** @type {string} */ n) => (M[n] || (M[n] = []));
  const nouvelId = (/** @type {string} */ n) => Math.max(0, ...table(n).map(l => l.id)) + 1;
  const parId = (/** @type {string} */ n, /** @type {number} */ id) => table(n).find(l => l.id === id);
  return actions.map(a => {
    const [type, n] = a;
    if (type === 'AddRecord') { const id = nouvelId(n); table(n).push({ ...a[3], id }); return id; }
    if (type === 'BulkAddRecord') {
      const cols = a[3] || {}, ids = [];
      for (let i = 0; i < a[2].length; i++) {
        const id = nouvelId(n);
        table(n).push({ ...Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v[i]])), id });
        ids.push(id);
      }
      return ids;
    }
    if (type === 'UpdateRecord') { const l = parId(n, a[2]); if (l) Object.assign(l, a[3]); return null; }
    if (type === 'BulkUpdateRecord') {
      a[2].forEach((/** @type {number} */ id, /** @type {number} */ i) => {
        const l = parId(n, id);
        if (l) for (const [k, v] of Object.entries(a[3])) l[k] = v[i];
      });
      return null;
    }
    if (type === 'RemoveRecord' || type === 'BulkRemoveRecord') {
      const ids = new Set(type === 'RemoveRecord' ? [a[2]] : a[2]);
      M[n] = table(n).filter(l => !ids.has(l.id));
      return null;
    }
    return null;   // structure (tables, colonnes, règles) : sans objet dans la démonstration
  });
}

// Tables de structure demandées par l'Administration : tirées du magasin ; règles d'accès et pages : vides.
/** @param {Magasin} M @param {string} nom */
export function tableMeta(M, nom) {
  const noms = Object.keys(M);
  if (nom === '_grist_Tables') return { id: noms.map((_, i) => i + 1), tableId: noms };
  if (nom === '_grist_Tables_column') {
    const l = noms.flatMap((n, i) => [...new Set((M[n] || []).flatMap(x => Object.keys(x)))].filter(c => c !== 'id').map(c => ({ parentId: i + 1, colId: c })));
    return { id: l.map((_, i) => i + 1), parentId: l.map(x => x.parentId), colId: l.map(x => x.colId) };
  }
  return { id: [] };
}

// --- Installation dans la page (navigateur seulement) ---
function installer() {
  const params = new URLSearchParams(location.search);
  if (!params.has('demo') || window.top !== window) return;
  const profil = profilDe(params.get('demo'));
  const { email } = PROFILS[profil];
  /** @type {Magasin} */
  let M = {};
  /** @type {Function[]} */
  const abonnes = [];
  const pret = fetch(new URL('../demo/donnees.json', import.meta.url)).then(r => r.json()).then(j => {
    const { _dates: dates, ...tables } = j;
    M = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, enLignes(v)]));
    decalerDates(M, dates || {}, Date.now() / 1000);
    recalculer(M, email);
  }).then(async () => {
    // Table Chiffrement de démonstration (peu de tours : ouverture rapide) ; clé rangée pour l'onglet, reprise par le
    // conteneur au démarrage : les données sont révélées d'office.
    if (!cryptoDisponible()) return;
    const params = nouveauxParametres(1000);
    const cle = await deriverCle(PHRASE_DEMO, params);
    const ligne = { id: 1, ...params, Verificateur: await creerVerificateur(cle), Indice: 'le mot « démonstration »' };
    M.Chiffrement = [ligne];
    try { await rangerCle(cle, /** @type {any} */ (ligne)); } catch (e) { /* stockage indisponible : « Révéler » avec la phrase */ }
  });
  const w = /** @type {any} */ (window);
  w.__GRIST_MOCK__ = true;
  w.__DEMO__ = profil;
  w.grist = {
    ready() {}, onRecord() {}, onOptions() {}, setOption: async () => {}, getOption: async () => null,
    onRecords(/** @type {Function} */ f) { abonnes.push(f); },
    docApi: {
      async fetchTable(/** @type {string} */ nom) {
        await pret;
        if (nom.startsWith('_grist')) return tableMeta(M, nom);
        if (!M[nom]) throw new Error(`Table not found "${nom}"`);
        return structuredClone(enColonnes(M[nom]));
      },
      async applyUserActions(/** @type {any[]} */ actions) {
        await pret;
        const retValues = appliquer(M, structuredClone(actions));
        recalculer(M, email);
        setTimeout(() => abonnes.forEach(f => { try { f([]); } catch (e) { /* écran fermé */ } }), 0);
        return { retValues };
      },
      getAccessToken: async () => ({ baseUrl: '', token: '' }),
      getDocName: async () => 'Démonstration',
    },
  };
  const bandeau = () => {
    const autre = profil === 'ipr' ? 'cmi' : 'ipr';
    const b = document.createElement('div');
    b.id = 'demo-bandeau';
    b.innerHTML = `<style>
      #demo-bandeau { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 12px; font-size: 13px;
        background: #5b21a3; color: #fff; flex: none; }
      #demo-bandeau strong { font-weight: 700; } #demo-bandeau .espace { flex: 1; }
      #demo-bandeau a, #demo-bandeau button { color: #fff; font: inherit; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.35);
        border-radius: 6px; padding: 2px 10px; text-decoration: none; cursor: pointer; }
      #demo-bandeau a:hover, #demo-bandeau button:hover { background: rgba(255,255,255,.26); }
      @media (max-width: 900px) { #demo-bandeau .long { display: none; } }</style>
      <strong>Démonstration</strong><span class="long" title="Recharger la page = repartir des données d'origine">données fictives, rien n'est enregistré</span>
      <span>· ${PROFILS[profil].nom} (${PROFILS[profil].libelle})</span>
      <span class="long" title="Données révélées d'office ; après « Masquer », « Révéler » avec cette phrase">· phrase : « ${PHRASE_DEMO} »</span><span class="espace"></span>
      <button type="button" id="demo-visite" title="Remontrer la fenêtre « Comment ça marche » de l'écran affiché (et des autres)">Visite guidée</button>
      <a href="?demo=${autre}" title="Recharger la démonstration avec l'autre profil">Voir en ${PROFILS[autre].libelle}</a>
      <a href="../" target="_top">Quitter la démo</a>`;
    document.body.prepend(b);
    b.querySelector('#demo-visite')?.addEventListener('click', async () => {
      const { remettreBienvenues } = await import('./bienvenue.js');
      remettreBienvenues();
      const cadre = [...document.querySelectorAll('#ecrans iframe')].find(f => !(/** @type {HTMLElement} */ (f).hidden));
      try { /** @type {HTMLIFrameElement} */ (cadre)?.contentWindow?.location.reload(); } catch (e) { /* cadre absent */ }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bandeau); else bandeau();
}
if (typeof window !== 'undefined' && typeof location !== 'undefined') installer();
