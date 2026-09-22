# Marginalia — v0.1.16

Replace `app.js` in GitHub with the included file.

## Change

### Alphabetical library sorting ignores leading articles
Books are now alphabetized by title while ignoring the English leading articles:

- `A`
- `An`
- `The`

The displayed title itself is unchanged. For example:

- *The Alignment Problem* sorts under **A**
- *The Creative Act* sorts under **C**
- *A Farewell to Arms* sorts under **F**

The same rule is applied both to freshly loaded Dropbox books and to the cached library shown on startup.

No Dropbox, reading-position, annotation, cover, or layout logic was changed.
