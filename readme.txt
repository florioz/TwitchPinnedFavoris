Twitch Favorites Sidebar
========================

## About
Twitch Favorites Sidebar recreates the Twitch left sidebar and makes it available on every website. The extension injects a floating panel (or browser popup/side panel) that stays in sync with your pinned streamers, shows who is live in real time, fires glassmorphic notifications, and keeps categories, filters, and preferences consistent across Chrome, Chromium-based browsers, and Firefox.

## Core Features
- **Global overlay / popup** – Open the live list from the browser action (Chrome/Chromium) or through Firefox’s side panel. A popup fallback keeps the UI accessible even on restricted pages like `chrome://newtab`.
- **Smart categories** – Custom groups with counters, per-game filters, drag & drop sorting, automatic collapse state sync, and a configurable “Recently live” bucket.
- **Stylized toast notifications** – Glassmorphic toasts (avatar, title, game, viewer count) aligned under the extension button so they remain visible without blocking the page.
- **Fine-grained favorite management**  
  ▪ Contextual button on Twitch to pin/unpin channels  
  ▪ Per-favorite options (sort order, category filters, highlight toggle, badges)  
  ▪ Adjustable “Recent live” timeframe to spotlight fresh streams
- **Multi-browser support** – Manifest V3 baseline for Chrome/Edge/Opera and a dedicated Firefox build (`firefox/` folder) ready to load via `about:debugging`.
- **Responsive UI** – Shared `styles/panelOverlay.css` (gradients, glass layers, pill buttons, themed scrollbar). Standalone popup mirrors Twitch’s visual language.
- **Persistent preferences** – Stored via `chrome.storage`: sort mode, collapsed sections, toast duration, recent-live window, chat/mod history toggles, etc.
- **Notifications & badge updates** – Background worker polls Twitch, updates the badge with the number of live favorites, fires optional system notifications, and refreshes automatically via alarms.

## Installation
### Chrome / Edge / Opera
1. Download or clone this repository.  
2. Navigate to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project root.  
3. Pin the Twitch Favorites Sidebar icon and click it to open the panel anywhere.  
4. (Optional) For restricted pages, a popup fallback will appear automatically.

### Firefox
1. Download or clone this repository.  
2. Go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and choose `firefox/manifest.json`.  
3. The extension now appears in the toolbar; click it to open the panel or use the Chrome-style overlay when browsing Twitch.  
4. Reload via `about:debugging` whenever you pull new changes.

---

Twitch Favorites Sidebar
========================

## À propos
Twitch Favorites Sidebar reproduit la barre latérale gauche de Twitch et la rend disponible sur tous les sites. L’extension injecte un panneau flottant (ou popup / side panel) synchronisé avec vos streamers favoris, affiche ceux qui sont en direct, déclenche des notifications façon glassmorphism et conserve vos catégories, filtres et préférences à l’identique sur Chrome / Chromium et Firefox.

## Fonctionnalités
- **Panneau global / popup** – Ouvrez la liste des lives depuis le bouton d’action (Chrome/Chromium) ou via le side panel Firefox. Un popup de secours s’affiche même sur les pages restreintes (`chrome://newtab`, etc.).
- **Catégories intelligentes** – Groupes personnalisés avec compteur, filtres par jeu, tri par glisser-déposer, synchronisation de l’état replié et section “Début de live” configurable.
- **Notifications stylisées** – Toasts glassmorphism (avatar, titre, jeu, viewers) positionnés sous l’icône de l’extension pour rester visibles sans masquer la page.
- **Gestion précise des favoris**  
  ▪ Bouton contextuel sur Twitch pour épingler/désépingler  
  ▪ Options par favori (ordre de tri, filtres catégorie, mise en avant, badges)  
  ▪ Fenêtre “Début de live” ajustable pour mettre en avant les nouveaux lives
- **Compatibilité multi-navigateurs** – Manifest V3 commun et build Firefox dédiée (`firefox/`) prête à être chargée via `about:debugging`.
- **Interface responsive** – `styles/panelOverlay.css` partagé (dégradés, verre, boutons pill, scrollbar stylée). Popup standalone fidèle à l’UX Twitch.
- **Préférences persistantes** – Stockées via `chrome.storage` : mode de tri, sections repliées, durée des toasts, fenêtre “recent live”, options d’historique chat/mod, etc.
- **Notifications & badge** – Le service worker interroge Twitch, met à jour le badge avec le nombre de lives, déclenche les notifications système optionnelles et actualise automatiquement les données.

## Installation
### Chrome / Edge / Opera
1. Téléchargez ou clonez ce dépôt.  
2. Ouvrez `chrome://extensions`, activez le **mode développeur**, cliquez sur **Charger l’extension non empaquetée** et sélectionnez le dossier du projet.  
3. Épinglez l’icône de l’extension puis cliquez dessus pour afficher le panneau partout.  
4. Sur les pages restreintes, un popup de secours se déclenche automatiquement.

### Firefox
1. Téléchargez ou clonez ce dépôt.  
2. Allez sur `about:debugging#/runtime/this-firefox`, cliquez sur **Charger un module complémentaire temporaire…** et choisissez `firefox/manifest.json`.  
3. L’extension est accessible depuis la barre d’outils ; cliquez pour ouvrir le panneau ou utiliser l’overlay sur Twitch.  
4. Rechargez depuis `about:debugging` après chaque mise à jour du code.
