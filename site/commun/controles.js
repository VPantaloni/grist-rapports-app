// @ts-check
// Contrôles des fiches (personnes, organismes…) pour l'onglet Contrôles de l'Administration (SPEC § 5.4) : doublons par
// e-mail, doublons probables par nom, fiches sans e-mail. Repris de grist-formateurs-app et grist-constellations-app.
// Logique pure, testée avec Node (tests/controles.test.js).

/**
 * @typedef {object} ControleFiches
 * @property {string} table                 ex. 'Personnes'
 * @property {string} libelle               ex. 'personnes' (titres des contrôles)
 * @property {string} [email]               colonne de l'e-mail : doublons (majuscules ignorées) et fiches sans e-mail
 * @property {string[]} [nom]               colonnes du nom (ex. ['Prenom', 'Nom']) : doublons probables
 * @property {string} [groupe]              colonne qui limite les doublons de nom à un même groupe (ex. 'Ecole')
 */
/** @typedef {{ niveau: 'erreur' | 'alerte' | 'info', titre: string, lignes: string[] }} Controle */

// Nom comparable : sans accent, casse, tiret, apostrophe ni espace en trop (« Jean-Noël  D'Arc » = « jean noel d arc »).
/** @param {...any} parties */
export function cleNom(...parties) {
  return parties.map(p => String(p ?? '')).join(' ').normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase()
    .replace(/[-'’\s]+/g, ' ').trim();
}

// Groupes d'au moins deux lignes de même clé (clé vide ignorée).
/** @param {Ligne[]} lignes @param {(l: Ligne) => string} cle @returns {Ligne[][]} */
export function groupesDoublons(lignes, cle) {
  /** @type {Map<string, Ligne[]>} */
  const g = new Map();
  for (const l of lignes) { const k = cle(l); if (!k) continue; if (!g.has(k)) g.set(k, []); g.get(k)?.push(l); }
  return [...g.values()].filter(x => x.length > 1);
}

// Contrôles d'une table de fiches. Chaque ligne de résultat nomme les fiches concernées et leur n° de ligne.
/** @param {ControleFiches} c @param {Ligne[]} lignes @returns {Controle[]} */
export function controlesFiches(c, lignes) {
  /** @param {Ligne} l */
  const nom = l => (c.nom ? c.nom.map(k => l[k]).filter(Boolean).join(' ') : '') || (c.email ? String(l[c.email] || '') : '') || `#${l.id}`;
  /** @param {Ligne[]} g */
  const decrire = g => g.map(l => `${nom(l)} (ligne ${l.id})`).join(' · ');
  /** @type {Controle[]} */
  const res = [];
  if (c.email) {
    const email = c.email;
    res.push({ niveau: 'erreur', titre: `Fiches ${c.libelle} en double (même e-mail, majuscules ignorées)`,
      lignes: groupesDoublons(lignes, l => String(l[email] || '').trim().toLowerCase()).map(g => `${String(g[0][email]).trim()} : ${decrire(g)}`) });
    res.push({ niveau: 'alerte', titre: `Fiches ${c.libelle} sans e-mail`,
      lignes: lignes.filter(l => !String(l[email] || '').trim()).map(l => `${nom(l)} (ligne ${l.id})`) });
  }
  if (c.nom) {
    const cols = c.nom, groupe = c.groupe;
    res.push({ niveau: 'alerte', titre: `Fiches ${c.libelle} : doublons probables (même nom${groupe ? `, même ${groupe}` : ''})`,
      lignes: groupesDoublons(lignes, l => { const k = cleNom(...cols.map(x => l[x])); return k && (groupe ? `${k}|${l[groupe] ?? ''}` : k); })
        .map(decrire) });
  }
  return res;
}
