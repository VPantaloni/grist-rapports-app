// @ts-check
// Structure du document à mettre à jour ? (APP § 11, 2026-11-15) : compare les colonnes attendues par cette version de
// l'application (structure-attendue.js, généré d'après installation/schema.json) à celles du document (tables
// méta _grist_Tables et _grist_Tables_column, lisibles avec l'accès complet). Une colonne ou une table manquante =
// « Installer → Créer la structure » (n'ajoute que ce qui manque, ne supprime rien). Logique pure, testée avec Node.
import { COLONNES, VERSION_STRUCTURE } from './structure-attendue.js';
export { VERSION_STRUCTURE };

/**
 * @param {{ id: number, tableId: string }[]} tables lignes de _grist_Tables
 * @param {{ parentId: number, colId: string }[]} colonnes lignes de _grist_Tables_column
 * @param {Record<string, string[]>} [attendues]
 * @returns {{ tables: string[], colonnes: string[] }} tables absentes, colonnes absentes (« Table.Colonne »)
 */
export function manquants(tables, colonnes, attendues = COLONNES) {
  const parId = new Map((tables || []).map(t => [t.id, t.tableId]));
  /** @type {Map<string, Set<string>>} */
  const presentes = new Map();
  for (const c of colonnes || []) {
    const t = parId.get(c.parentId);
    if (!t) continue;
    if (!presentes.has(t)) presentes.set(t, new Set());
    /** @type {Set<string>} */ (presentes.get(t)).add(c.colId);
  }
  const res = { tables: /** @type {string[]} */ ([]), colonnes: /** @type {string[]} */ ([]) };
  for (const [t, cols] of Object.entries(attendues)) {
    const p = presentes.get(t);
    if (!p) { res.tables.push(t); continue; }
    for (const c of cols) if (!p.has(c)) res.colonnes.push(`${t}.${c}`);
  }
  return res;
}
