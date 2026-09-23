# Marginalia v0.1.20 patch

Fixes disappearing library covers when the local library metadata cache survives but the browser cover-image cache has been cleared.

## Update

Replace only `app.js` in the GitHub Pages repository with the file in this patch.

The app now checks its local cover cache first and, when a cached image is missing, automatically downloads that cover from Dropbox and repopulates the cache. No book folders, covers, or companion files need to be changed.
