// @ts-check
// Page imprimable d'un rapport (onglet ouvert par « Imprimer / PDF », puis Ctrl/Cmd + P → Enregistrer en PDF), mise en
// page comme le modèle Word : logo et en-tête, titre, tableau d'identification, thème, rubriques, signatures,
// « Page n sur N ». Les consignes et le positionnement MD n'y figurent jamais. Logique pure (tests/rapports.test.js).
import { LOGO } from './logo.js';
import { dateFr, anneeScolaire, lireStructure, lireObjet } from './logique.js';

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
 */
/** @param {Record<string, any>} r ligne de Rapports (déchiffrée) @param {ContexteImpression} c @returns {string} */
export function htmlImpression(r, c) {
  const contenu = lireObjet(r.Contenu);
  const rubriques = lireStructure(r.Structure).filter(x => x.imprimee !== false && String(contenu[x.code] || '').trim());
  const entete = [...c.entete, `Année scolaire ${anneeScolaire(r.Date_visite)}`].map(esc).join('<br>');
  const sig = (/** @type {string} */ titre, /** @type {string} */ nom, /** @type {any} */ img) => `<td><div class="t">${esc(titre)}</div>
    ${imageSure(img) ? `<img src="${imageSure(img)}" alt="Signature">` : '<div class="vide"></div>'}<div class="n">${esc(nom)}</div></td>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(c.nomFichier)}</title>
<style>
  @page { size: A4; margin: 15mm 15mm 18mm; @bottom-center { content: "Page " counter(page) " sur " counter(pages); font: 9pt Arial, sans-serif; } }
  body { font: 10.5pt/1.4 Arial, Helvetica, sans-serif; color: #000; margin: 0; }
  .outil { position: sticky; top: 0; background: #f5f6f7; padding: 8px; border-bottom: 1px solid #ccc; font: 13px sans-serif; }
  .page { max-width: 180mm; margin: 0 auto; padding: 6mm 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6mm; }
  header img { width: 48mm; }
  header .droite { text-align: right; font-size: 9.5pt; }
  h1 { font-size: 13pt; text-align: center; border: 1px solid #000; padding: 3mm; margin: 0 0 4mm; letter-spacing: .02em; }
  table.id { width: 100%; border-collapse: collapse; margin-bottom: 4mm; font-size: 9.5pt; }
  table.id td { border: 1px solid #000; padding: 1.5mm 2mm; vertical-align: top; }
  .theme { font-weight: bold; margin: 4mm 0 3mm; }
  h2 { font-size: 10.5pt; margin: 4mm 0 1mm; }
  p { margin: 0 0 2mm; text-align: justify; }
  ul { margin: 0 0 2mm; padding-left: 6mm; }
  table.sig { width: 100%; border-collapse: collapse; margin-top: 8mm; page-break-inside: avoid; font-size: 9.5pt; }
  table.sig td { border: 1px solid #000; width: 33%; vertical-align: top; padding: 2mm; height: 32mm; }
  table.sig .t { font-weight: bold; } table.sig img { max-width: 100%; max-height: 22mm; display: block; margin: 1mm 0; }
  table.sig .vide { height: 22mm; } table.sig .n { font-size: 9pt; }
  @media print { .outil { display: none; } .page { padding: 0; } }
</style></head><body>
<div class="outil">Ctrl / Cmd + P → « Enregistrer au format PDF ». Nom proposé : <strong>${esc(c.nomFichier)}.pdf</strong></div>
<div class="page">
<header><img src="${LOGO}" alt="Académie d'Orléans-Tours"><div class="droite">${entete}</div></header>
<h1>${esc(c.titreDocument)}</h1>
<table class="id">
  <tr><td colspan="3">Nom du professeur·e : <strong>${esc([r.Prof_civilite, r.Prof_nom, r.Prof_prenom].filter(Boolean).join(' '))}</strong></td></tr>
  <tr><td colspan="2">Statut : ${esc(r.Prof_statut)}</td><td>Discipline : <strong>${esc(c.discipline)}</strong></td></tr>
  <tr><td colspan="3">Établissement : ${esc([r.Etab_nom, r.Etab_commune].filter(Boolean).join(', '))} – UAI : ${esc(r.UAI)}</td></tr>
  <tr><td><strong>Date de la visite :</strong> ${esc(dateFr(r.Date_visite))}</td><td><strong>Chargé·e de mission :</strong> ${esc(c.cmi)}</td>
    <td><strong>IA-IPR :</strong> ${esc(c.ipr)}</td></tr>
  <tr><td><strong>Classe :</strong> ${esc(r.Classe)}</td><td><strong>Effectif :</strong> ${esc(r.Effectif ?? '')}</td><td><strong>Heure :</strong> ${esc(r.Heure)}</td></tr>
</table>
${String(r.Theme || '').trim() ? `<div class="theme">Thème : ${esc(r.Theme)}</div>` : ''}
${rubriques.map(x => `<h2>${esc(x.titre)}</h2>${x.forme === 'Puces' ? puces(contenu[x.code]) : paragraphes(contenu[x.code])}`).join('\n')}
<table class="sig"><tr>
  <td><div class="t">Pris connaissance le :</div><div class="vide"></div><div class="n">L'intéressé·e</div></td>
  ${sig(c.titreCmi, c.cmi, r.Signature_cmi)}
  ${sig(c.titreIpr, c.ipr, r.Signature_ipr)}
</tr></table>
</div></body></html>`;
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
