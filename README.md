# Marginalia — v0.1.6

## Replace in GitHub

- `index.html`
- `styles.css`
- `app.js`

Do **not** replace `config.js`, icons, manifest, or `companion.md`.

## Changes

### Navigation
- The top **Contents** button is now **Navigation**.
- The drawer heading is also **Navigation**.
- The internal tabs remain **Contents · Bookmarks · Highlights**.

### Highlighting
- Selecting text now places the **Highlight** control next to the selection.
- Marginalia intelligently places it above or below the selected text.
- If the browser cannot provide a reliable selection rectangle, or there is
  not enough room, Marginalia falls back to the bottom floating control.
- The toolbar preserves the selection when clicked.

### Visible bookmarks
- Lucide's **Bookmark** icon now appears beside every bookmarked section
  heading in the reading page.
- On desktop it sits in the left margin.
- On narrow/mobile layouts it sits inline with the heading.
- Clicking the visible page marker removes that bookmark.
- Bookmark lists use the same icon for visual consistency.
- The top toolbar bookmark remains outline/filled according to the current
  section's bookmark state.

No Dropbox or commentary changes are required for this version.
