# Marginalia — v0.1.5

## Replace in GitHub

- `index.html`
- `styles.css`
- `app.js`

Do **not** replace `config.js`, icons, manifest, or any `companion.md`.

## Faster Library

Marginalia now caches the Library catalogue locally.

- On subsequent launches the Library appears immediately from cache.
- Cached covers are restored from the browser cache.
- Returning from a book with **← Library** no longer contacts Dropbox.
- Opening Marginalia performs only a lightweight background check for
  added/removed book folders.
- Existing `companion.md` files are not downloaded just to draw the Library.
- A commentary is downloaded when its book is actually opened.
- **Refresh** explicitly re-reads book metadata and covers from Dropbox.

The first Library load after installing v0.1.5 may still take about as long as
before because the cache has to be created once.

## In-book navigation

The Contents drawer now has three tabs:

- **Contents**
- **Bookmarks**
- **Highlights**

Bookmarks and highlights shown there belong only to the open book. Tapping one
jumps directly to it.

The Library-level **Bookmarks** and **Highlights** buttons remain available for
viewing annotations across the whole collection.

## Existing annotation storage

Bookmarks and highlights still sync through:

`/Marginalia/_marginalia.json`

No database is used.
