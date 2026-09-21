# Marginalia — v0.1.7

## Replace in GitHub

- `app.js`
- `styles.css`

No other files need to change.

## Fix

Highlights no longer wrap newline-only / structural whitespace between
paragraphs. Those invisible wrappers were creating anonymous inline line boxes,
which caused the extra vertical gaps visible after highlighting text.

Existing highlights will render correctly after this update; they do not need
to be recreated.
