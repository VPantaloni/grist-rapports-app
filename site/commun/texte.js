// @ts-check
// Textes riches (SPEC § 3.11) : Markdown (sous-ensemble de CodiMD / HedgeDoc d'apps.education.fr), liens, images,
// formules KaTeX, champs {{…}} des modèles, barre d'insertion de formules. Point de départ : l'écran Documents de
// grist-labo-widget. Tout est pur (testé avec Node, tests/texte.test.js), sauf brancherBarreMaths, qui n'agit qu'à
// l'appel. KaTeX (SPEC § 3.10) est chargé par la page qui affiche des formules :
//   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
//   <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
// Sans lui, le code LaTeX s'affiche tel quel. Styles associés : style.css (« Textes riches »).
//
// SÉCURITÉ — le texte saisi n'entre jamais tel quel dans la page :
// - code, formules, images, liens et contenus intégrés sont mis de côté sous forme de jetons (caractères d'usage
//   privé, d'abord retirés de la saisie : un jeton ne se fabrique pas) ; tout le reste est échappé (esc) avant d'être
//   mis en forme ; le HTML produit ne contient que les balises et attributs écrits ici, jamais un attribut style ou
//   on… ; les jetons n'entrent jamais dans un attribut ;
// - HTML saisi : <style>, <script>, <noscript>, <template>, <textarea>, <title> et commentaires retirés avec leur
//   contenu ; <iframe>, {%youtube%}, {%pdf%}… changés en cartes-liens ; toute autre balise retirée, son texte gardé ;
// - adresses : https pour les images ; https, http et mailto pour les liens (jamais javascript:, data:…), sans
//   guillemet ni chevron ; liens ouverts dans un nouvel onglet (noopener, noreferrer) ; images sans « referrer » ;
// - identifiants des titres (ancres, sommaire) : lettres, chiffres et tirets, préfixés « md- » : aucune collision avec
//   les identifiants de l'écran ;
// - formules : KaTeX en mode sûr (trust: false : ni \href, ni \htmlClass…), taille et expansions limitées.
import { esc } from './interface.js';
import { norm } from './donnees.js';

// --- Markdown ---
const PRIVE = /[-]/g;
const JETON = i => `${i}`;
const RE_JETON = /(\d+)/g;
const RE_JETON_SEUL = /^(\d+)$/;
// Caractère d'adresse dans un texte déjà échappé : ni espace, ni ) < >, ni &lt; &gt; &quot; &#39;, ni jeton.
const CAR_URL = '(?:(?!&lt;|&gt;|&quot;|&#39;)[^\\s()<>"\'\\uE000-\\uF8FF])';
const RE_IMAGE = new RegExp(`!\\[([^\\]\\n]*)\\]\\((https://${CAR_URL}+)(?:\\s+=(\\d{1,4})?x(\\d{1,4})?)?\\)`, 'g');
const RE_ANCRE = /\[([^\]\n]+)\]\(#([^\s()<>"'-]+)\)/g;
// Adresse brute (avant échappement) d'un contenu intégré.
const URL_SURE = /^https?:\/\/[^\s"'<>`\\-]+$/i;
const CADRES = ['success', 'info', 'warning', 'danger'];
const RE_LISTE = /^(\s*)([*+-]|\d{1,9}[.)])\s+(.*)$/;
const RE_SEPARATEUR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;
const RETIRES = /<(style|script|noscript|template|textarea|title|xmp)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;

/** @typedef {{ commentaires: number, integres: number, balises: Record<string, number> }} Bilan */
/** @typedef {{ garder: (html: string, bloc?: boolean) => string, blocs: Set<number>, titres: { n: number, id: string, texte: string }[],
 *   ids: Set<string>, marque?: (t: string) => string, impression: boolean, katex: any, enLigne: (t: string) => string }} Contexte */

// Identifiant d'ancre : « Tutoriel pour les codimd » → « tutoriel-pour-les-codimd » (préfixé md- à l'emploi).
/** @param {string} t */
const ancre = t => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/** @param {string} t */
const sansMarques = t => t.replace(RE_JETON, '').replace(/\*\*|==|\+\+|~~|[*`]/g, '');

// Formule → HTML : KaTeX (mode sûr ; formule fausse = en rouge, message au survol), sinon le code LaTeX échappé.
/** @param {string} tex @param {boolean} bloc @param {any} k */
function formuleHtml(tex, bloc, k) {
  if (k && typeof k.renderToString === 'function') {
    try {
      return k.renderToString(tex, { displayMode: bloc, throwOnError: false, trust: false, strict: 'ignore',
        maxSize: 20, maxExpand: 1000, output: 'html' });
    } catch (e) { /* affichage de secours ci-dessous */ }
  }
  const src = esc(bloc ? `$$${tex}$$` : `$${tex}$`);
  return `<code class="tex${bloc ? ' tex-bloc' : ''}" title="Formule non rendue (KaTeX indisponible)">${src}</code>`;
}

// Carte-lien d'un contenu intégré (iframe, vidéo, PDF) : rien n'est chargé chez un tiers avant le clic.
/** @param {string} url @param {string} libelle @param {boolean} impression */
function carte(url, libelle, impression) {
  const u = String(url || '').trim();
  if (!URL_SURE.test(u)) return '';
  let hote = '';
  try { hote = new URL(u).hostname; } catch (e) { return ''; }
  return `<p class="carte"><a class="carte-lien" href="${esc(u)}" target="_blank" rel="noopener noreferrer">`
    + `<span class="carte-ic" aria-hidden="true">↗</span><span><strong>${esc(libelle || hote)}</strong>`
    + `<small>${esc(impression ? u : hote)}</small></span></a></p>`;
}
// Valeur d'un attribut dans le texte d'une balise saisie (ex. src d'une iframe).
/** @param {string} attrs @param {string} nom */
function attribut(attrs, nom) {
  const m = new RegExp(`\\b${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').trim() : '';
}

// En-tête YAML (--- … --- en tête du texte, CodiMD) : retiré du rendu ; title et description lus.
/** @param {string} s */
function enTete(s) {
  const m = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(s);
  if (!m) return { reste: s, meta: /** @type {Record<string, string>} */ ({}) };
  const meta = {};
  for (const l of m[1].split('\n')) {
    const x = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
    if (x) meta[x[1].toLowerCase()] = x[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return { reste: s.slice(m[0].length), meta };
}

// Texte hors blocs de code : code dans la ligne et formules mis de côté, HTML nettoyé (voir SÉCURITÉ).
/** @param {string} t @param {Contexte} ctx @param {Bilan} bilan */
function nettoyer(t, ctx, bilan) {
  const g = ctx.garder;
  t = t.replace(/(`+)([^`\n]|[^`\n][^\n]*?[^`\n])\1(?!`)/g, (_, b, c) => g(`<code>${esc(c.replace(/^ (.*) $/, '$1'))}</code>`));
  t = t.replace(/\\\$/g, () => g('$'));
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => g(formuleHtml(tex.trim(), true, ctx.katex), true));
  t = t.replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, (_, tex) => g(formuleHtml(tex, false, ctx.katex)));
  t = t.replace(/<!--[\s\S]*?(?:-->|$)/g, () => { bilan.commentaires++; return ''; });
  t = t.replace(RETIRES, (_, b) => { compter(bilan, b); return ''; });
  const integre = (url, libelle) => { bilan.integres++; const c = carte(url, libelle, ctx.impression); return c ? `\n${g(c, true)}\n` : ''; };
  t = t.replace(/<iframe\b([^>]*)>(?:[\s\S]*?<\/iframe\s*>)?/gi, (_, a) => integre(attribut(a, 'src'), attribut(a, 'title') || 'Contenu intégré'));
  t = t.replace(/\{%\s*([A-Za-z]+)\s+([^%\n]*?)\s*%\}/g, (_, type, v) => {
    const ty = type.toLowerCase();
    if (ty === 'youtube') return integre(/^[\w-]{6,20}$/.test(v) ? `https://www.youtube.com/watch?v=${v}` : '', 'Vidéo YouTube');
    if (ty === 'vimeo') return integre(/^\d{3,15}$/.test(v) ? `https://vimeo.com/${v}` : '', 'Vidéo Vimeo');
    if (ty === 'pdf') return integre(v, `PDF : ${v.split(/[/?#]/).filter(Boolean).pop() || ''}`);
    return integre(v, 'Contenu intégré');
  });
  return t.replace(/<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?\/?>/g, (_, ferme, nom) => {
    if (!ferme) compter(bilan, nom);
    return nom.toLowerCase() === 'br' ? '\n' : '';
  });
}
/** @param {Bilan} bilan @param {string} nom */
function compter(bilan, nom) { const n = nom.toLowerCase(); bilan.balises[n] = (bilan.balises[n] || 0) + 1; }

// Texte complet : en-tête retiré ; blocs de code ``` ou ~~~ mis de côté tels quels ; le reste nettoyé.
/** @param {string} s @param {Contexte} ctx @param {Bilan} bilan */
function preparer(s, ctx, bilan) {
  const lignes = s.split('\n'), sortie = [];
  /** @type {string[]} */
  let texte = [];
  const vider = () => { if (texte.length) { sortie.push(nettoyer(texte.join('\n'), ctx, bilan)); texte = []; } };
  for (let i = 0; i < lignes.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)[^`\n]*$/.exec(lignes[i]);
    if (!m) { texte.push(lignes[i]); continue; }
    vider();
    const fin = new RegExp(`^ {0,3}${m[1][0] === '`' ? '`' : '~'}{${m[1].length},}\\s*$`);
    const code = [];
    for (i++; i < lignes.length && !fin.test(lignes[i]); i++) code.push(lignes[i]);
    sortie.push(ctx.garder(`<pre class="code">${m[2] ? `<span class="langue">${esc(m[2])}</span>` : ''}<code>${esc(code.join('\n'))}</code></pre>`, true));
  }
  vider();
  return sortie.join('\n');
}

// Mise en forme d'une ligne (texte brut, jetons compris) : échappée, puis images, ancres, emphase, liens.
/** @param {string} t @param {Contexte} ctx */
function enLigne(t, ctx) {
  let h = esc(t);
  if (ctx.marque) h = ctx.marque(h);
  h = h.replace(RE_IMAGE, (_, alt, url, l) => ctx.garder(`<img src="${url}" alt="${alt.replace(RE_JETON, '')}" loading="lazy" referrerpolicy="no-referrer"`
    + `${l ? ` width="${Math.min(Number(l), 2000)}"` : ''}>`));
  h = h.replace(RE_ANCRE, (_, lib, a) => {
    let cible = a;
    try { cible = decodeURIComponent(a); } catch (e) { /* adresse mal encodée : telle quelle */ }
    return ctx.garder(`<a href="#md-${ancre(cible)}">`) + lib + ctx.garder('</a>');
  });
  h = h.replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/==(?=\S)(.+?)==/g, '<mark>$1</mark>')
    .replace(/\+\+(?=\S)(.+?)\+\+/g, '<u>$1</u>')
    .replace(/~~(?=\S)(.+?)~~/g, '<del>$1</del>');
  return lierUrls(h, ctx.impression);
}

// Liste (imbriquée selon le retrait) : items { ind, ord, html }.
/** @param {{ ind: number, ord: boolean, html: string }[]} items */
function listeHtml(items) {
  let html = '';
  /** @type {{ ind: number, type: string }[]} */
  const pile = [];
  for (const it of items) {
    while (pile.length > 1 && it.ind < pile[pile.length - 1].ind) html += `</li></${/** @type {any} */ (pile.pop()).type}>`;
    const haut = pile[pile.length - 1];
    if (!haut || it.ind > haut.ind) { const type = it.ord ? 'ol' : 'ul'; pile.push({ ind: it.ind, type }); html += `<${type}>`; }
    else html += '</li>';
    html += `<li>${it.html}`;
  }
  while (pile.length) html += `</li></${/** @type {any} */ (pile.pop()).type}>`;
  return html;
}
/** @param {string} ligne */
const cellules = ligne => ligne.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

// Blocs : titres, cadres :::, sommaire [toc], filets, tableaux, citations, listes, paragraphes (saut de ligne gardé).
/** @param {string[]} lignes @param {Contexte} ctx @returns {string} */
function blocs(lignes, ctx) {
  const html = [];
  /** @type {string[]} */
  let para = [];
  const fermer = () => { if (para.length) { html.push(`<p>${para.map(ctx.enLigne).join('<br>')}</p>`); para = []; } };
  for (let i = 0; i < lignes.length; i++) {
    const brute = lignes[i].replace(/\t/g, '    ');
    const l = brute.trim();
    let m;
    if (!l) { fermer(); continue; }
    if ((m = RE_JETON_SEUL.exec(l)) && ctx.blocs.has(Number(m[1]))) { fermer(); html.push(l); continue; }
    if ((m = /^:::\s*([A-Za-z]+)\s*(.*)$/.exec(l))) {
      fermer();
      const dedans = [];
      let prof = 1, j = i + 1;
      for (; j < lignes.length; j++) {
        const x = lignes[j].trim();
        if (/^:::\s*[A-Za-z]/.test(x)) prof++;
        else if (/^:::\s*$/.test(x) && --prof === 0) break;
        dedans.push(lignes[j]);
      }
      i = j;
      const type = m[1].toLowerCase(), contenu = blocs(dedans, ctx);
      const titre = m[2].replace(/\{[^}]*\}/g, '').trim();
      html.push(type === 'spoiler' ? `<details class="cadre-replie"><summary>${ctx.enLigne(titre || 'Afficher')}</summary>${contenu}</details>`
        : `<div class="cadre cadre-${CADRES.includes(type) ? type : 'info'}">${contenu}</div>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)(?:\s+#+)?$/.exec(l))) {
      fermer();
      const n = m[1].length, base = `md-${ancre(sansMarques(m[2])) || 'titre'}`;
      let id = base, k = 2;
      while (ctx.ids.has(id)) id = `${base}-${k++}`;
      ctx.ids.add(id);
      ctx.titres.push({ n, id, texte: m[2] });
      html.push(`<h${n} id="${id}">${ctx.enLigne(m[2])}</h${n}>`);
      continue;
    }
    if ((m = /^\[toc(?:\s+maxlevel\s*=\s*(\d))?\]$/i.exec(l))) { fermer(); html.push(`${m[1] || 3}`); continue; }
    if (/^([-*_])(\s*\1){2,}$/.test(l)) { fermer(); html.push('<hr>'); continue; }
    if (l.includes('|') && i + 1 < lignes.length && lignes[i + 1].includes('|') && RE_SEPARATEUR.test(lignes[i + 1].trim())) {
      fermer();
      const al = cellules(lignes[i + 1]).map(c => (/^:-+:$/.test(c) ? 'centre' : /-:$/.test(c) ? 'droite' : ''));
      const cell = (tag, c, k) => `<${tag}${al[k] ? ` class="a-${al[k]}"` : ''}>${ctx.enLigne(c)}</${tag}>`;
      const tete = cellules(l), corps = [];
      for (i += 2; i < lignes.length && lignes[i].includes('|') && lignes[i].trim(); i++) corps.push(cellules(lignes[i]));
      i--;
      html.push(`<div class="tableau"><table><thead><tr>${al.map((_, k) => cell('th', tete[k] || '', k)).join('')}</tr></thead>`
        + `<tbody>${corps.map(r => `<tr>${al.map((_, k) => cell('td', r[k] || '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (l.startsWith('&gt;') || l.startsWith('>')) {
      fermer();
      const q = [];
      for (; i < lignes.length && /^\s*>/.test(lignes[i]); i++) q.push(lignes[i].replace(/^\s*>\s?/, ''));
      i--;
      html.push(`<blockquote>${blocs(q, ctx)}</blockquote>`);
      continue;
    }
    if (RE_LISTE.test(brute)) {
      fermer();
      const items = [];
      for (; i < lignes.length && (m = RE_LISTE.exec(lignes[i].replace(/\t/g, '    '))); i++) {
        const tache = /^\[( |x|X)\]\s+(.*)$/.exec(m[3]);
        items.push({ ind: m[1].length, ord: /\d/.test(m[2]),
          html: tache ? `<span class="tache" aria-hidden="true">${tache[1] === ' ' ? '☐' : '☑'}</span> ${ctx.enLigne(tache[2])}` : ctx.enLigne(m[3]) });
      }
      i--;
      html.push(listeHtml(items));
      continue;
    }
    para.push(l);
  }
  fermer();
  return html.join('\n');
}

// Sommaire des titres jusqu'au niveau « max » (liens vers les ancres).
/** @param {Contexte} ctx @param {number} max */
function sommaire(ctx, max) {
  const t = ctx.titres.filter(x => x.n <= max);
  if (!t.length) return '';
  return `<nav class="sommaire" aria-label="Sommaire">${listeHtml(t.map(x => ({ ind: x.n, ord: false,
    html: `<a href="#${x.id}">${esc(sansMarques(x.texte.replace(RE_JETON, '')))}</a>` })))}</nav>`;
}

// Markdown → HTML, avec le bilan du nettoyage (HTML retiré, contenus intégrés).
/** @param {any} md @param {{ marque?: (t: string) => string, impression?: boolean, katex?: any }} [o] */
export function analyserTexte(md, o = {}) {
  /** @type {string[]} */
  const reserve = [];
  /** @type {Bilan} */
  const bilan = { commentaires: 0, integres: 0, balises: {} };
  const { reste, meta } = enTete(String(md ?? '').replace(/\r\n?/g, '\n').replace(PRIVE, ''));
  /** @type {Contexte} */
  const ctx = { blocs: new Set(), titres: [], ids: new Set(), marque: o.marque, impression: !!o.impression,
    katex: 'katex' in o ? o.katex : /** @type {any} */ (globalThis).katex,
    garder: (html, bloc = false) => { reserve.push(html); if (bloc) ctx.blocs.add(reserve.length - 1); return JETON(reserve.length - 1); },
    enLigne: t => enLigne(t, ctx) };
  let html = blocs(preparer(reste, ctx, bilan).split('\n'), ctx);
  html = html.replace(/(\d)/g, (_, n) => sommaire(ctx, Number(n)));
  for (let p = 0; p < 3 && html.includes(''); p++) html = html.replace(RE_JETON, (_, i) => reserve[Number(i)] ?? '');
  const premier = ctx.titres.find(x => x.n === 1);
  return { html, bilan, titre: meta.title || (premier ? sansMarques(premier.texte) : ''), description: meta.description || '' };
}
// Bilan du nettoyage en une phrase (aperçu des formulaires) ; '' si rien n'a été retiré ni changé.
/** @param {Bilan} b */
export function resumeNettoyage(b) {
  const balises = Object.entries(b.balises).sort((x, y) => y[1] - x[1]).map(([n, k]) => `${n}${k > 1 ? ` ×${k}` : ''}`);
  const parties = [];
  if (b.integres) parties.push(`${b.integres} contenu${b.integres > 1 ? 's' : ''} intégré${b.integres > 1 ? 's' : ''} changé${b.integres > 1 ? 's' : ''} en lien${b.integres > 1 ? 's' : ''}`);
  if (balises.length) parties.push(`balises HTML retirées (${balises.join(', ')})`);
  if (b.commentaires) parties.push(`${b.commentaires} commentaire${b.commentaires > 1 ? 's' : ''} retiré${b.commentaires > 1 ? 's' : ''}`);
  return parties.length ? `${parties.join(' ; ')}.` : '';
}

// --- Liens ---
// [libellé](https://…) et adresses écrites telles quelles → liens ouverts dans un nouvel onglet. Seules https://,
// http:// (et mailto: pour la forme [libellé](…)) deviennent des liens ; html : texte déjà échappé. impression :
// l'adresse est ajoutée entre parenthèses après le libellé (lisible sur papier).
/** @param {string} html @param {boolean} [impression] @returns {string} */
export function lierUrls(html, impression = false) {
  /** @type {string[]} */
  const liens = [];
  const garder = a => { liens.push(a); return `\uE002${liens.length - 1}\uE003`; };
  const lien = (url, libelle) => garder(`<a href="${url}" target="_blank" rel="noopener noreferrer">${libelle}</a>`
    + (impression && libelle !== url ? ` (${url})` : ''));
  // Caractères d'adresse : tout sauf espace, < et les caractères échappés &lt; &gt; &quot; &#39; (pas d'injection
  // d'attribut), ni jeton (caractères d'usage privé : un jeton n'entre jamais dans un attribut).
  const C = '(?:(?!&lt;|&gt;|&quot;|&#39;)[^\\s<\\uE000-\\uF8FF])';
  let t = String(html).replace(new RegExp(`\\[([^\\]\\n]+)\\]\\(((?:https?://|mailto:)(?:(?!&lt;|&gt;|&quot;|&#39;)[^\\s)<\\uE000-\\uF8FF])+)\\)`, 'g'),
    (_, libelle, url) => lien(url, libelle));
  t = t.replace(new RegExp(`(^|[\\s(>«]|&gt;|&quot;|&#39;)(https?://${C}*(?:(?!&lt;|&gt;|&quot;|&#39;)[^\\s<.,;:!?)\\]»\\uE000-\\uF8FF]))`, 'g'),
    (_, avant, url) => avant + lien(url, url));
  return t.replace(/\uE002(\d+)\uE003/g, (_, i) => liens[Number(i)]);
}

// --- Formules (texte simple, barre de formules) ---

// Remplace les formules par des jetons : $$…$$ (bloc), $…$ (dans la ligne : le $ ouvrant collé au texte qui suit, le $
// fermant collé au texte qui précède et pas suivi d'un chiffre, « 5 $ et 10 $ » reste du texte), \$ (vrai dollar).
/** @typedef {{ tex: string, bloc: boolean } | { dollar: true }} Formule */
/** @param {any} texte @returns {{ texte: string, formules: Formule[] }} */
export function decouperMaths(texte) {
  /** @type {Formule[]} */
  const formules = [];
  const garder = f => { formules.push(f); return JETON(formules.length - 1); };
  let t = String(texte ?? '').replace(/\\\$/g, () => garder({ dollar: true }));
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => garder({ tex: tex.trim(), bloc: true }));
  t = t.replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, (_, tex) => garder({ tex, bloc: false }));
  return { texte: t, formules };
}

// Remet les formules à la place des jetons : rendu KaTeX (mode sûr ; formule fausse = en rouge, message au survol), ou,
// si KaTeX n'est pas chargé, le code LaTeX échappé dans un style de code.
/** @param {string} html @param {Formule[]} formules @param {any} [k] KaTeX (window.katex) @returns {string} */
export function rendreMaths(html, formules, k) {
  return String(html).replace(/\uE000(\d+)\uE001/g, (_, i) => {
    const f = formules[Number(i)];
    if (!f) return '';
    return 'dollar' in f ? '$' : formuleHtml(f.tex, f.bloc, k);
  });
}

// La position « pos » est-elle à l'intérieur d'une formule ($…$ ou $$…$$) ?
/** @param {string} texte @param {number} pos */
export function dansFormule(texte, pos) {
  const avant = String(texte).slice(0, pos).replace(/\\\$/g, '');
  if ((avant.match(/\$\$/g) || []).length % 2 === 1) return true;
  return (avant.replace(/\$\$/g, '').match(/\$/g) || []).length % 2 === 1;
}

// --- Rendus complets ---
// Markdown + liens + images + formules → HTML (voir SÉCURITÉ). o.marque : transforme le texte déjà échappé d'une ligne
// (ex. surligner les champs {{…}}) ; o.impression : adresses des liens en clair ; o.katex : par défaut window.katex.
/** @param {any} md @param {{ marque?: (t: string) => string, impression?: boolean, katex?: any }} [o] @returns {string} */
export const rendreTexte = (md, o = {}) => analyserTexte(md, o).html;
// Texte simple (sauts de ligne conservés, sans Markdown) + liens + formules → HTML.
/** @param {any} texte @param {{ impression?: boolean, katex?: any }} [o] @returns {string} */
export function rendreTexteSimple(texte, o = {}) {
  const d = decouperMaths(String(texte ?? '').replace(PRIVE, ''));
  const k = 'katex' in o ? o.katex : /** @type {any} */ (globalThis).katex;
  return rendreMaths(lierUrls(esc(d.texte), !!o.impression).replace(/\n/g, '<br>'), d.formules, k);
}

// --- Modèles {{Champ}} ---
// Remplace les champs connus de « valeurs » ; les autres restent tels quels et sont renvoyés dans « inconnus ».
/** @param {any} modele @param {Record<string, any>} valeurs @returns {{ texte: string, inconnus: string[] }} */
export function remplir(modele, valeurs) {
  const inconnus = new Set();
  const texte = String(modele ?? '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (tout, cle) => {
    if (Object.prototype.hasOwnProperty.call(valeurs, cle)) return String(valeurs[cle] ?? '');
    inconnus.add(cle);
    return tout;
  });
  return { texte, inconnus: [...inconnus] };
}
// Surligne les champs {{…}} restés non remplacés (option « marque » de rendreTexte ; texte déjà échappé).
/** @param {string} t */
export const marquerChamps = t => t.replace(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g, m => `<mark>${m}</mark>`);

// --- Barre d'insertion de formules ---
// ‸ = position du curseur (ou de la sélection). « brut » : inséré tel quel ; sinon entouré de $…$ si le curseur n'est pas
// déjà dans une formule.
export const MODELES_MATHS = [
  { cle: 'formule', libelle: '$x$', titre: 'Formule dans la ligne : $…$', texte: '$‸$', brut: true },
  { cle: 'bloc', libelle: '$$', titre: 'Formule centrée, en bloc : $$…$$', texte: '\n$$\n‸\n$$\n', brut: true },
  { cle: 'fraction', libelle: 'a⁄b', titre: 'Fraction : \\frac{a}{b}', texte: '\\frac{‸}{}' },
  { cle: 'racine', libelle: '√', titre: 'Racine carrée : \\sqrt{x}', texte: '\\sqrt{‸}' },
  { cle: 'puissance', libelle: 'xⁿ', titre: 'Puissance : x^{n}', texte: '^{‸}' },
  { cle: 'indice', libelle: 'xₙ', titre: 'Indice : u_{n}', texte: '_{‸}' },
  { cle: 'somme', libelle: 'Σ', titre: 'Somme : \\sum_{k=1}^{n}', texte: '\\sum_{k=1}^{n} ‸' },
  { cle: 'integrale', libelle: '∫', titre: 'Intégrale : \\int_{a}^{b} … \\,\\mathrm{d}x', texte: '\\int_{a}^{b} ‸ \\,\\mathrm{d}x' },
  { cle: 'systeme', libelle: '{', titre: 'Système : \\begin{cases} … \\end{cases}', texte: '\\begin{cases} ‸ \\\\  \\end{cases}' },
  { cle: 'matrice', libelle: '( )', titre: 'Matrice 2×2 : \\begin{pmatrix} … \\end{pmatrix}', texte: '\\begin{pmatrix} ‸ &  \\\\  &  \\end{pmatrix}' },
];

// Insère un modèle dans « texte » à la place de [debut, fin) ; la sélection prend la place de ‸.
/** @param {string} texte @param {number} debut @param {number} fin @param {{ texte: string, brut?: boolean }} modele */
export function insererModele(texte, debut, fin, modele) {
  const t = String(texte);
  let m = modele.texte;
  if (!modele.brut && !dansFormule(t, debut)) m = '$' + m + '$';
  const i = m.indexOf('‸');
  const avant = m.slice(0, i), apres = m.slice(i + 1), sel = t.slice(debut, fin);
  return { texte: t.slice(0, debut) + avant + sel + apres + t.slice(fin), curseur: debut + avant.length + sel.length };
}

// Aide-mémoire de la saisie (Markdown, liens, formules), à placer sous un champ.
export const AIDE_TEXTE = 'Markdown (comme CodiMD) : # titre, **gras**, *italique*, ==surligné==, listes * ou 1., '
  + 'tableaux, `code`, ```bloc de code```, cadres :::info … :::, [toc], liens [texte](https://…), images ![](https://…) ; '
  + 'formules : $…$ dans la ligne, $$…$$ en bloc, \\$ pour un dollar. Le HTML est retiré (sécurité).';

// HTML de la barre (boutons + aide formules) ; brancherBarreMaths(barre, champ) l'associe à une zone de texte.
export function barreMaths() {
  return `<div class="barre-maths" role="toolbar" aria-label="Insérer une formule">
    ${MODELES_MATHS.map(m => `<button type="button" data-modele="${m.cle}" title="${esc(m.titre)}">${esc(m.libelle)}</button>`).join('')}
    <details class="aide-maths"><summary>Aide formules</summary>
      <p>Formule dans la ligne : <code>$\\frac{1}{2}$</code>, <code>$x^2$</code>, <code>$\\sqrt{2}$</code> ;
        en bloc, sur sa propre ligne : <code>$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$</code>.
        Un vrai signe dollar : <code>\\$</code>. Une formule fausse s'affiche en rouge (message au survol).</p>
    </details>
  </div>`;
}
// cible : le champ de texte, ou une fonction qui le donne au moment du clic (ex. le dernier champ utilisé d'un formulaire
// qui en a plusieurs ; null = rien à faire).
/** @param {HTMLElement} barre @param {HTMLTextAreaElement | (() => HTMLTextAreaElement | null)} cible */
export function brancherBarreMaths(barre, cible) {
  // mousedown : garder le focus (et la sélection) dans le champ de texte.
  barre.addEventListener('mousedown', e => { if (/** @type {HTMLElement} */ (e.target).closest('[data-modele]')) e.preventDefault(); });
  barre.addEventListener('click', e => {
    const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-modele]'));
    const m = b && MODELES_MATHS.find(x => x.cle === b.dataset.modele);
    const champ = typeof cible === 'function' ? cible() : cible;
    if (!m || !champ || champ.readOnly) return;
    const r = insererModele(champ.value, champ.selectionStart, champ.selectionEnd, m);
    champ.value = r.texte;
    champ.focus();
    champ.setSelectionRange(r.curseur, r.curseur);
    champ.dispatchEvent(new Event('input', { bubbles: true }));   // comme une frappe : aperçu à jour
  });
}
