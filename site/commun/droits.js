// @ts-check
// Identité et droits de la personne connectée (logique pure) : SPEC § 5.4. Testable avec Node (tests/commun.test.js).
import { liste, estCensure } from './donnees.js';

// Trouve la ligne de la personne connectée parmi les lignes lisibles de Utilisateurs : seule ligne où Moi vaut true.
// statut : 'moi' | 'aucune' | 'sans-regles' | 'sans-moi' | 'masque-partout' | 'moi-non-vrai' | 'indetermine'
// (les statuts autres que 'moi' servent au diagnostic de l'Administration).
/** @param {Ligne[] | null | undefined} lignes @returns {{ moi: Ligne | null, statut: string }} */
export function identifierMoi(lignes) {
  const l = lignes || [];
  if (!l.length) return { moi: null, statut: 'aucune' };
  const avecMoi = l.filter(x => x.Moi === true);
  if (avecMoi.length === 1) return { moi: avecMoi[0], statut: 'moi' };
  // Plusieurs lignes « Moi » pour la même adresse (doublon avec et sans majuscules) : la ligne active, sinon la première.
  // Moi vrai sur des adresses différentes = règles d'accès pas encore saisies (mise en place).
  const cle = (/** @type {Ligne} */ x) => String(x.Email_cle ?? x.Email ?? '').trim().toLowerCase();
  if (avecMoi.length > 1 && cle(avecMoi[0]) && new Set(avecMoi.map(cle)).size === 1)
    return { moi: avecMoi.find(x => x.Actif === true) || avecMoi[0], statut: 'moi' };
  if (l.length > 1 && avecMoi.length === l.length) return { moi: null, statut: 'sans-regles' };
  if (!('Moi' in l[0])) return { moi: l.length === 1 ? l[0] : null, statut: 'sans-moi' };
  if (l.every(x => estCensure(x.Moi))) return { moi: null, statut: 'masque-partout' };
  // Ma ligne est la seule où Moi est lisible, mais il ne vaut pas « vrai » : Moi n'est pas la formule True.
  if (l.filter(x => !estCensure(x.Moi)).length === 1) return { moi: null, statut: 'moi-non-vrai' };
  return { moi: null, statut: 'indetermine' };
}

// Compte connecté : { regles: false } tant que les règles d'accès ne sont pas saisies (Moi vrai partout : mise en
// place) ; sinon { regles: true, moi } (moi = null si le compte est inconnu).
/** @param {Ligne[] | null | undefined} utilisateurs @returns {{ regles: boolean, moi: Ligne | null }} */
export function compteConnecte(utilisateurs) {
  const { moi, statut } = identifierMoi(utilisateurs);
  if (statut === 'sans-regles') return { regles: false, moi: null };
  return { regles: true, moi: statut === 'moi' ? moi : null };
}

// Liste "Table:Action:Niveau" (colonne Utilisateurs.Droits) → { Table: { L, C, M, S } } pour les tables demandées ;
// 'Oui' l'emporte sur 'Limité' ; absent = 'Non'.
/** @param {any} droits @param {string[]} tables @returns {Record<string, DroitsTable>} */
export function matriceDroits(droits, tables) {
  /** @type {Record<string, DroitsTable>} */
  const m = {};
  for (const t of tables) m[t] = { L: 'Non', C: 'Non', M: 'Non', S: 'Non' };
  for (const d of liste(droits)) {
    const [table, action, niveau] = String(d).split(':');
    if (!m[table] || !(action in m[table])) continue;
    if (niveau === 'Oui' || (niveau === 'Limité' && m[table][/** @type {keyof DroitsTable} */ (action)] === 'Non')) {
      m[table][/** @type {keyof DroitsTable} */ (action)] = niveau;
    }
  }
  return m;
}

// Droits de « moi » sur une table → { L, C, M, S } ; compte inactif ou inconnu = rien.
/** @param {Ligne | null | undefined} moi @param {string} table @returns {DroitsTable} */
export function droitsTable(moi, table) {
  return matriceDroits(moi && moi.Actif ? moi.Droits : [], [table])[table];
}
