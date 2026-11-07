# Table des fiches (ex. Personnes), colonne Prenom : formule d'initialisation (« Appliquer aux nouvelles lignes »
# seulement, sans recalcul), pour l'écran « ma fiche » (SPEC § 5.6). Repris de grist-formateurs-app.
# Prénom tiré du nom du compte Grist s'il contient une espace (« Camille Martin »), sinon de l'adresse
# prenom.nom@domaine : partie avant le premier point, chiffres finaux retirés, majuscule à chaque mot
# (jean-marc → Jean-Marc). Les accents ne sont pas dans l'adresse : la personne corrige dans sa fiche.
import re
nom = (user.Name or "").strip()
if " " in nom and "@" not in nom and "." not in nom:
  return nom.split(" ")[0]
local = (user.Email or "").split("@")[0]
prenom = re.sub(r"\d+$", "", local.split(".")[0])
return "-".join(m.capitalize() for m in prenom.split("-") if m)
