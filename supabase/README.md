# Espaces partagés

1. Créez un projet Supabase.
2. Exécutez les fichiers de `migrations/` dans l’ordre numérique dans l’éditeur SQL.
3. Dans Authentication > Providers > Twitch, activez Twitch et renseignez le Client ID et le Client Secret de votre application Twitch.
4. Dans la console développeur Twitch, ajoutez cette URL de redirection OAuth :

   `https://lvzyrwwkjohuincoxdkv.supabase.co/auth/v1/callback`

5. Dans Supabase Authentication > URL Configuration > Redirect URLs, autorisez les URL de redirection de l’extension affichées lors de la connexion.
6. Renseignez l’URL du projet et la clé **publishable** dans `src/background/sharedSpacesConfig.mjs`.

Ne placez jamais une clé `service_role`, une clé secrète Supabase ou le secret Twitch dans l’extension.

Les profils sont créés à la première connexion. Le champ `twitch_login` doit être alimenté depuis les métadonnées Twitch par le trigger du schéma. Les invitations par pseudo utilisent ce champ normalisé.
