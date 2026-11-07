# Table Utilisateurs, colonne Droits (formule, type Any).
# Droits de la personne, calculés depuis la matrice Permissions pour chacun de ses rôles.
# Résultat : liste de "Table:Action:Niveau", ex. ["Projets:L:Oui", "Projets:M:Limité"].
# Lue par les règles d'accès ("Projets:M:Oui" in user.Profil.Droits) et par les widgets.
if not $Actif:
  return []
droits = set()
for role in ($Roles or []):
  for p in Permissions.lookupRecords(Role=role):
    for action, niveau in (("L", p.Lire), ("C", p.Creer), ("M", p.Modifier), ("S", p.Supprimer)):
      if niveau in ("Oui", "Limité"):
        droits.add("%s:%s:%s" % (p.Table, action, niveau))
return sorted(droits)
