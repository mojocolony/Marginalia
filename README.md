# Marginalia — v0.1.12

## Replace in GitHub

- `app.js`

No other files need to change.

## Fix: incomplete book folders no longer break Dropbox

The Dropbox connection was working. The problem was that Marginalia treated
**every folder inside `/Marginalia` as a finished book**.

The new `The Life You Can Save` folder exists in Dropbox, but it does not yet
contain `companion.md`. Marginalia tried to download that missing file, Dropbox
correctly returned `path_not_found`, and the app incorrectly surfaced that as a
library/connection failure.

v0.1.12 changes the rule:

- a folder is a book only after it contains `companion.md`;
- incomplete folders are quietly ignored;
- they automatically appear after `companion.md` is added and the Library is
  refreshed;
- a missing `cover.jpg` also no longer breaks the Library; Marginalia will use
  its normal text placeholder instead.

No reconnect should be necessary. After deployment, hard-refresh once and press
**Refresh**.
