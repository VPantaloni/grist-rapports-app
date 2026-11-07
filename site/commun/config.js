// @ts-check
// Réglages communs à toute l'application : un seul endroit à adapter (SPEC § 3.1).
// La couleur d'accent et l'icône de l'onglet sont dans style.css et favicon.svg (même dossier).

// À ADAPTER : préfixe des préférences personnelles (localStorage), propre à l'application, sans espace ni accent.
export const PREFIXE = 'rapports';

// À ADAPTER : chiffrement de certains champs dans le navigateur (SPEC § 5.8, commun/chiffrement.js) ; null = aucun.
// champs : { Table: { Colonne: 'texte' | 'nombre' | 'liste' } } ; codes : { Table: colonne du pseudonyme « C-0417 » }
// (facultatif : désigne une ligne tant que ses champs sont masqués ; colonne affichée des références vers la table).
// Exemple : { champs: { Personnes: { Email: 'texte', Telephone: 'texte' } }, codes: { Personnes: 'Code' } }
/** @type {import('./chiffrement.js').DeclarationChiffrement | null} */
export const CHIFFREMENT = null;
