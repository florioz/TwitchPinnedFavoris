# Twitch Favorites Sidebar v0.6.7

## English

This release removes the remaining periodic sidebar rendering spike and stabilizes the channel favorite button.

### Performance

- Periodic live refreshes no longer destroy and rebuild the complete sidebar.
- Existing cards are patched in place when viewer counts, titles, games, names, or avatars change.
- Cards are moved without being recreated when viewer-based sorting changes.
- A full render is now reserved for structural changes such as a streamer going live or offline, group membership changes, or filtering changes.

### Interface fix

- The channel favorite button keeps a stable position when neighboring Twitch buttons open their panels.
- Its mount point is recomputed only when Twitch actually replaces the channel action bar.

### Validation

- Added regression coverage for incremental live structure detection and stable favorite-button mounting.
- Includes synchronized Chrome and Firefox sources, a Chrome Web Store ZIP, and an Android debug APK.

## Francais

Cette version supprime le dernier pic de rendu périodique de la sidebar et stabilise le bouton de mise en favoris.

### Performances

- Les actualisations périodiques ne détruisent et ne reconstruisent plus toute la sidebar.
- Les cartes existantes sont mises à jour directement lorsque les spectateurs, titres, jeux, noms ou avatars changent.
- Les cartes sont déplacées sans être recréées lorsque le tri par spectateurs évolue.
- Un rendu complet est maintenant réservé aux changements structurels : démarrage ou arrêt d'un live, changement de groupe ou modification des filtres.

### Correction d'interface

- Le bouton favoris d'une chaîne conserve sa position lorsque les boutons Twitch voisins ouvrent leurs panels.
- Son emplacement est recalculé uniquement lorsque Twitch remplace réellement la barre d'actions.

### Validation

- Ajout de tests de non-régression pour la structure des mises à jour live et la stabilité du bouton favoris.
- Sources Chrome et Firefox synchronisées, ZIP Chrome Web Store et APK Android debug inclus.
