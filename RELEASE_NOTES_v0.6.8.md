# Twitch Favorites Sidebar v0.6.8

## Francais

Cette version enrichit le chat Twitch, fiabilise les favoris lors des changements de pseudo et améliore les performances générales de l'extension.

### Chat et lecteur

- Affichage optionnel des emotes 7TV et BetterTTV sans dépendre de FFZ.
- Indicateur discret du buffer sous le lecteur.
- Choix étendu de polices pour le chat, avec import de polices personnalisées.
- Options pour conserver les messages supprimés et afficher les réponses complètes.
- Bandeau de réponse personnalisé fondé sur les métadonnées natives de Twitch.

### Favoris et identités Twitch

- Suivi des streamers par identifiant Twitch stable lors d'un changement de pseudo.
- Correction manuelle d'un ancien pseudo sans perdre les catégories ni les filtres.
- Détection prudente des chaînes introuvables après trois vérifications confirmées.
- Nouvelle section « Favoris à vérifier » avec correction, nouvelle tentative et suppression.
- Expiration des anciens statuts live afin d'éviter les faux directs persistants.

### Interface et performances

- Bouton Favoris placé à gauche du bouton Follow/Unfollow et aligné sur son gabarit.
- Travail d'arrière-plan étalé pour limiter les ralentissements périodiques sur plusieurs streams.
- Amélioration du compact automatique et de son retour au mode normal.
- Refactor de la gestion des identités et du panneau des favoris à vérifier.

### Validation

- 80 tests automatisés réussis.
- Sources Chrome et Firefox synchronisées.
- ZIP Chrome Web Store et APK Android inclus.

## English

This release expands Twitch chat features, makes favorites resilient to username changes, and improves extension performance.

### Chat and player

- Optional 7TV and BetterTTV emotes without requiring FFZ.
- Discreet stream buffer indicator below the player.
- Expanded chat font selection with custom font imports.
- Options to preserve deleted messages and display complete replies.
- Custom reply banner based directly on Twitch metadata.

### Favorites and Twitch identities

- Stable Twitch ID tracking across username changes.
- Manual username repair without losing categories or filters.
- Missing channels are reported only after three confirmed checks.
- New Favorites to review section with repair, retry, and removal actions.
- Stale live states now expire instead of remaining visible indefinitely.

### Interface and performance

- Favorite button positioned before Follow/Unfollow and matched to its size.
- Background work is paced to reduce periodic slowdowns with multiple streams.
- Improved automatic compact mode and restoration to normal cards.
- Refactored identity handling and missing-favorite UI.

### Validation

- 80 automated tests passing.
- Chrome and Firefox sources synchronized.
- Chrome Web Store ZIP and Android APK included.
