# Espaces partagés

1. Créez un projet Supabase.
2. Pour une nouvelle base, exécutez une seule fois `setup.sql` dans l’éditeur SQL.

Le dossier `migrations/` conserve l’historique versionné pour Supabase CLI. Ne lancez pas
`setup.sql` sur une base qui possède déjà ces migrations : appliquez uniquement les nouvelles
migrations numérotées dans ce cas.

Après l’ajout d’une migration, régénérez le fichier consolidé avec `npm run sync:supabase`.
La commande `npm run check:supabase` vérifie qu’il est à jour.
3. Dans Authentication > Providers > Twitch, activez Twitch et renseignez le Client ID et le Client Secret de votre application Twitch.
4. Dans la console développeur Twitch, ajoutez cette URL de redirection OAuth :

   `https://lvzyrwwkjohuincoxdkv.supabase.co/auth/v1/callback`

5. Dans Supabase Authentication > URL Configuration > Redirect URLs, autorisez les URL de redirection de l’extension affichées lors de la connexion.
6. Renseignez l’URL du projet et la clé **publishable** dans `src/background/sharedSpacesConfig.mjs`.

Ne placez jamais une clé `service_role`, une clé secrète Supabase ou le secret Twitch dans l’extension.

Le chat des espaces partagés est ajouté par `016_shared_space_chat.sql`. Il conserve les messages,
réponses, suppressions douces, signalements et utilisateurs masqués. Les règles RLS et les fonctions
RPC limitent l’accès aux membres de chaque espace, avec une limite de cinq messages en dix secondes.
La migration `017_shared_space_chat_reactions.sql` ajoute les réactions rapides et la gestion
réversible des utilisateurs masqués.
La migration `018_shared_space_chat_editing.sql` permet à chaque auteur de corriger ses propres
messages et conserve la date de modification.
La migration `019_extension_usage_presence.sql` ajoute le compteur anonyme d'installations actives.
Elle ne conserve qu'une empreinte SHA-256 aléatoire, la version, l'environnement et la date du dernier
signal ; aucune identité Twitch n'est associée à cette table.

Les profils sont créés à la première connexion. Le champ `twitch_login` doit être alimenté depuis les métadonnées Twitch par le trigger du schéma. Les invitations par pseudo utilisent ce champ normalisé.
