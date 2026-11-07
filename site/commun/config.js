// @ts-check
// Réglages communs à toute l'application : un seul endroit à adapter (SPEC § 3.1).
// La couleur d'accent et l'icône de l'onglet sont dans style.css et favicon.svg (même dossier).

// À ADAPTER : préfixe des préférences personnelles (localStorage), propre à l'application, sans espace ni accent.
export const PREFIXE = 'rapports';

// À ADAPTER : chiffrement de certains champs dans le navigateur (SPEC § 5.8, commun/chiffrement.js) ; null = aucun.
// champs : { Table: { Colonne: 'texte' | 'nombre' | 'liste' } } ; codes : { Table: colonne du pseudonyme « C-0417 » }
// (facultatif : désigne une ligne tant que ses champs sont masqués ; colonne affichée des références vers la table).
// Exemple : { champs: { Personnes: { Email: 'texte', Telephone: 'texte' } }, codes: { Personnes: 'Code' } }
// Rapports d'inspection (2026-11-07, APP § 11) : texte des rubriques, commentaires de relecture, positionnement MD et
// signatures recopiées dans les rapports. Le nom du ou de la professeur·e reste lisible (liste des rapports sans la clé).
/** @type {import('./chiffrement.js').DeclarationChiffrement | null} */
export const CHIFFREMENT = {
  champs: {
    Rapports: { Contenu: 'texte', Commentaires: 'texte', Positionnement: 'texte', Signature_cmi: 'texte', Signature_ipr: 'texte' },
  },
  codes: {},
};
