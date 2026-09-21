# Marginalia — v0.1.2

This patch replaces the UI files from v0.1.1.

## Replace in GitHub

- `index.html`
- `styles.css`
- `app.js`

## Add to GitHub

- `icon.svg`
- `icon-180.png`
- `icon-192.png`
- `icon-512.png`
- `manifest.webmanifest`

Do **not** replace `config.js`.

## Changes

- Contents is now a working drawer on desktop and mobile.
- Contents typography is larger.
- The Aa button opens reading settings instead of switching directly to dark mode.
- Reading settings now include:
  - Georgia
  - Literata
  - Bookerly (when installed locally; otherwise Literata fallback)
  - 17, 19, 21, and 23 px text sizes
  - Light and dark modes
- Settings persist in local storage.
- The Dropbox connection button disappears after connection.
- Dropbox OAuth now requests an offline refresh token so future sessions can renew access automatically.
  - Existing users may need to connect one more time after their old access token expires before persistent renewal is available.
- Disconnect Dropbox is available inside Reading settings.
- Lucide `library-big` is now used for the app/header icon, favicon, Apple touch icon, and web-app manifest icons.

`companion.md` does not need to change for this update.
