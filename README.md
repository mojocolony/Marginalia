# Marginalia — v0.1.4

## Replace in GitHub

- `index.html`
- `styles.css`
- `app.js`

Do **not** replace `config.js`, the icon files, the manifest, or `companion.md`.

## Dropbox permission required for bookmarks and highlights

In the Dropbox App Console, enable:

- `files.metadata.read`
- `files.content.read`
- `files.content.write`

After enabling `files.content.write`, existing authorization does not gain the
new permission automatically. In Marginalia:

1. Open **Aa**.
2. Choose **Disconnect Dropbox**.
3. Connect Dropbox again once.

The app then keeps bookmarks and highlights in:

`/Marginalia/_marginalia.json`

No database is used.

## v0.1.4 changes

### Footnotes
- Tapping a footnote number now opens the note in place.
- On mobile the note appears as a bottom sheet.
- The Notes section remains at the end of the commentary.
- **Go to note** is available when a full jump is wanted.
- Footnote numbers and return arrows have larger mobile hit targets.

### Bookmarks
- A bookmark button appears while reading.
- It bookmarks the current section rather than a fragile pixel position.
- Tapping the button again removes the bookmark.
- The Library has a **Bookmarks** view.
- Bookmarks are synced through Dropbox.

### Highlights
- Select text and a **Highlight** control appears.
- Highlights are restored when the book is reopened.
- The Library has a **Highlights** view.
- Clicking an existing highlight offers **Remove highlight**.
- Highlights store the selected quotation plus surrounding context rather than
  raw character positions, making them more resilient to typography changes.
- Highlights are synced through Dropbox.

The app still keeps ordinary reading position and typography settings locally
on each device.
