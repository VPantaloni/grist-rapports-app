# Table des fiches (ex. Personnes), colonne Nom : formule d'initialisation (« Appliquer aux nouvelles lignes »
# seulement, sans recalcul), pour l'écran « ma fiche » (SPEC § 5.6). Repris de grist-formateurs-app.
# Nom tiré du nom du compte Grist s'il contient une espace (« Camille Martin »), sinon de l'adresse
# prenom.nom@domaine : partie après le premier point, chiffres finaux retirés, majuscule à chaque mot
# (dupont-durand → Dupont-Durand). Les accents ne sont pas dans l'adresse : la personne corrige dans sa fiche.
import re
nom = (user.Name or "").strip()
if " " in nom and "@" not in nom and "." not in nom:
  return " ".join(nom.split(" ")[1:])
local = (user.Email or "").split("@")[0]
reste = re.sub(r"\d+$", "", " ".join(local.split(".")[1:]))
return " ".join("-".join(m.capitalize() for m in mot.split("-") if m) for mot in reste.split())
