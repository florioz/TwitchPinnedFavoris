# Twitch Favorites Sidebar v0.6.25

## Français

Cette version corrective rétablit les notifications de l’extension lorsqu’un utilisateur répond directement à l’un de vos messages avec la fonctionnalité native de Twitch.

### Correctifs

- Les réponses Twitch sont maintenant détectées lorsque leur contexte est placé dans un élément enfant du message.
- Les réponses chargées progressivement par Twitch sont réévaluées dès que leur texte ou leurs métadonnées apparaissent.
- La mise en évidence et le son de notification configuré fonctionnent de nouveau pour les réponses directes.
- Un pseudo présent uniquement dans le message cité ne déclenche pas de fausse notification.
- Les anciennes structures Twitch fondées sur l’attribut `aria-label` restent compatibles.

### Qualité

- Sources Chromium et Firefox synchronisées.
- Tests automatisés dédiés aux nouvelles structures de réponse et aux faux positifs.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This corrective release restores extension notifications when another user directly replies to one of your messages with Twitch’s native reply feature.

### Fixes

- Twitch replies are now detected when their context is stored inside a nested message element.
- Replies populated progressively by Twitch are re-evaluated as soon as their text or metadata appears.
- Configured highlighting and notification sounds work again for direct replies.
- A username appearing only inside the quoted message no longer causes a false notification.
- Older Twitch structures based on the message `aria-label` remain supported.

### Quality

- Chromium and Firefox sources synchronized.
- Automated coverage added for the new reply structures and false-positive prevention.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.
