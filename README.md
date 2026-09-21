# Marginalia — v0.1.0

A small Dropbox-backed personal library for long-form Markdown book companions.

**Suggested GitHub repository:** `marginalia`  
**Repository description:** `A personal Dropbox-backed library for long-form book Marginalia companions.`

## Dropbox structure

    Marginalias/
        Against Empathy/
            companion.md
            cover.jpg
        Another Book/
            companion.md
            cover.jpg

Each `companion.md` begins with:

    ---
    title: Against Empathy
    subtitle: The Case for Rational Compassion
    author: Paul Bloom
    year: 2016
    companion_version: 1.0
    cover: cover.jpg
    ---

## Dropbox setup

1. Create a Dropbox API app in the Dropbox App Console.
2. Choose **Scoped access** and **Full Dropbox**.
3. Enable `files.metadata.read` and `files.content.read`.
4. Copy the **App key** into `config.js`.
5. Upload the four app files to GitHub and enable GitHub Pages.
6. Add the exact deployed GitHub Pages URL as a **Redirect URI** in the Dropbox app console.
7. Open the app and choose **Connect Dropbox**.

The app key is a public browser-client identifier. **Do not put an app secret or access token in the repository.**

## First-build features

- Dropbox-backed library
- one folder per book
- Markdown as canonical source
- optional cover image
- automatic library generation
- responsive reading view
- automatic table of contents
- remembered reading position
- light/dark reading mode

There is no database, no Supabase and no editing interface.

`marked` is loaded from jsDelivr for Markdown rendering.
