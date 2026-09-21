# Marginalia — v0.1.9

## Replace in GitHub

- `styles.css`

No other file needs to change.

## Mobile reader fix

The reader could become wider than the phone viewport because long, unbroken
source URLs in the Notes section expanded the document width. On iOS Safari
that made the whole page horizontally pannable, so touching or dragging could
shift the reading column around.

v0.1.9:

- locks the document and reader to the viewport width;
- disables horizontal page panning while preserving vertical scrolling and
  pinch zoom;
- forces long URLs and other unbroken strings to wrap;
- constrains media, tables, and code blocks to the reading width;
- keeps the reading article explicitly inside the mobile viewport.

## Mobile app name

Earlier builds deliberately hid the word **Marginalia** on screens under
640 px. It was not dark-on-dark.

v0.1.9 restores **Marginalia** beside the icon on normal phone widths and only
hides the text as a last-resort fallback below 365 px so the Navigation,
bookmark, and Aa controls still fit.

After GitHub Pages deploys, hard-refresh Safari once because the stylesheet may
still be cached.
