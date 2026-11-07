// @ts-check
// Page imprimable d'un rapport (onglet ouvert par « Imprimer / PDF », puis Ctrl/Cmd + P → Enregistrer en PDF), mise en
// page comme le modèle Word : logo et en-tête, titre, tableau d'identification, thème, rubriques, signatures,
// « Page n sur N ». Les consignes et le positionnement MD n'y figurent jamais. Logique pure (tests/rapports.test.js).
import { LOGO } from './logo.js';
import { dateFr, anneeScolaire, lireStructure, lireObjet, titreImprime } from './logique.js';

// Police Marianne (Système de design de l'État, paquet @gouvfr/dsfr) : celle installée sur le poste, sinon le CDN ;
// Arial si aucune n'est disponible.
const DSFR = 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.12.1/dist/fonts/';
const POLICE = ['Regular:400:normal', 'Regular_Italic:400:italic', 'Bold:700:normal', 'Bold_Italic:700:italic'].map(x => {
  const [f, poids, style] = x.split(':');
  return `@font-face { font-family: "Marianne"; font-weight: ${poids}; font-style: ${style}; font-display: swap;
    src: local("Marianne ${f.replace('_', ' ')}"), local("Marianne-${f}"), url("${DSFR}Marianne-${f}.woff2") format("woff2"); }`;
}).join('\n');

/** @param {any} s */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Image de signature : seulement une image en data URL (jamais une adresse externe ni du HTML).
/** @param {any} s */
const imageSure = s => /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(String(s || '')) ? String(s) : '';
/** @param {string} t */
const paragraphes = t => String(t || '').split(/\n{2,}|\n/).map(x => x.trim()).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('');
/** @param {string} t */
const puces = t => `<ul>${String(t || '').split('\n').map(x => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;

/**
 * @typedef {object} ContexteImpression
 * @property {string} titreDocument      Types_rapport.Titre
 * @property {string[]} entete           lignes de l'en-tête (Parametres.entete)
 * @property {string} discipline
 * @property {string} cmi                nom du ou de la CMi
 * @property {string} titreCmi           « La chargée de mission »…
 * @property {string} ipr                nom de l'IA-IPR
 * @property {string} titreIpr           « L'IA-IPR »
 * @property {string} nomFichier         titre de la page = nom proposé pour le PDF
 * @property {boolean} [sansCmi]         rapport rédigé par un·e IA-IPR seul·e : ni case ni signature CMi
 * @property {string} [pied]             début du bas de page (Parametres.pied), suivi de « p n/N. NOM Prénom »
 * @property {number | string} [tailleSignature]  hauteur maximale des signatures imprimées, en mm (Parametres.taille_signature)
 */
// « CERT. CL N · Titulaire · échelon 7 » (Rapports.Prof_statut) → grade et échelon séparés.
/** @param {any} statut */
export function gradeEchelon(statut) {
  const parts = String(statut || '').split('·').map(x => x.trim()).filter(Boolean);
  const e = parts.find(x => /^échelon\s/i.test(x));
  return { grade: parts[0] && !/^échelon/i.test(parts[0]) ? parts[0] : '', echelon: e ? e.replace(/^échelon\s*/i, '') : '' };
}
// « L'intéressé », « L'intéressée » selon la civilité du ou de la professeur·e (APP § 11) ; sinon forme inclusive.
/** @param {any} civilite */
export const interesse = civilite => /^m(?:me|lle)\b/i.test(String(civilite || '').trim()) ? "L'intéressée"
  : /^m\.?$|^monsieur$/i.test(String(civilite || '').trim()) ? "L'intéressé" : "L'intéressé·e";

// o.editable : aperçu modifiable (onglet « Aperçu » de l'écran) : mêmes page et police, chaque rubrique et le thème
// modifiables sur place (contenteditable, texte brut, data-texte = code de la rubrique), rubriques vides comprises.
/** @param {Record<string, any>} r ligne de Rapports (déchiffrée) @param {ContexteImpression} c @param {{ editable?: boolean }} [o] @returns {string} */
export function htmlImpression(r, c, o = {}) {
  const ed = !!o.editable;
  const contenu = lireObjet(r.Contenu);
  const rubriques = lireStructure(r.Structure).filter(x => x.imprimee !== false && (ed || String(contenu[x.code] || '').trim()));
  const bloc = (/** @type {import('./logique.js').RubriqueFigee} */ x) => (ed
    ? `<div class="ed${x.forme === 'Puces' ? ' puces' : ''}" contenteditable="plaintext-only" spellcheck="true" data-texte="${esc(x.code)}" title="${esc(x.titre)}${x.forme === 'Puces' ? ' — une ligne = une puce' : ''}" data-vide="${esc(x.titre)}…">${esc(contenu[x.code] || '')}</div>`
    : x.forme === 'Puces' ? puces(contenu[x.code]) : paragraphes(contenu[x.code]));
  const { grade, echelon } = gradeEchelon(r.Prof_statut);
  const prof = [r.Prof_nom, r.Prof_prenom].filter(Boolean).join(' ');
  // Bas de page : « RAPPORT DE VISITE - inspection de mathématiques   p 1/2.   NOM Prénom » (chaîne CSS échappée).
  const css = (/** @type {string} */ t) => `"${String(t).replace(/["\\\n\r]/g, ' ')}"`;
  const pied = `${css(`${c.pied || 'RAPPORT DE VISITE'}      p `)} counter(page) "/" counter(pages) ${css(`.      ${prof}`)}`;
  const hSig = Math.min(40, Math.max(6, Number(c.tailleSignature) || 15));
  const sig = (/** @type {string} */ titre, /** @type {any} */ img) => `<div class="s"><div class="t">${esc(titre)}</div>
    ${imageSure(img) ? `<img src="${imageSure(img)}" alt="Signature">` : '<div class="vide"></div>'}</div>`;
  // En-têtes du modèle Word : la page 1 a le sien (grand logo, lignes en gras, année scolaire, pas de titre) ; les
  // pages suivantes reprennent un en-tête réduit avec le titre au centre (thead, répété par le navigateur à chaque
  // page). Sur la page 1, l'en-tête de première page recouvre ce thead (marge négative, fond blanc).
  const lignes = c.entete.map(esc).join('<br>');
  const enteteSuite = `<div class="entete suite"><img src="${LOGO}" alt="Académie d'Orléans-Tours">
    <div class="centre">${esc(String(c.titreDocument || '').replace(/,\s*/, ' '))}</div>
    <div class="droite"><div class="lignes">${lignes}</div></div></div>`;
  const enteteUne = `<div class="entete une"><img src="${LOGO}" alt="Académie d'Orléans-Tours">
    <div class="droite"><div class="lignes">${lignes}</div><div class="annee">Année scolaire ${esc(anneeScolaire(r.Date_visite))}</div></div></div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(c.nomFichier)}</title>
<style>
  ${POLICE}
  @page { size: A4; margin: 12mm 15mm 16mm; @bottom-left { content: ${pied}; font: 7.5pt Marianne, Arial, sans-serif; white-space: pre; } }
  body { font: 10pt/1.4 Marianne, Arial, Helvetica, sans-serif; color: #000; margin: 0; background: #fff; }
  .outil { position: sticky; top: 0; z-index: 2; background: #f5f6f7; padding: 8px; border-bottom: 1px solid #ccc; font: 13px sans-serif; }
  .page { max-width: 180mm; margin: 0 auto; padding: 6mm 0; }
  table.mise { width: 100%; border-collapse: collapse; } table.mise > thead > tr > td, table.mise > tbody > tr > td { padding: 0; }
  .entete { display: flex; justify-content: space-between; align-items: center; gap: 4mm; background: #fff; }
  .entete .droite { text-align: right; flex: none; }
  .entete.suite { height: 18mm; box-sizing: border-box; padding-bottom: 3mm; }
  .entete.suite img { width: 21mm; flex: none; }
  .entete.suite .centre { flex: 1; text-align: center; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
  .entete.suite .lignes { font-size: 8pt; line-height: 1.25; }
  .entete.une { position: relative; z-index: 1; margin-top: -18mm; padding-bottom: 4mm; align-items: flex-start; }
  /* Logo de 54 mm, son blanc gauche (4 mm) caché dans la marge : le dessin commence au bord de la marge ; le texte de
     droite descend jusqu'à la ligne « ACADÉMIE » du logo (82 px sur 255 de haut dans l'image, soit 10,7 mm à cette taille). */
  .entete.une img { width: 54mm; flex: none; margin-left: -4mm; }
  .entete.une .droite { margin-top: 9.4mm; }
  .entete.une .lignes { font-size: 11pt; font-weight: 700; line-height: 1.25; }
  .entete.une .annee { font-size: 10pt; margin-top: 2mm; }
  table.id { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 9.5pt; }
  table.id td { border: 1px solid #000; padding: 1mm 2mm; vertical-align: top; }
  table.id td.titre { text-align: center; font-weight: 700; font-size: 14pt; text-transform: uppercase; border: 0; border-bottom: 1px solid #000; padding: 0 0 2mm; }
  .theme { text-align: right; font-weight: 700; margin: 2mm 0 4mm; }
  h2 { font-size: 10pt; margin: 4mm 0 1mm; }
  .rub { margin-top: 3mm; }
  .ed { white-space: pre-wrap; text-align: justify; outline: 1px dashed #c9c9d1; outline-offset: 2px; border-radius: 2px; min-height: 1.4em; font-weight: normal; }
  .ed:hover { outline-color: #7a7a8c; } .ed:focus { outline: 2px solid #2563eb; background: #f5f8ff; }
  .ed:empty::before { content: attr(data-vide); color: #999; font-style: italic; }
  .ed.puces { padding-left: 4mm; border-left: 2px solid #ddd; }
  p { margin: 0 0 2mm; text-align: justify; }
  ul { margin: 0 0 2mm; padding-left: 6mm; }
  .signatures { display: flex; justify-content: space-between; gap: 6mm; margin-top: 8mm; padding-top: 2mm; border-top: 1px solid #000;
    page-break-inside: avoid; font-size: 9.5pt; }
  .signatures .s { flex: 1; } .signatures .s:not(:first-child) { text-align: center; }
  .signatures .t { font-weight: 700; } .signatures img { max-height: ${hSig}mm; max-width: 55mm; display: inline-block; margin-top: 1mm; }
  .signatures .vide { height: ${hSig}mm; }
  @media print { .outil { display: none; } .page { padding: 0; } }
</style></head><body>
${ed ? '' : `<div class="outil">Ctrl / Cmd + P → « Enregistrer au format PDF ». Nom proposé : <strong>${esc(c.nomFichier)}.pdf</strong></div>`}
<div class="page"><table class="mise"><thead><tr><td>${enteteSuite}</td></tr></thead><tbody><tr><td>
${enteteUne}
<table class="id">
  <tr><td colspan="3" class="titre">${esc(c.titreDocument)}</td></tr>
  <tr><td colspan="3">Nom et prénom du professeur·e : <strong>${esc([r.Prof_civilite, prof].filter(Boolean).join(' '))}</strong></td></tr>
  <tr><td>Grade : ${esc(grade)}</td><td>Échelon : ${esc(echelon)}</td><td>Discipline : ${esc(c.discipline)}</td></tr>
  <tr><td colspan="3">Coordonnées établissement : ${esc([r.Etab_nom, r.Etab_commune].filter(Boolean).join(', '))}${r.UAI ? ` – UAI ${esc(r.UAI)}` : ''}</td></tr>
  <tr><td>Date de la visite : ${esc(dateFr(r.Date_visite))}</td>${c.sansCmi ? `<td colspan="2">${esc(c.titreIpr)} : ${esc(c.ipr)}</td>`
    : `<td>${esc(c.titreCmi)} : ${esc(c.cmi)}</td><td>${esc(c.titreIpr)} : ${esc(c.ipr)}</td>`}</tr>
  <tr><td>Classe : ${esc(r.Classe)}</td><td>Effectif : ${esc(r.Effectif ?? '')}</td><td>Heure : ${esc(r.Heure)}</td></tr>
</table>
${ed ? `<div class="theme"><span class="l">Thème :</span> <span class="ed" contenteditable="plaintext-only" data-champ="Theme" data-vide="thème de la séance">${esc(r.Theme || '')}</span></div>`
  : String(r.Theme || '').trim() ? `<div class="theme"><span class="l">Thème :</span> ${esc(r.Theme)}</div>` : ''}
${rubriques.map(x => `<div class="rub">${titreImprime(x) ? `<h2>${esc(x.titre)}</h2>` : ''}${bloc(x)}</div>`).join('\n')}
<div class="signatures">
  <div class="s"><div class="t">Pris connaissance le,</div><div class="t">${esc(interesse(r.Prof_civilite))} :</div></div>
  ${c.sansCmi ? '' : sig(c.titreCmi, r.Signature_cmi)}
  ${sig(c.titreIpr, r.Signature_ipr)}
</div>
</td></tr></tbody></table></div></body></html>`;
}

// Positionnement MD (imprimé à part, jamais dans le rapport).
/** @param {Record<string, any>} r @param {{ Code: any, Libelle: any }[]} competences @param {string[]} niveaux @param {string} titre */
export function htmlPositionnement(r, competences, niveaux, titre) {
  const p = lireObjet(r.Positionnement);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title><style>
  body { font: 11pt Arial, sans-serif; margin: 15mm; } table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 2mm; font-size: 10pt; } th { background: #eee; } td.x { text-align: center; font-weight: bold; }
</style></head><body><h1 style="font-size:14pt">${esc(titre)}</h1>
<p>${esc([r.Prof_civilite, r.Prof_nom, r.Prof_prenom].filter(Boolean).join(' '))} — ${esc(r.Etab_nom)} — visite du ${esc(dateFr(r.Date_visite))}</p>
<table><tr><th>Compétence</th>${niveaux.map(n => `<th>${esc(n)}</th>`).join('')}</tr>
${competences.map(k => `<tr><td>${esc(k.Code)} – ${esc(k.Libelle)}</td>${niveaux.map(n => `<td class="x">${p[String(k.Code)] === n ? '×' : ''}</td>`).join('')}</tr>`).join('')}
</table></body></html>`;
}
