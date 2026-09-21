# Marginalia — v0.1.10

## Replace in GitHub

- `app.js`
- `styles.css`

No other files need to change.

## Fixed: mobile controls disappearing

The reader toolbar is now fixed on iPhone/iPad instead of relying on sticky
positioning. Navigation, Bookmark, and Aa stay reachable while reading at any
scroll position.

## Fixed: reading position no longer being remembered

v0.1.9 prevented horizontal overflow with `overflow-x:hidden` on the root
document. On iOS Safari that can create a different scrolling container, so
`window.scrollY` no longer reliably tracked the reader.

v0.1.10 uses `overflow-x:clip` instead. Horizontal drifting remains blocked,
but normal document scrolling is restored.

Reading position is also now explicitly saved:

- while scrolling;
- before returning to the Library;
- when Safari hides/suspends the page;
- on `pagehide`.

## Fixed: false “/Marginalia could not be found” Dropbox warning

Dropbox has two possible access models:

1. **Full Dropbox** — `/Marginalia` is a real folder path.
2. **App folder** — the Marginalia app folder is already exposed as API root,
   so asking for `/Marginalia` incorrectly looks for a second nested folder.

Marginalia now detects both automatically. It tries the configured
`/Marginalia` folder first and, if Dropbox reports that path missing, falls
back to the app-folder API root.

Bookmarks/highlights use the same resolved root, so their annotation file is
read and written in the correct place in either mode.

After deployment, hard-refresh Safari once.
