# Marginalia — v0.1.11

## Replace in GitHub

- `app.js`

No CSS, HTML, config, icon, manifest, or commentary files need to change.

## Dropbox fix

v0.1.10 made Dropbox folder detection too clever and too brittle. This version
removes that assumption.

Marginalia now:

1. accepts either the newer `window.MARGINALIA_CONFIG` **or** the original
   `window.READING_COMPANION_CONFIG`, so an older `config.js` cannot silently
   break Dropbox;
2. tries both historical library-folder names (`/Marginalia` and
   `/Reading Companions`);
3. if neither exists, searches Dropbox for the actual `companion.md` files and
   infers the library root from their real paths;
4. still supports Dropbox **App Folder** access, where the API root is already
   the Marginalia folder;
5. keeps a temporary backup of the OAuth PKCE verifier in localStorage as well
   as sessionStorage, making the Dropbox return trip more reliable on mobile
   Safari.

The public Dropbox app key already used by Marginalia is also retained as a
last-resort fallback if an older cached config file exposes the old variable
name.

This update does not change reading layout, reading-position persistence,
bookmarks, highlights, or the v0.1.10 mobile toolbar fix.

After deployment, hard-refresh once. Then press **Reconnect** once on a device
that is showing the old folder warning.
