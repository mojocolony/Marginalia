# Marginalia — v0.1.15

Replace these three files in GitHub:

- `index.html`
- `styles.css`
- `app.js`

## Changes

### Library card alignment
The title and author are now inset by the same amount as the cover artwork, so
their left edge aligns with the visible cover rather than the outside edge of
the cover frame.

### Full theme background on iPhone/iPad
The saved theme is applied before first paint and the root page canvas now uses
the active theme background. This is intended to keep the safe/status-bar area
around the Dynamic Island visually continuous with Marginalia rather than
retaining the previous theme colour.

### Reading-position persistence
Reading position has been rebuilt to be more robust:

- prevents the Library's scroll position from overwriting a saved book position
  while a book is opening;
- saves a structured section-relative position plus an absolute fallback;
- uses a stable per-book key that survives Dropbox exposing `/Marginalia/...`
  versus app-root `/...` paths;
- can recover reading positions saved by older path-based builds;
- waits for the reading font to finish loading before restoring position;
- continues to save on scroll, page hide, and app/background transitions.

No Dropbox authentication, bookmark, highlight, or commentary-file logic was
changed in this build.
