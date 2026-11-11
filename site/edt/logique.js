// @ts-check
// Logique pure de l'écran Emplois du temps (sans DOM ni grist) : testable avec Node (tests/edt.test.js).
// Reprise du widget EdT-widget v2.0.1 (même lecture des créneaux, mêmes règles d'alternance, de créneaux libres et de
// réunion d'équipe) ; ajouts : pastilles stagiaires / MD tirées des tables de l'application, modèles de mails.

/** @typedef {Record<string, any>} Ligne */
/** @typedef {{ id: number, tkey: string, start: number, end: number, day: number, alt: string, altRaw: string, altUnknown: boolean,
 *   libelle: string, classe: string, uai: string, _col?: number, _ncol?: number }} Cours */
/** @typedef {{ key: string, mkey: string, civ: string, name: string, uais: Set<string>, byUai: Map<string, number>, n: number }} Prof */

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const DEPTS = ['18', '28', '36', '37', '41', '45'];
export const MAIL_DOMAIN = 'ac-orleans-tours.fr';

// Majuscules sans accents (comparaisons de l'EDT) ; clé de rapprochement entre tables : tirets, apostrophes → espaces.
/** @param {any} s */
export const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
/** @param {any} s */
export const matchKey = s => norm(s).replace(/[^A-Z0-9]+/g, ' ').trim();
/** @param {string} u */
export const deptOf = u => String(u || '').slice(1, 3);
/** @param {number} m */
export const fmtMin = m => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
/** @param {number} m */
export const toHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** @param {any} v */
export const fromHHMM = v => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
/** @param {Cours} c */
export const sigOf = c => [c.tkey, c.start, c.end, c.day, c.alt, c.classe, c.uai, c.libelle].join('|');

// Dates en UTC « pur jour » (pas de décalage de fuseau).
/** @param {Date} d */
export const isoDay = d => d.toISOString().slice(0, 10);
/** @param {Date} d */
export function mondayOf(d) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x; }
/** @param {Date} d @param {number} n */
export function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
/** @param {Date} d */
export const defaultSemestre = d => { const m = d.getUTCMonth(); return (m >= 8 || m === 0) ? 'S1' : 'S2'; };
// Date Grist (secondes), Date, « AAAA-MM-JJ » ou « JJ/MM/AAAA » → Date (UTC) ou null.
/** @param {any} v @returns {Date | null} */
export function parseAnyDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v * 1000);
  if (v instanceof Date) return v;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
// Date (UTC) → date Grist (secondes à minuit UTC).
/** @param {Date | null} d */
export const versGrist = d => (d ? Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000) : null);

// --- Lecture des créneaux ---
// « M. NOM PRENOM (EDT) » → civilité (M. / Mme ; MM = Mme dans Siiprien), nom affiché et clé.
/** @param {any} raw */
export function parseName(raw) {
  let s = String(raw ?? '').replace(/\(\s*EDT\s*\)/ig, '').replace(/\s+/g, ' ').trim();
  let civ = '';
  const m = /^(MME|MLLE|MM|M\.?)\s+/i.exec(s);
  if (m) { civ = /^M\.?$/i.test(m[1]) ? 'M.' : 'Mme'; s = s.slice(m[0].length); }
  return { key: norm(s), civ, name: s };
}
/** @param {any} raw @returns {[number, number] | null} */
export function parseHoraire(raw) {
  const m = /(\d{1,2})\s*[hH:]\s*(\d{0,2})\s*[-–à]+\s*(\d{1,2})\s*[hH:]\s*(\d{0,2})/.exec(String(raw ?? ''));
  if (!m) return null;
  const a = (+m[1]) * 60 + (+(m[2] || 0)), b = (+m[3]) * 60 + (+(m[4] || 0));
  return b > a ? [a, b] : null;
}
/** @param {any} raw */
export function parseJour(raw) {
  const s = norm(raw).slice(0, 3);
  return s ? DAYS.findIndex(d => norm(d).startsWith(s)) : -1;
}
// Alternance : H = chaque semaine ; Q1 = A ; Q2 = B ; S1, S2 = semestres ; autre valeur = hebdomadaire (signalée).
/** @param {any} raw @returns {{ code: string, raw: string, unknown?: boolean }} */
export function parseAlt(raw) {
  const r = String(raw ?? '').trim();
  const s = norm(r);
  const inPar = (/\(([^)]*)\)/.exec(s) || [])[1];
  const c = (inPar ?? s).trim();
  if (c === 'H' || /^HEBDO/.test(s) || s === '') return { code: 'H', raw: r };
  if (c === 'Q1' || c === 'A' || /PREMIERE QUINZAINE/.test(s)) return { code: 'Q1', raw: r };
  if (c === 'Q2' || c === 'B' || /SECONDE QUINZAINE|DEUXIEME QUINZAINE/.test(s)) return { code: 'Q2', raw: r };
  if (c === 'S1') return { code: 'S1', raw: r };
  if (c === 'S2') return { code: 'S2', raw: r };
  return { code: 'H', raw: r, unknown: true };
}
// Lignes de la table EDT → cours, professeur·es (clé = nom affiché), établissements → professeur·es ; doublons fusionnés.
/** @param {Ligne[]} records lignes avec Nom, Horaire, Libelle, Classe, Jour, Alternance (ou Alt), UAI */
export function ingest(records) {
  const seen = new Set();
  /** @type {Cours[]} */ const courses = [];
  /** @type {Map<string, Prof>} */ const teachers = new Map();
  /** @type {Map<string, Set<string>>} */ const uais = new Map();
  let bad = 0;
  for (const r of records) {
    const n = parseName(r.Nom), h = parseHoraire(r.Horaire), d = parseJour(r.Jour);
    if (!n.key || !h || d < 0) { bad++; continue; }
    const alt = parseAlt(r.Alternance ?? r.Alt);
    const uai = norm(r.UAI);
    /** @type {Cours} */
    const c = { id: courses.length, tkey: n.key, start: h[0], end: h[1], day: d, alt: alt.code, altRaw: alt.raw, altUnknown: !!alt.unknown,
      libelle: String(r.Libelle ?? '').trim(), classe: String(r.Classe ?? '').trim(), uai };
    const sig = sigOf(c);
    if (seen.has(sig)) continue;
    seen.add(sig);
    courses.push(c);
    let t = teachers.get(n.key);
    if (!t) { t = { key: n.key, mkey: matchKey(n.name), civ: n.civ, name: n.name, uais: new Set(), byUai: new Map(), n: 0 }; teachers.set(n.key, t); }
    t.uais.add(uai); t.n++; t.byUai.set(uai, (t.byUai.get(uai) || 0) + 1);
    if (!uais.has(uai)) uais.set(uai, new Set());
    /** @type {Set<string>} */ (uais.get(uai)).add(n.key);
  }
  return { courses, teachers, uais, bad };
}

// Calendrier (table Calendrier : Lundi, Semaine A / B / Vacances, Semestre) → Map lundi ISO → { sem: A|B|V, semestre }.
/** @param {Ligne[]} lignes */
export function lireCalendrier(lignes) {
  /** @type {Map<string, { sem: string, semestre: string | null }>} */
  const cal = new Map();
  for (const l of lignes) {
    const dt = parseAnyDate(l.Lundi); if (!dt) continue;
    const v = norm(l.Semaine);
    let sem = null;
    if (/VAC|FERIE|CONGE/.test(v)) sem = 'V';
    else { const m = /(?:^|[^A-Z])(A|B)(?:[^A-Z]|$)/.exec(v); if (m) sem = m[1]; else if (/Q1/.test(v)) sem = 'A'; else if (/Q2/.test(v)) sem = 'B'; }
    if (!sem) continue;
    const sv = norm(l.Semestre);
    cal.set(isoDay(mondayOf(dt)), { sem, semestre: /1/.test(sv) ? 'S1' : /2/.test(sv) ? 'S2' : null });
  }
  return cal;
}
// Cours visible une semaine donnée (wi : { ab: A|B|null, semestre: S1|S2|null }).
/** @param {Cours} c @param {{ ab?: string | null, semestre?: string | null }} wi */
export function isVisible(c, wi) {
  if (wi.ab === 'A' && c.alt === 'Q2') return false;
  if (wi.ab === 'B' && c.alt === 'Q1') return false;
  if (wi.semestre === 'S1' && c.alt === 'S2') return false;
  if (wi.semestre === 'S2' && c.alt === 'S1') return false;
  return true;
}
// Créneaux « visite + entretien » : cours ≥ 50 min (hors samedi) suivi, dans les 30 min, d'une heure sans cours.
/** @param {Cours[]} list */
export function suggestionsFor(list) {
  /** @type {{ stars: Set<number>, ghosts: { day: number, start: number, end: number, after: number }[] }} */
  const res = { stars: new Set(), ghosts: [] };
  const free = (/** @type {number} */ day, /** @type {number} */ a, /** @type {number} */ b) => list.every(o => o.day !== day || !(o.start < b - 4 && o.end > a + 4));
  for (const c of list) {
    if (c.end - c.start < 50 || c.day > 4) continue;
    for (let s = c.end; s <= c.end + 30; s += 5) {
      if (s + 55 > 18 * 60 + 30) break;
      if (free(c.day, s, s + 55)) { res.stars.add(c.id); res.ghosts.push({ day: c.day, start: s, end: s + 60, after: c.id }); break; }
    }
  }
  res.ghosts.sort((a, b) => a.day - b.day || a.start - b.start);
  res.ghosts = res.ghosts.filter((g, i, arr) => !(i && arr[i - 1].day === g.day && g.start < arr[i - 1].end));
  return res;
}
// Cours qui se chevauchent : répartis en colonnes dans la voie du ou de la professeur·e (_col, _ncol).
/** @param {Cours[]} list */
export function pack(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {Cours[]} */ let group = [];
  let groupEnd = -1;
  /** @type {Cours[]} */ const out = [];
  const flush = () => {
    /** @type {number[]} */ const cols = [];
    for (const c of group) { let i = cols.findIndex(end => end <= c.start); if (i < 0) { i = cols.length; cols.push(0); } cols[i] = c.end; c._col = i; }
    for (const c of group) c._ncol = cols.length;
    out.push(...group); group = [];
  };
  for (const c of sorted) { if (c.start >= groupEnd && group.length) flush(); group.push(c); groupEnd = Math.max(groupEnd, c.end); }
  if (group.length) flush();
  return out;
}
// Cours de plus de 70 min : on peut ne visiter que la 1re ou la 2e moitié.
/** @param {Cours} c */
export const canSplit = c => c.end - c.start > 70;
/** @param {Cours} c @param {string | null | undefined} part @returns {[number, number]} */
export function partRange(c, part) {
  if (!part || !canSplit(c)) return [c.start, c.end];
  const half = Math.round((c.end - c.start) / 2 / 5) * 5;
  return part === 'h1' ? [c.start, c.start + half] : [c.start + half, c.end];
}
// Réunion d'équipe : heure (8 h – 18 h, pas de 5 min) qui ne chevauche ni visite ni entretien, où le plus de
// professeur·es de l'équipe n'ont pas cours, au plus près du planning.
// items : visites et entretiens du jour ; cours : cours du jour des professeur·es concerné·es.
/** @param {{ start: number, end: number }[]} items @param {Cours[]} cours */
export function reunionParDefaut(items, cours) {
  const lastEnd = Math.max(...items.map(i => i.end), 8 * 60);
  /** @type {{ start: number, end: number, score: number } | null} */
  let best = null;
  for (let s = 8 * 60; s <= 17 * 60; s += 5) {
    const e = s + 60;
    const clash = items.some(i => i.start < e && i.end > s);
    const busy = new Set(cours.filter(c => c.start < e - 4 && c.end > s + 4).map(c => c.tkey)).size;
    const score = (clash ? 100000 : 0) + busy * 1000 + Math.abs(s - lastEnd);
    if (!best || score < best.score) best = { start: s, end: e, score };
  }
  const b = /** @type {{ start: number, end: number }} */ (best);
  return { start: b.start, end: b.end };
}
// Nombre de professeur·es libres sur un créneau (affiché pour la réunion).
/** @param {string[]} profs @param {Cours[]} cours du jour @param {number} s @param {number} e */
export const libresSur = (profs, cours, s, e) => profs.filter(k => !cours.some(c => c.tkey === k && c.start < e - 4 && c.end > s + 4));

// --- Collage de la page Siiprien « Établissement → Emploi du temps → Tous » ---
const RE_HORAIRE = /^\s*\d{1,2}\s*h\s*\d{0,2}\s*-\s*\d{1,2}\s*h\s*\d{0,2}\s*$/i;
/** @param {string} text */
export function parseSiiprien(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  /** @type {{ uai: string, nom: string, ville: string, dateEdt: string, rows: Ligne[], ignored: number, teachers: string[] }} */
  const res = { uai: '', nom: '', ville: '', dateEdt: '', rows: [], ignored: 0, teachers: [] };
  const full = lines.join('\n');
  let m = /Rne\s*:\s*([0-9]{7}[A-Za-z])/.exec(full) || /ce\.([0-9]{7}[A-Za-z])@/i.exec(full);
  if (m) res.uai = m[1].toUpperCase();
  m = /(?:^|\n)\s*Nom\s*:\s*([^\t\n]+)/.exec(full); if (m) res.nom = m[1].trim();
  m = /(?:^|\n)\s*Ville\s*:\s*([^\t\n]+)/.exec(full); if (m) res.ville = m[1].trim().replace(/^\d{5}\s*/, '');
  m = /Emplois du temps\s*\(au\s*(\d{1,2}\/\d{1,2}\/\d{4})\)/i.exec(full); if (m) res.dateEdt = m[1];
  let inTable = false;
  for (const line of lines) {
    const c = line.split('\t').map(x => x.trim());
    if (c.length >= 5 && RE_HORAIRE.test(c[1] || '') && parseJour(c[4]) >= 0 && parseName(c[0]).key) {
      res.rows.push({ Nom: c[0], Horaire: c[1], Libelle: c[2] || '', Classe: c[3] || '', Jour: c[4], Alternance: c[5] || '' });
      inTable = true;
    } else if (inTable && line.trim() && !/^\(Page en/i.test(line.trim())) res.ignored++;
  }
  res.teachers = [...new Set(res.rows.map(r => parseName(r.Nom).key))];
  return res;
}
// Fichier (export de la table d'EdT-widget, CSV ou TSV avec en-têtes) → lignes de la table EDT.
/** @param {string} texte */
export function lireFichierEdt(texte) {
  const lignes = String(texte || '').replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
  if (lignes.length < 2) return { rows: [], erreur: 'Fichier vide ou sans ligne de données.' };
  const sep = (lignes[0].match(/\t/g) || []).length ? '\t' : (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ';' : ',';
  /** @param {string} l */
  const couper = l => { /** @type {string[]} */ const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map(x => x.trim()); };
  const tetes = couper(lignes[0]).map(h => norm(h).replace(/[^A-Z0-9]/g, ''));
  /** @type {Record<string, RegExp>} */
  const AUTO = { Nom: /^NOM/, Horaire: /DEBUT|HORAIRE|FINCOURS/, Libelle: /^LIBELL/, Classe: /^CLASSE/, Jour: /^JOUR/, Alternance: /^ALT/, UAI: /^(UAI|RNE)/ };
  /** @type {Record<string, number>} */ const idx = {};
  for (const [k, re] of Object.entries(AUTO)) idx[k] = tetes.findIndex(h => re.test(h));
  const manque = ['Nom', 'Horaire', 'Jour', 'UAI'].filter(k => idx[k] < 0);
  if (manque.length) return { rows: [], erreur: `Colonnes introuvables : ${manque.join(', ')} (en-têtes attendus : Nom, Horaire ou Début - Fin, Jour, UAI).` };
  const rows = lignes.slice(1).map(couper).map(c => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, i >= 0 ? (c[i] || '') : ''])))
    .filter(r => parseName(r.Nom).key && parseHoraire(r.Horaire) && parseJour(r.Jour) >= 0)
    .map(r => ({ ...r, UAI: String(r.UAI).toUpperCase() }));
  // En-têtes d'origine (identifiants des colonnes de l'autre document : contexte du déchiffrement « Table.Colonne »).
  const brutes = couper(lignes[0]);
  const colonnes = Object.fromEntries(Object.entries(idx).filter(([, i]) => i >= 0).map(([k, i]) => [k, brutes[i]]));
  const chiffre = rows.some(r => Object.values(r).some(v => /^v1:/.test(String(v))));
  return { rows, colonnes, chiffre, erreur: rows.length ? '' : 'Aucun créneau reconnu.' };
}
// Ligne de la table Chiffrement d'un autre document, copiée depuis Grist (avec ou sans la ligne d'en-têtes) :
// Sel (base64 de 16 octets), Iterations, Version, Verificateur (« v1:… »). null si illisible.
/** @param {string} texte @returns {{ Sel: string, Iterations: number, Version: number, Verificateur: string } | null} */
export function lireLigneChiffrement(texte) {
  const lignes = String(texte || '').replace(/^\ufeff/, '').split(/\r?\n/).map(l => l.split('\t').map(x => x.trim())).filter(l => l.some(Boolean));
  if (!lignes.length) return null;
  const tete = lignes[0].map(h => norm(h));
  const i = (/** @type {string} */ n) => tete.indexOf(n);
  let sel = '', it = 0, ver = 1, verif = '';
  if (i('SEL') >= 0 && i('VERIFICATEUR') >= 0 && lignes[1]) {
    const l = lignes[1];
    sel = l[i('SEL')]; it = Number(l[i('ITERATIONS')]); ver = Number(l[i('VERSION')]) || 1; verif = l[i('VERIFICATEUR')];
  } else {
    const cases = lignes.flat();
    sel = cases.find(c => /^[A-Za-z0-9+/]{21,22}={0,2}$/.test(c)) || '';
    it = Number(cases.find(c => /^\d{4,7}$/.test(c.replace(/[\s ]/g, ''))) ?.replace(/[\s ]/g, '')) || 0;
    verif = cases.find(c => /^v1:/.test(c)) || '';
  }
  return sel && it > 0 && /^v1:/.test(verif) ? { Sel: sel, Iterations: it, Version: ver, Verificateur: verif } : null;
}
// Contextes à essayer pour déchiffrer une colonne d'un autre document (« Table.Colonne ») : la table indiquée, puis les
// noms habituels d'une table d'emplois du temps.
/** @param {string} table @param {string} colonne */
export const contextesPossibles = (table, colonne) => [...new Set([table, 'EDT', 'Edt', 'EdT', 'EDT_Profs', 'Creneaux', 'Emplois_du_temps', 'Table1']
  .map(t => String(t || '').trim()).filter(Boolean))].map(t => `${t}.${colonne}`);

// --- Pastilles : stagiaires de l'année (Suivi PSTG) et maître·sses délégué·es en poste ---
const CORPS_CONCOURS = /** @type {Record<string, string>} */ ({ CERT: 'CAPES', AGREG: 'AGREG', PLP: 'CAPLP' });
const CONCOURS_COURT = /** @type {Record<string, string>} */ ({ Externe: 'ext.', Interne: 'int.', '3e voie': '3e voie' });
// « AGREG int. · PU · 50 % » : concours (corps), voie, public / privé (secteur de l'établissement), quotité.
/** @param {Ligne} s ligne de Stagiaires @param {string} secteur Public / Privé */
export function libelleStagiaire(s, secteur) {
  const corps = CORPS_CONCOURS[String(s.Corps || '')] || String(s.Corps || '');
  return [[corps, CONCOURS_COURT[String(s.Concours || '')] || ''].filter(Boolean).join(' '),
    /^priv/i.test(secteur || '') ? 'PR' : /^pub/i.test(secteur || '') ? 'PU' : '', String(s.Quotite || '') || (s.Corps === 'AGREG' && s.Concours === 'Interne' ? '100 %' : '')].filter(Boolean).join(' · ');
}
// Repères par clé de nom (matchKey « NOM PRENOM ») : { type: 'stg' | 'md', label, uai }.
/**
 * @param {{ stagiaires?: Ligne[], mds?: Ligne[], etabs?: Ligne[] }} D @param {string} annee « 2026-2027 »
 * @returns {Map<string, { type: string, label: string, uai: string, titre: string }[]>}
 */
export function reperes(D, annee) {
  /** @type {Map<string, { type: string, label: string, uai: string, titre: string }[]>} */
  const m = new Map();
  const secteur = (/** @type {any} */ u) => String(((D.etabs || []).find(e => norm(e.UAI) === norm(u)) || {}).Secteur || '');
  const ajouter = (/** @type {string} */ k, /** @type {any} */ v) => { if (!m.has(k)) m.set(k, []); /** @type {any[]} */ (m.get(k)).push(v); };
  for (const s of D.stagiaires || []) {
    if (String(s.Annee) !== annee || s.Suivi === 'Écarté·e' || !s.Nom) continue;
    const label = libelleStagiaire(s, secteur(s.UAI));
    ajouter(matchKey(`${s.Nom} ${s.Prenom || ''}`), { type: 'stg', label: label || 'stagiaire', uai: norm(s.UAI), titre: `Professeur·e stagiaire${label ? ' : ' + label : ''}` });
  }
  for (const d of D.mds || []) {
    if (d.En_poste === false || !d.Nom) continue;
    ajouter(matchKey(`${d.Nom} ${d.Prenom || ''}`), { type: 'md', label: 'MD', uai: norm(d.UAI), titre: 'Maître·sse délégué·e (suivi des MD)' });
  }
  return m;
}
// Repères d'un·e professeur·e de l'EDT (clé « NOM PRENOM ») ; en cas d'homonymes, ceux du même établissement d'abord.
/** @param {Map<string, any[]>} rep @param {Prof} t @param {string} [uai] */
export function reperesDe(rep, t, uai = '') {
  const l = rep.get(t.mkey) || [];
  const meme = l.filter(x => !x.uai || [...t.uais].includes(x.uai) || x.uai === uai);
  return meme.length ? meme : l;
}

// --- Modèles de mails (table Modeles_mail) ---
// Modèles proposés au profil (cmi | ipr), dans l'ordre.
/** @param {Ligne[]} modeles @param {'cmi' | 'ipr'} profil */
export const modelesPour = (modeles, profil) => modeles.filter(m => { const p = String(m.Pour || 'Tous'); return p === 'Tous' || (profil === 'ipr' ? p === 'IA-IPR' : p === 'CMi'); })
  .sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0));
// Champs {etablissement}, {date}, {planning}… remplacés ; champ inconnu laissé tel quel.
/** @param {any} texte @param {Record<string, string>} v */
export const remplirModele = (texte, v) => String(texte ?? '').replace(/\{([a-z_]+)\}/g, (x, k) => (k in v ? v[k] : x));
// Une ligne par créneau du planning (texte du mail).
/** @param {{ type: string, start: number, end: number, nom?: string, classe?: string }[]} items */
export function planningTexte(items) {
  return items.map(it => {
    const h = `${fmtMin(it.start)} - ${fmtMin(it.end)}`;
    if (it.type === 'v') return `* ${h} Visite de classe : ${it.nom}${it.classe ? ` (${it.classe})` : ''}`;
    if (it.type === 'e') return `* ${h} Entretien : ${it.nom}`;
    return `* ${h} Réunion de l'équipe de mathématiques`;
  }).join('\n');
}
// Champs par professeur·e : {planning_profs} (une ligne « M. NOM PRENOM | visite de la classe 4E2 à 10h10 | Entretien à
// 11h10 »), {visite} (« 4E2 à 10h10 ») et {entretien} (« 11h10 ») de la première visite.
/** @param {{ type: string, start: number, end: number, nom?: string, classe?: string }[]} items */
export function champsVisites(items) {
  /** @type {Map<string, { v?: any, e?: any }>} */
  const par = new Map();
  for (const it of items) {
    if (!it.nom) continue;
    if (!par.has(it.nom)) par.set(it.nom, {});
    const x = /** @type {{ v?: any, e?: any }} */ (par.get(it.nom));
    if (it.type === 'v' && !x.v) x.v = it;
    if (it.type === 'e' && !x.e) x.e = it;
  }
  const lignes = [...par].map(([nom, x]) => [nom, x.v ? `visite de la classe ${x.v.classe} à ${fmtMin(x.v.start)}` : '',
    x.e ? `Entretien à ${fmtMin(x.e.start)}` : ''].filter(Boolean).join(' | '));
  const v = items.find(i => i.type === 'v'), e = items.find(i => i.type === 'e');
  return { planning_profs: lignes.join('\n'), visite: v ? `${v.classe ? v.classe + ' ' : ''}à ${fmtMin(v.start)}` : '', entretien: e ? fmtMin(e.start) : '' };
}
// Adresse de l'établissement : Etablissements.Mel, sinon ce.<uai>@ac-orleans-tours.fr.
/** @param {string} uai @param {Ligne[]} etabs */
export function mailEtablissement(uai, etabs) {
  const e = etabs.find(x => norm(x.UAI) === norm(uai));
  return (e && String(e.Mel || '').trim()) || `ce.${String(uai).toLowerCase()}@${MAIL_DOMAIN}`;
}
// Destinataires d'un modèle : { to, cc, sansMail } (adresses dédoublonnées ; sansMail = professeur·es sans adresse connue).
/**
 * @param {Ligne} modele @param {{ chef: string, equipe: { nom: string, mail: string }[], visites: { nom: string, mail: string }[], ipr: string, moi: string }} c
 */
export function destinataires(modele, c) {
  const liste = (/** @type {any} */ v) => (Array.isArray(v) ? (v[0] === 'L' ? v.slice(1) : v) : String(v || '').split(/\s*,\s*/)).filter(Boolean);
  /** @type {{ nom: string, mail: string }[]} */ const sans = [];
  const adresses = (/** @type {string[]} */ quoi) => quoi.flatMap(q => {
    if (q === "Chef d'établissement") return [c.chef];
    if (q === 'Équipe' || q === 'Professeur·e visité·e') { const l = q === 'Équipe' ? c.equipe : c.visites; sans.push(...l.filter(x => !x.mail)); return l.map(x => x.mail); }
    if (q === 'IA-IPR référent·e') return [c.ipr];
    if (q === 'Moi') return [c.moi];
    return [];
  }).filter(Boolean);
  const to = [...new Set(adresses(liste(modele.A)))];
  const cc = [...new Set(adresses(liste(modele.Copie)))].filter(x => !to.includes(x));
  return { to, cc, sansMail: [...new Map(sans.map(x => [x.nom, x])).values()].map(x => x.nom) };
}
/** @param {string[]} to @param {string[]} cc @param {string} objet @param {string} corps */
export const lienMailto = (to, cc, objet, corps) => `mailto:${to.map(encodeURIComponent).join(',')}?${[cc.length ? 'cc=' + cc.map(encodeURIComponent).join(',') : '',
  'subject=' + encodeURIComponent(objet), 'body=' + encodeURIComponent(corps.replace(/\r?\n/g, '\r\n'))].filter(Boolean).join('&')}`;

// --- Lien avec le plan ---
// Visites du plan (de l'année) des professeur·es d'un planning : même établissement et même nom (+ prénom).
/** @param {Ligne[]} visites @param {string} uai @param {Prof[]} profs @param {number} rentree */
export function visitesDuPlanning(visites, uai, profs, rentree) {
  const annee = (/** @type {any} */ d) => { const x = parseAnyDate(d); return x ? (x.getUTCMonth() >= 7 ? x.getUTCFullYear() : x.getUTCFullYear() - 1) : 0; };
  return visites.filter(v => {
    const a = annee(v.Mois_debut || v.Date_prevue);
    if (a && a !== rentree) return false;
    if (norm(v.UAI) !== norm(uai)) return false;
    const k = matchKey(`${v.Prof_nom || ''} ${v.Prof_prenom || ''}`);
    return profs.some(t => t.mkey === k || t.mkey.startsWith(matchKey(v.Prof_nom) + ' ') && !v.Prof_prenom);
  });
}
// Professeur·e de l'EDT correspondant à une visite du plan (même nom et prénom ; établissement de la visite d'abord).
/** @param {Ligne} v @param {Map<string, Prof>} teachers */
export function profDeVisite(v, teachers) {
  const k = matchKey(`${v.Prof_nom || ''} ${v.Prof_prenom || ''}`);
  const l = [...teachers.values()].filter(t => t.mkey === k);
  return l.find(t => t.uais.has(norm(v.UAI))) || l[0] || null;
}
