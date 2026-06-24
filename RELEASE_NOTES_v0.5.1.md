# Twitch Favorites Sidebar v0.5.1

## Correctifs

- Configure le Client ID OAuth mobile fourni pour l'app Android.
- Corrige la synchronisation Google Drive mobile en utilisant le scope `drive.file`, compatible avec le flux OAuth `device code`.
- Deplace les nouveaux backups Drive vers un fichier standard cree par l'application, partageable entre extension et mobile.
- Garde une lecture de secours de l'ancien `appDataFolder` cote extension pour recuperer les anciens backups.

## Technique

- Mise a jour des scopes OAuth Chrome/Brave vers `https://www.googleapis.com/auth/drive.file`.
- Documentation Drive mise a jour pour expliquer pourquoi `drive.appdata` ne peut pas etre utilise avec le flux mobile.
