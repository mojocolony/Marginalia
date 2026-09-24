Marginalia v0.1.21

Fixes cover startup performance introduced in v0.1.20.

Replace only:
- app.js

What changed:
- Cached cover images are restored from the browser Cache API in parallel before the Library grid is shown.
- Healthy cached libraries therefore open with their covers already present instead of painting them in one by one.
- Only genuinely missing cover images fall back to Dropbox, in the background.
- Dropbox fallback still repopulates the local cover cache for future launches.
