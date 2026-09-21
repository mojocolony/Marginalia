# Marginalia — v0.1.3

## GitHub patch

Replace:

- `index.html`
- `styles.css`
- `app.js`

Do **not** replace `config.js`, the icon files, or the manifest.

## Dropbox commentary

Replace the current `Against Empathy/companion.md` with `companion-v1.2.md`
and rename it back to `companion.md`.

The commentary wording is unchanged. This only corrects the Markdown footnote
definitions that had accidentally been stored with literal `\\n` characters.

## Changes

- Fixed footnote rendering so internal labels such as `[^book]`,
  `[^bloom2017]`, and `[^measurement]` become numbered superscript notes.
- Footnotes work in ordinary paragraphs, callouts, and list content.
- Repeated citations reuse the same note number and have backlinks.
- Added EB Garamond.
- Added Merriweather.
- Retained Georgia, Literata, and Bookerly.
- Expanded text-size choices to 15, 17, 19, 21, 23, 25, 27, 29, and 31 px.

Bookerly still uses the locally installed font when available and otherwise
falls back to Literata.
