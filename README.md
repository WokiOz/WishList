# 🎄 Wishlist de Gabriel

Liste de cadeaux pour le 1er anniversaire de Gabriel (Node.js + Express, stockage JSON).

## Fonctionnalités
- Cadeaux avec photo (upload ou URL), lien, prix et description
- Les visiteurs cochent « Je le prends » / décochent pour libérer — **prénom + nom obligatoires**
- Notification Discord (webhook) à chaque prise / libération / ajout / modification / suppression
- Page `/admin.html` (protégée par mot de passe) : gestion des cadeaux, titre, sous-titre et image de fond

## Déploiement (Portainer)
1. Stack → *Repository* → pointer vers ce dépôt (le `docker-compose.yml` est à la racine).
2. Variables d'environnement de la stack :
   | Variable | Rôle |
   |---|---|
   | `ADMIN_PASSWORD` | mot de passe de `/admin.html` |
   | `DISCORD_WEBHOOK_URL` | URL du webhook Discord (vide = désactivé) |
3. Déployer → site accessible sur `http://<serveur>:8941`.

Les données (cadeaux, réglages, images) sont conservées dans le volume `wishlist-data`.

## En local
```bash
npm install
ADMIN_PASSWORD=secret npm start   # http://localhost:3000
```
