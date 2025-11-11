Twitch Favorites Sidebar
========================

Keep your Twitch favorites at your fingertips on every tab.

## About

Twitch Favorites Sidebar recreates the left sidebar from twitch.tv, but makes it available everywhere you browse. It injects a polished floating panel (or browser popup/side panel) that stays in sync with your pinned streamers, shows who is live, fires instant glassmorphic notifications, and keeps categories, filters, and preferences consistent across Chrome and Firefox builds.

## Core Features

- **Global overlay / popup**  
  Launch the live list from the browser action (Chrome/Chromium) or via the Firefox side panel. A popup fallback guarantees access even on restricted pages such as the new‑tab view.

- **Smart categories**  
  Custom groups with counters, per‑game filters, drag & drop sorting, collapse state sync, and a configurable “Recently live” bucket.

- **Stylized toast notifications**  
  Glassmorphic toasts (avatar, title, game, viewer count) aligned beneath the extension icon so they stay visible without blocking the page.

- **Fine‑grained favorite management**  
  - Context button on Twitch to pin/unpin channels.  
  - Per‑favorite options (sort order, category filters, highlight toggle, badges).  
  - Adjustable “Recent live” threshold to spotlight fresh streams.

- **Multi‑browser support**  
  - Manifest V3 baseline for Chrome, Edge, Opera, etc.  
  - Dedicated Firefox bundle (`firefox/`) ready to load via `about:debugging`.  
  - Same UI/UX across overlay, popup, and side panel modes.

- **Responsive UI**  
  Shared `styles/panelOverlay.css` (gradients, glass layers, pill buttons, themed scrollbar). Standalone popup mirrors Twitch’s visual language.

- **Persistent preferences**  
  Stored via `chrome.storage`: sort mode, collapsed sections, toast duration, “recent live” window, chat/mod history toggles, and more.

- **Notifications & badge updates**  
  Background worker polls Twitch, syncs the badge with the number of live favorites, fires optional system notifications, and refreshes automatically via alarms.



--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------



Twitch Favorites Sidebar — Extension Navigateur (Chrome & Firefox)

Ajoute une liste dynamique de tes streamers Twitch favoris sur n’importe quel site, avec une UI cohérente à l’identité Twitch.

✨ Fonctionnalités principales

Panneau flottant / popup global
Affiche à la demande la liste des streamers en direct : via le bouton de l’extension (Chrome) ou un side panel (Firefox).

Catégories intelligentes
Groupes personnalisés avec badge compteur, tri avancé, filtres par jeu, et repli par catégorie.
Les préférences de repli sont synchronisées.

Toast notifications
Alertes visuelles pour les démarrages de live : avatar, titre, jeu, viewers.
Style verre fumé avec accent violet Twitch, positionnées sous l’icône de l’extension.

Gestion fine des favoris
Ajout/suppression depuis Twitch (bouton contextuel).
Options par streamer : tri, jeu filtré, mise en avant “Début de live”, badge de viewers, etc.
Section “Début de live” configurable (durée de mise en avant).

🌐 Compatibilité & build

Manifest V3 commun (Chrome, Edge, Opera).

Build Firefox dédiée (firefox/), prête à charger via about:debugging.

Bouton d’action, side panel, et fallback popup pour pages restreintes (nouvel onglet, etc.).

🎨 UI & expérience

UI responsive avec styles unifiés (styles/panelOverlay.css).

Thèmes : gradient, glassmorphism, boutons pill, scrollbar stylée.

Popup/panel standalone aligné avec la DA Twitch.

⚙️ Préférences & persistance

Stockage via chrome.storage :
mode de tri, sections repliées, seuil “recent live”, durée des toasts, etc.

🧪 Outils de debug (optionnels)

Possibilité d’ajouter un bouton de test (non inclus par défaut) pour simuler des notifications instantanées.

🔔 Notifications & actualisation

Notifications système (optionnelles en background) + toasts dans l’extension.

Badge d’icône indiquant le nombre de lives actifs.

Actualisation automatique via alarmes.
