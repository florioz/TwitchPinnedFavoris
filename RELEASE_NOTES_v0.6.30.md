# Twitch Favorites Sidebar v0.6.30

22 octobre 2026 / October 22, 2026. Changes since v0.6.29.

## Français

- Recherche optionnelle des favoris live dans la sidebar, compacte et visible au survol ; le champ reste visible pendant la saisie ou avec un filtre actif.
- Correction du glisser-déposer interrompu par les actualisations et restauration de la sidebar après une reconstruction de Twitch.
- Limitation de la mémoire de l’historique et des files du chat ; regroupement des attentes de chargement des émoticônes.
- Navigation depuis l’historique de modération améliorée pour les messages supprimés encore présents dans le chat.
- Gestion des accès au stockage après rechargement de l’extension et nouvelle tentative limitée pour les badges communautaires sans réponse.
- Chat partagé : notifications privées temps réel, pause en arrière-plan, rattrapage et vérification de secours ; moins de lectures lorsque le chat est replié. **Activation serveur requise : appliquer la migration 020. Sans elle, le chat visible conserve une vérification toutes les 5 secondes.**
- Refactoring : suppression de code inutilisé, nettoyage unifié, indexation des réactions et renouvellements de session regroupés.
- Sécurité : Capacitor Android passe à 8.4.3 et dépendances de construction corrigées. Les anciens APK doivent être remplacés.

## English

- Optional compact live-favorites search, shown on sidebar hover and kept visible while focused or filtering.
- Fixed drag-and-drop interruptions during refreshes and sidebar recovery after Twitch rebuilds.
- Bounded chat history and processing queues; shared emote-loading waits reduce retained memory.
- Improved moderation-history navigation to deleted messages still present in chat.
- Safer storage handling after extension reloads and a bounded retry for missing community-badge responses.
- Shared chat: private realtime notifications, background pause, reconnect catch-up and polling fallback. **Server activation required: apply migration 020. Without it, visible chat falls back to polling every 5 seconds.**
- Removed unused code, unified cleanup, indexed chat reactions and deduplicated session renewal.
- Security: Capacitor Android upgraded to 8.4.3; vulnerable build dependencies updated. Previously installed APKs must be replaced.

## Deployment / Déploiement

Apply `supabase/migrations/020_shared_chat_realtime.sql` once to the existing Supabase project. Do not rerun `setup.sql` on an existing database. This release does not automatically apply server migrations. Realtime authorization requires end-to-end verification against the deployed database.

Chrome and Firefox ZIP packages; Android companion development APK (`assembleDebug`, not a signed production-store build). No multi-hour browser memory profiling was performed.
