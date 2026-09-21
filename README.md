# Marginalia — v0.1.13

## Replace in GitHub

- `index.html`
- `styles.css`
- `app.js`

## Reader colour themes

Marginalia now uses the five reading themes from the Reader app:

- **Light** — `#fffdfa`
- **Sepia** — `#f4eddf`
- **Grey** — `#e6ecf2`
- **Dark** — `#181817`
- **E-Ink** — `#ffffff`

The Grey theme is the exact Reader blue-grey, not a generic neutral grey.

The related Reader text/panel colours were also carried across so each theme
keeps the intended contrast rather than changing only the page background.

Theme choice remains stored in Marginalia's existing local reading settings,
so it persists across books and sessions.

No Dropbox, bookmark, highlight, reading-position, or mobile-navigation logic
was changed in this build.
