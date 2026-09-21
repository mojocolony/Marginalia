# Marginalia — v0.1.8

## Replace in GitHub

- `index.html`
- `styles.css`
- `app.js`

Do **not** replace `config.js`, icons, manifest, or any commentary file.

## Library cleanup

- Removed the redundant large **Marginalia** wordmark from the Library page.
  The app name already lives in the top bar.
- The Library page now has a compact **Library** heading.
- Desktop book cards use fixed-width columns instead of stretching when there
  are only one or two books.
- Every card has the same cover frame.
- Titles reserve two lines, so one-line and two-line titles keep their authors
  aligned.
- Covers use `object-fit: contain`, so different cover proportions do not get
  cropped.

## Mobile Library

- The Library actions are now a tidy 2×2 grid:
  **Bookmarks · Highlights · Refresh · Dropbox**.
- Book cards remain a two-column grid but use equal cover frames and aligned
  title/author areas.
- Tap targets are at least 44 px for the Library controls.
- Added a global `[hidden]` rule. This fixes the bookmark button appearing in
  the top bar on the Library screen on iPhone.

## Dropbox connection and recovery

- **Dropbox** is now an explicit Library control.
- It opens a connection panel showing whether Marginalia is connected.
- The panel provides both **Reconnect Dropbox** and **Disconnect Dropbox**.
- Old expired access tokens without a refresh token are now treated as
  disconnected instead of leaving Marginalia stuck with no way to reconnect.
- Dropbox failures no longer replace the entire Library with
  “Dropbox request failed.”
- If a cached Library exists, it remains visible and usable while a compact
  notice offers **Retry** and **Reconnect**.
- Error messages now distinguish expired authorization, missing permissions,
  missing Dropbox folders, rate limits, and network failures where possible.
- Disconnecting clears the cached Library/covers so switching Dropbox accounts
  cannot expose stale cards from the previous account.

## Performance

- Annotation loading and the Dropbox folder listing now run in parallel during
  a full refresh.
- Cached Library behaviour from v0.1.5 remains unchanged.

After GitHub Pages deploys, do one hard refresh on each device because earlier
Marginalia builds have been cached aggressively.
