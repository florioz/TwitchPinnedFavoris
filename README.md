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


Twitch Favorites Sidebar
Extension navigateur (Chrome & Firefox) qui apporte une liste dynamique de tes streamers Twitch favoris sur n’importe quel site.

Fonctionnalités principales
Panneau flottant ou popup global : affiche à la demande la liste des streamers en direct, directement depuis le bouton de l’extension (Chrome) ou via un side panel (Firefox).
Catégories intelligentes : organise tes favoris en groupes personnalisés, avec badge de compteur, tri avancé, filtres par jeu et possibilité de replier chaque catégorie. Les préférences de repli sont synchronisées.
Toast notifications : alerte visuelle pour les démarrages de live avec avatar, titre, jeu et nombre de spectateurs. Les toasts respectent la direction artistique Twitch (verre fumé, accent violet) et se positionnent sous l’icône de l’extension.
Gestion fine des favoris :
Ajout/suppression depuis Twitch grâce à un bouton contextuel.
Options par streamer (tri, jeu filtré, mise en avant “Début de live”, badge de viewers…).
Section “Début de live” configurée par temps de mise en avant.
Compatibilité multi-navigateurs :
Manifest V3 commun (Chrome, Edge, Opera).
Build Firefox dédiée incluse (firefox/), prête à être chargée via about:debugging.
Bouton d’action, side panel, et fallback popup pour les pages restreintes (new tab, etc.).
UI responsive :
Styles unifiés (styles/panelOverlay.css) : gradient, glassmorphism, boutons pill, scrollbar stylée.
Pop-up/panel standalone avec même direction artistique que Twitch.
Préférences persistantes via chrome.storage: mode tri, sections repliées, seuil “recent live”, durée des toasts, etc.
Debug tools optionnels : possibilité d’ajouter facilement un bouton de test (non inclus par défaut) pour simuler les notifications instantanées.
Notifications système (optionnelles dans le background) plus toasts in-extension, badge d’icône indiquant le nombre de lives actifs, actualisation automatique via alarmes.
