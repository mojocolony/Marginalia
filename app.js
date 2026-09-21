(() => {
  "use strict";

  const C = window.MARGINALIA_CONFIG || {};

  const KEYS = {
    token: "marginalia.token",
    refresh: "marginalia.refreshToken",
    expires: "marginalia.tokenExpires",
    pkce: "marginalia.pkce",
    settings: "marginalia.settings",
    position: "marginalia.pos.",
    libraryCache: "marginalia.libraryCache.v1"
  };

  const ANNOTATIONS_FILE = `${C.DROPBOX_FOLDER || "/Marginalia"}/_marginalia.json`;

  const $ = id => document.getElementById(id);

  const e = {
    welcome: $("welcome"),
    library: $("library"),
    reader: $("reader"),
    grid: $("grid"),
    status: $("status"),
    connect: $("connect"),
    connectWelcome: $("connect2"),

    toc: $("toc"),
    tocLinks: $("tocLinks"),
    tocButton: $("tocButton"),
    closeToc: $("closeToc"),
    tocBackdrop: $("tocBackdrop"),
    contentsTab: $("contentsTab"),
    bookmarksTab: $("bookmarksTab"),
    highlightsTab: $("highlightsTab"),
    contentsPane: $("contentsPane"),
    bookmarksPane: $("bookmarksPane"),
    highlightsPane: $("highlightsPane"),

    bookmarkButton: $("bookmarkButton"),
    bookmarksView: $("bookmarksView"),
    highlightsView: $("highlightsView"),

    settingsButton: $("settingsButton"),
    settingsDialog: $("settingsDialog"),
    bookHead: $("bookHead"),
    body: $("content"),
    disconnect: $("disconnect"),
    fontChoices: $("fontChoices"),
    sizeChoices: $("sizeChoices"),
    themeChoices: $("themeChoices"),

    footnoteDialog: $("footnoteDialog"),
    footnoteTitle: $("footnoteTitle"),
    footnoteBody: $("footnoteBody"),
    goToFootnote: $("goToFootnote"),

    savedDialog: $("savedDialog"),
    savedTitle: $("savedTitle"),
    savedList: $("savedList"),

    highlightDialog: $("highlightDialog"),
    highlightQuote: $("highlightQuote"),
    removeHighlight: $("removeHighlight"),

    selectionToolbar: $("selectionToolbar"),
    highlightSelection: $("highlightSelection"),
    toast: $("toast")
  };

  let books = [];
  let current = null;
  let currentFootnoteTarget = null;
  let currentHighlightId = null;
  let pendingHighlight = null;
  let annotationsLoaded = false;
  let saveQueue = Promise.resolve();
  let toastTimer = null;

  let annotations = {
    version: 1,
    bookmarks: [],
    highlights: []
  };

  function show(section) {
    [e.welcome, e.library, e.reader].forEach(el => {
      el.hidden = el !== section;
    });

    const reading = section === e.reader;
    e.tocButton.hidden = !reading;
    e.bookmarkButton.hidden = !reading;
    e.settingsButton.hidden = !reading;

    closeContents();
    hideSelectionToolbar();
    updateConnectionUI();
    updateBookmarkButton();
  }

  function updateConnectionUI() {
    const connected =
      !!localStorage.getItem(KEYS.token) ||
      !!localStorage.getItem(KEYS.refresh);

    e.connect.hidden = connected;
    e.connectWelcome.hidden = connected;
  }

  function redirectUri() {
    return location.origin + location.pathname;
  }

  function base64Url(bytes) {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  async function connectDropbox() {
    if (!C.DROPBOX_APP_KEY || C.DROPBOX_APP_KEY.includes("PASTE_")) {
      e.status.textContent = "Add the Dropbox app key to config.js first.";
      return;
    }

    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
    sessionStorage.setItem(KEYS.pkce, verifier);

    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    );

    const query = new URLSearchParams({
      client_id: C.DROPBOX_APP_KEY,
      response_type: "code",
      code_challenge: base64Url(digest),
      code_challenge_method: "S256",
      token_access_type: "offline",
      redirect_uri: redirectUri(),
      scope: "files.metadata.read files.content.read files.content.write"
    });

    location.href = "https://www.dropbox.com/oauth2/authorize?" + query;
  }

  function storeTokenResponse(data) {
    if (data.access_token) {
      localStorage.setItem(KEYS.token, data.access_token);
    }

    if (data.refresh_token) {
      localStorage.setItem(KEYS.refresh, data.refresh_token);
    }

    if (data.expires_in) {
      const expiresAt = Date.now() + (Number(data.expires_in) * 1000) - 60000;
      localStorage.setItem(KEYS.expires, String(expiresAt));
    }
  }

  async function finishOAuth() {
    const query = new URLSearchParams(location.search);
    const code = query.get("code");
    if (!code) return;

    const verifier = sessionStorage.getItem(KEYS.pkce);
    if (!verifier) {
      throw new Error("Dropbox sign-in state was lost. Connect again.");
    }

    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: C.DROPBOX_APP_KEY,
      code_verifier: verifier,
      redirect_uri: redirectUri()
    });

    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body
    });

    if (!response.ok) {
      throw new Error("Dropbox sign-in could not be completed.");
    }

    storeTokenResponse(await response.json());
    sessionStorage.removeItem(KEYS.pkce);
    history.replaceState({}, "", location.pathname);
  }

  async function refreshAccessToken() {
    const refreshToken = localStorage.getItem(KEYS.refresh);
    if (!refreshToken) return null;

    const body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_id: C.DROPBOX_APP_KEY
    });

    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body
    });

    if (!response.ok) {
      disconnectDropbox(false);
      return null;
    }

    const data = await response.json();
    storeTokenResponse(data);
    return data.access_token || null;
  }

  async function accessToken() {
    const existing = localStorage.getItem(KEYS.token);
    const expiry = Number(localStorage.getItem(KEYS.expires) || 0);

    if (existing && (!expiry || Date.now() < expiry)) {
      return existing;
    }

    return await refreshAccessToken();
  }

  async function api(endpoint, arg, content = false, retry = true) {
    const token = await accessToken();

    if (!token) {
      throw new Error("Dropbox needs to be connected.");
    }

    const headers = {Authorization: "Bearer " + token};

    if (content) {
      headers["Dropbox-API-Arg"] = JSON.stringify(arg);
    } else {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(
      (content ? "https://content.dropboxapi.com/2/" : "https://api.dropboxapi.com/2/") + endpoint,
      {
        method: "POST",
        headers,
        body: content ? undefined : JSON.stringify(arg)
      }
    );

    if (response.status === 401 && retry && localStorage.getItem(KEYS.refresh)) {
      localStorage.removeItem(KEYS.token);
      localStorage.removeItem(KEYS.expires);

      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return api(endpoint, arg, content, false);
      }
    }

    if (!response.ok) {
      const error = new Error("Dropbox request failed.");
      error.status = response.status;
      error.detail = await response.text();
      throw error;
    }

    return content ? response : response.json();
  }

  async function uploadText(path, value, retry = true) {
    const token = await accessToken();

    if (!token) {
      throw new Error("Dropbox needs to be connected.");
    }

    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path,
          mode: "overwrite",
          autorename: false,
          mute: true,
          strict_conflict: false
        })
      },
      body: value
    });

    if (response.status === 401 && retry && localStorage.getItem(KEYS.refresh)) {
      localStorage.removeItem(KEYS.token);
      localStorage.removeItem(KEYS.expires);

      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return uploadText(path, value, false);
      }
    }

    if (!response.ok) {
      const error = new Error("Dropbox could not save annotations.");
      error.status = response.status;
      error.detail = await response.text();
      throw error;
    }

    return response.json();
  }

  async function list(path) {
    let data = await api("files/list_folder", {path});
    const entries = [...data.entries];

    while (data.has_more) {
      data = await api("files/list_folder/continue", {cursor: data.cursor});
      entries.push(...data.entries);
    }

    return entries;
  }

  async function text(path) {
    return (await api("files/download", {path}, true)).text();
  }

  const COVER_CACHE = "marginalia-covers-v1";

  async function coverFromCache(path) {
    if (!("caches" in window)) return null;

    try {
      const cache = await caches.open(COVER_CACHE);
      const response = await cache.match(new Request(location.origin + "/__marginalia_cover__" + path));
      if (!response) return null;
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  async function imageUrl(path) {
    try {
      const response = await api("files/download", {path}, true);
      const blob = await response.blob();

      if ("caches" in window) {
        try {
          const cache = await caches.open(COVER_CACHE);
          await cache.put(
            new Request(location.origin + "/__marginalia_cover__" + path),
            new Response(blob)
          );
        } catch {}
      }

      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  function frontMatter(textValue) {
    const meta = {};
    let body = textValue;

    if (textValue.startsWith("---")) {
      const end = textValue.indexOf("\n---", 3);

      if (end > 0) {
        textValue.slice(3, end).trim().split(/\r?\n/).forEach(line => {
          const colon = line.indexOf(":");

          if (colon > 0) {
            const key = line.slice(0, colon).trim();
            const value = line
              .slice(colon + 1)
              .trim()
              .replace(/^["']|["']$/g, "");

            meta[key] = value;
          }
        });

        body = textValue.slice(end + 4).replace(/^\s+/, "");
      }
    }

    return {meta, body};
  }

  const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

  const BOOKMARK_ICON_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>`;

  function renderPageBookmarks() {
    if (!current) return;

    e.body
      .querySelectorAll(".pageBookmarkMarker")
      .forEach(marker => marker.remove());

    const bookBookmarks = annotations.bookmarks
      .filter(bookmark => bookmark.bookPath === current.path);

    bookBookmarks.forEach(bookmark => {
      if (!bookmark.anchor || bookmark.anchor === "__top") return;

      const heading = document.getElementById(bookmark.anchor);
      if (!heading) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "pageBookmarkMarker";
      button.innerHTML = BOOKMARK_ICON_SVG;
      button.setAttribute("aria-label", `Remove bookmark: ${bookmark.heading || heading.textContent.trim()}`);
      button.title = "Remove bookmark";

      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        annotations.bookmarks =
          annotations.bookmarks.filter(item => item.id !== bookmark.id);

        renderPageBookmarks();
        renderBookAnnotations();
        updateBookmarkButton();
        showToast("Bookmark removed.");

        try {
          await persistAnnotations();
        } catch {}
      });

      heading.insertBefore(button, heading.firstChild);
    });
  }

  function bookmarkIconInline() {
    return `<svg class="savedBookmarkIcon" viewBox="0 0 24 24" aria-hidden="true"
      fill="currentColor" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>`;
  }

  function extractFootnotes(markdown) {
    markdown = markdown
      .replace(/\\n\\n(?=\[\^[^\]]+\]:)/g, "\n\n")
      .replace(/\\n\s*$/g, "");

    const definitions = new Map();
    const numbers = new Map();
    const order = [];
    const referenceCounts = new Map();

    markdown = markdown.replace(
      /^\[\^([^\]]+)\]:\s*(.+)$/gm,
      (_, id, value) => {
        definitions.set(id.trim(), value.trim());
        return "";
      }
    );

    markdown = markdown.replace(
      /\[\^([^\]]+)\]/g,
      (whole, rawId) => {
        const id = rawId.trim();

        if (!definitions.has(id)) return whole;

        if (!numbers.has(id)) {
          numbers.set(id, order.length + 1);
          order.push(id);
        }

        const number = numbers.get(id);
        const count = (referenceCounts.get(id) || 0) + 1;
        referenceCounts.set(id, count);

        const safe = id.replace(/[^a-zA-Z0-9_-]/g, "-");

        return `<sup class="footnote-ref" id="fnref-${safe}-${count}"><a href="#fn-${safe}" aria-label="Footnote ${number}" data-footnote-number="${number}">${number}</a></sup>`;
      }
    );

    return {
      markdown,
      definitions,
      numbers,
      order,
      referenceCounts
    };
  }

  function footnotesHtml(footnotes) {
    if (!footnotes.order.length) return "";

    const items = footnotes.order.map(id => {
      const safe = id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const content = marked.parseInline(footnotes.definitions.get(id) || "");
      const count = footnotes.referenceCounts.get(id) || 1;

      const backlinks = Array.from(
        {length: count},
        (_, index) =>
          `<a class="footnote-back" href="#fnref-${safe}-${index + 1}" aria-label="Back to reference ${index + 1}">↩</a>`
      ).join(" ");

      return `<li id="fn-${safe}">${content} ${backlinks}</li>`;
    }).join("");

    return `<section class="footnotes" aria-label="Notes"><h2>Notes</h2><ol>${items}</ol></section>`;
  }

  function enhanceCallouts() {
    const labels = {
      "KEY IDEA": "Key idea",
      "EVIDENCE": "The evidence",
      "CRITICAL QUESTION": "Critical question",
      "DON'T MISUNDERSTAND": "Don’t misunderstand the argument"
    };

    e.body.querySelectorAll("blockquote").forEach(blockquote => {
      const firstParagraph = blockquote.querySelector("p");
      if (!firstParagraph) return;

      const match = firstParagraph.innerHTML.match(
        /^\[!(KEY IDEA|EVIDENCE|CRITICAL QUESTION|DON'T MISUNDERSTAND)\]\s*/i
      );

      if (!match) return;

      const key = match[1].toUpperCase();

      firstParagraph.innerHTML =
        firstParagraph.innerHTML.replace(match[0], "");

      blockquote.classList.add(
        "callout",
        key.toLowerCase().replace(/[^a-z]+/g, "-")
      );

      const label = document.createElement("div");
      label.className = "callout-label";
      label.textContent = labels[key] || key;

      blockquote.insertBefore(label, blockquote.firstChild);
    });
  }

  function showToast(message, timeout = 2200) {
    clearTimeout(toastTimer);
    e.toast.textContent = message;
    e.toast.hidden = false;

    toastTimer = setTimeout(() => {
      e.toast.hidden = true;
    }, timeout);
  }

  async function loadAnnotations() {
    try {
      const raw = await text(ANNOTATIONS_FILE);
      const parsed = JSON.parse(raw);

      annotations = {
        version: 1,
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : []
      };
    } catch (error) {
      if (error.status === 409) {
        annotations = {version: 1, bookmarks: [], highlights: []};
      } else {
        annotations = {version: 1, bookmarks: [], highlights: []};
      }
    }

    annotationsLoaded = true;
    updateBookmarkButton();

    if (current && !e.reader.hidden) {
      applyHighlightsForCurrentBook();
      renderBookAnnotations();
      renderPageBookmarks();
    }
  }

  function persistAnnotations() {
    annotations.version = 1;
    annotations.updated = new Date().toISOString();

    const snapshot = JSON.stringify(annotations, null, 2);

    saveQueue = saveQueue
      .catch(() => {})
      .then(() => uploadText(ANNOTATIONS_FILE, snapshot))
      .catch(error => {
        const permissions =
          error.status === 401 ||
          error.status === 403 ||
          /scope|permission|insufficient/i.test(error.detail || "");

        showToast(
          permissions
            ? "Dropbox write permission is required. Enable files.content.write, then reconnect once."
            : "Could not save annotations to Dropbox.",
          4800
        );

        throw error;
      });

    return saveQueue;
  }

  function readLibraryCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEYS.libraryCache) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeLibraryCache(items) {
    const compact = items.map(book => ({
      path: book.path,
      title: book.title,
      author: book.author,
      coverPath: book.coverPath || `${book.path}/cover.jpg`
    }));

    localStorage.setItem(KEYS.libraryCache, JSON.stringify(compact));
  }

  async function hydrateCachedCovers() {
    for (const book of books) {
      if (book.cover || !book.coverPath) continue;

      const cached = await coverFromCache(book.coverPath);
      if (!cached) continue;

      book.cover = cached;
      const img = e.grid.querySelector(
        `[data-book-path="${CSS.escape(book.path)}"] .coverSlot`
      );

      if (img) {
        img.outerHTML = `<img class="cover coverSlot" src="${cached}" alt="">`;
      }
    }
  }

  function loadCachedLibrary() {
    const cached = readLibraryCache();

    if (!cached.length) return false;

    books = cached.map(item => ({
      ...item,
      markdown: null,
      cover: null
    }));

    renderLibrary();
    hydrateCachedCovers();
    return true;
  }

  async function discoverBook(folder, cachedByPath, force = false) {
    const cached = cachedByPath.get(folder.path_lower);

    if (cached && !force) {
      return {
        path: cached.path,
        title: cached.title,
        author: cached.author,
        coverPath: cached.coverPath || `${folder.path_lower}/cover.jpg`,
        markdown: null,
        cover: await coverFromCache(
          cached.coverPath || `${folder.path_lower}/cover.jpg`
        )
      };
    }

    // A brand-new book needs one metadata read. After that, its title/author
    // are cached locally and future Library loads do not fetch companion.md.
    const markdown = await text(folder.path_lower + "/companion.md");
    const {meta} = frontMatter(markdown);
    const coverPath =
      folder.path_lower + "/" + (meta.cover || "cover.jpg");

    return {
      path: folder.path_lower,
      title: meta.title || folder.name,
      author: meta.author || "",
      coverPath,
      markdown: null,
      cover: await imageUrl(coverPath)
    };
  }

  async function loadLibrary(force = false) {
    if (!force && books.length) {
      show(e.library);
      renderLibrary();
      hydrateCachedCovers();
      return;
    }

    show(e.library);

    if (!books.length) {
      const hadCache = loadCachedLibrary();

      if (!hadCache) {
        e.grid.innerHTML = "<p>Loading library…</p>";
      }
    }

    if (force) {
      e.library?.classList?.add("libraryRefreshing");
    }

    try {
      if (!annotationsLoaded) {
        await loadAnnotations();
      }

      const folders = (await list(C.DROPBOX_FOLDER))
        .filter(entry =>
          entry[".tag"] === "folder" &&
          !entry.name.startsWith("_")
        );

      const cachedByPath = new Map(
        readLibraryCache().map(item => [item.path, item])
      );

      const refreshed = (await Promise.all(
        folders.map(folder => discoverBook(folder, cachedByPath, force))
      ))
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title));

      books = refreshed;
      writeLibraryCache(books);
      renderLibrary();
      hydrateCachedCovers();
    } catch (error) {
      if (!books.length) {
        e.grid.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
      }

      if (/connected/i.test(error.message)) {
        e.connect.hidden = false;
      }
    } finally {
      e.library?.classList?.remove("libraryRefreshing");
    }
  }
  function renderLibrary() {
    e.grid.innerHTML =
      books.length ? "" : "<p>No commentaries found.</p>";

    books.forEach(book => {
      const button = document.createElement("button");
      button.className = "book";
      button.type = "button";
      button.dataset.bookPath = book.path;

      button.innerHTML = book.cover
        ? `<img class="cover coverSlot" src="${book.cover}" alt="">`
        : `<div class="cover coverSlot">${escapeHtml(book.title)}</div>`;

      button.innerHTML += `
        <strong>${escapeHtml(book.title)}</strong>
        <span>${escapeHtml(book.author)}</span>
      `;

      button.addEventListener("click", () => openBook(book));
      e.grid.appendChild(button);
    });
  }
  async function openBook(book, target = null) {
    current = book;
    show(e.reader);

    if (!book.markdown) {
      e.bookHead.innerHTML = `
        <p class="kicker">MARGINALIA</p>
        <h1>${escapeHtml(book.title)}</h1>
        ${book.author ? `<p class="by">${escapeHtml(book.author)}</p>` : ""}
      `;
      e.body.innerHTML = "<p>Loading commentary…</p>";

      try {
        book.markdown = await text(book.path + "/companion.md");
      } catch (error) {
        e.body.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
        return;
      }
    }

    const {meta, body} = frontMatter(book.markdown);
    const footnotes = extractFootnotes(body);

    // Keep the cached library metadata current once the book has actually
    // been opened.
    book.title = meta.title || book.title;
    book.author = meta.author || book.author;
    book.coverPath =
      book.path + "/" + (meta.cover || "cover.jpg");
    writeLibraryCache(books);

    e.bookHead.innerHTML = `
      <p class="kicker">MARGINALIA</p>
      <h1>${escapeHtml(meta.title || book.title)}</h1>
      ${meta.subtitle ? `<p class="sub">${escapeHtml(meta.subtitle)}</p>` : ""}
      ${meta.author ? `<p class="by">${escapeHtml(meta.author)}${meta.year ? " · " + escapeHtml(meta.year) : ""}</p>` : ""}
    `;

    e.body.innerHTML =
      marked.parse(footnotes.markdown) +
      footnotesHtml(footnotes);

    enhanceCallouts();
    buildContents();
    applyHighlightsForCurrentBook();
    renderBookAnnotations();
    renderPageBookmarks();

    requestAnimationFrame(() => {
      if (target?.highlightId) {
        const highlight =
          e.body.querySelector(
            `mark.user-highlight[data-highlight-id="${CSS.escape(target.highlightId)}"]`
          );

        if (highlight) {
          highlight.scrollIntoView({block: "center", behavior: "auto"});
          return;
        }
      }

      if (target?.anchor && target.anchor !== "__top") {
        const heading = document.getElementById(target.anchor);

        if (heading) {
          heading.scrollIntoView({block: "start", behavior: "auto"});
          return;
        }

        if (target.heading) {
          const fallback = [...e.body.querySelectorAll("h1,h2,h3")]
            .find(h => h.textContent.trim() === target.heading);

          if (fallback) {
            fallback.scrollIntoView({block: "start", behavior: "auto"});
            return;
          }
        }
      }

      if (target?.anchor === "__top") {
        scrollTo(0, 0);
        return;
      }

      scrollTo(
        0,
        Number(localStorage.getItem(KEYS.position + book.path) || 0)
      );
    });
  }
  function buildContents() {
    const seen = {};

    const headings = [...e.body.querySelectorAll("h1, h2, h3")]
      .filter(heading => !heading.closest(".footnotes"));

    headings.forEach(heading => {
      let id = heading.textContent
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "section";

      seen[id] = (seen[id] || 0) + 1;
      if (seen[id] > 1) id += "-" + seen[id];

      heading.id = id;
    });

    e.tocLinks.innerHTML = "";

    headings.forEach(heading => {
      const link = document.createElement("a");
      link.href = "#" + heading.id;
      link.textContent = heading.textContent;
      link.className = heading.tagName.toLowerCase();

      link.addEventListener("click", closeContents);
      e.tocLinks.appendChild(link);
    });
  }

  function openContents() {
    selectDrawerTab("contents");
    e.toc.classList.add("open");
    e.toc.setAttribute("aria-hidden", "false");
    e.tocBackdrop.hidden = false;
  }

  function closeContents() {
    e.toc.classList.remove("open");
    e.toc.setAttribute("aria-hidden", "true");
    e.tocBackdrop.hidden = true;
  }

  function selectDrawerTab(name) {
    const mapping = {
      contents: {
        tab: e.contentsTab,
        pane: e.contentsPane
      },
      bookmarks: {
        tab: e.bookmarksTab,
        pane: e.bookmarksPane
      },
      highlights: {
        tab: e.highlightsTab,
        pane: e.highlightsPane
      }
    };

    Object.entries(mapping).forEach(([key, item]) => {
      const active = key === name;
      item.tab.classList.toggle("active", active);
      item.tab.setAttribute("aria-selected", String(active));
      item.pane.hidden = !active;
    });

    if (name !== "contents") {
      renderBookAnnotations();
    }
  }

  function renderBookAnnotations() {
    if (!current) return;

    const bookBookmarks = annotations.bookmarks
      .filter(item => item.bookPath === current.path)
      .sort((a, b) => String(a.created || "").localeCompare(String(b.created || "")));

    const bookHighlights = annotations.highlights
      .filter(item => item.bookPath === current.path)
      .sort((a, b) => String(a.created || "").localeCompare(String(b.created || "")));

    renderDrawerSaved(
      e.bookmarksPane,
      bookBookmarks,
      "bookmarks"
    );

    renderDrawerSaved(
      e.highlightsPane,
      bookHighlights,
      "highlights"
    );
  }

  function renderDrawerSaved(container, items, kind) {
    container.innerHTML = "";

    if (!items.length) {
      container.innerHTML = `<div class="drawerEmpty">No ${kind} in this book yet.</div>`;
      return;
    }

    items.forEach(item => {
      const wrapper = document.createElement("div");
      wrapper.className = "drawerSavedItem";
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "button");

      const title =
        kind === "bookmarks"
          ? escapeHtml(item.heading || "Start")
          : escapeHtml(item.sectionHeading || "Highlight");

      const quote =
        kind === "highlights"
          ? `<div class="drawerSavedItemQuote">“${escapeHtml(item.quote)}”</div>`
          : "";

      const icon = kind === "bookmarks" ? bookmarkIconInline() : "";

      wrapper.innerHTML = `
        <div class="drawerSavedItemTitle">${icon}${title}</div>
        ${quote}
        <button class="drawerSavedDelete" type="button" aria-label="Delete">×</button>
      `;

      const open = () => {
        closeContents();

        if (kind === "bookmarks") {
          openBook(current, {
            anchor: item.anchor,
            heading: item.heading
          });
        } else {
          openBook(current, {
            highlightId: item.id,
            anchor: item.sectionAnchor,
            heading: item.sectionHeading
          });
        }
      };

      wrapper.addEventListener("click", event => {
        if (event.target.closest(".drawerSavedDelete")) return;
        open();
      });

      wrapper.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });

      wrapper.querySelector(".drawerSavedDelete")
        .addEventListener("click", async event => {
          event.stopPropagation();

          if (kind === "bookmarks") {
            annotations.bookmarks =
              annotations.bookmarks.filter(x => x.id !== item.id);
          } else {
            annotations.highlights =
              annotations.highlights.filter(x => x.id !== item.id);
          }

          renderBookAnnotations();
          updateBookmarkButton();
          renderPageBookmarks();

          try {
            await persistAnnotations();
            showToast(
              kind === "bookmarks"
                ? "Bookmark removed."
                : "Highlight removed."
            );
          } catch {}
        });

      container.appendChild(wrapper);
    });
  }

  function currentSection() {
    if (!current || e.reader.hidden) {
      return {anchor: "__top", heading: "Start"};
    }

    const headings = [...e.body.querySelectorAll("h1,h2,h3")]
      .filter(heading => !heading.closest(".footnotes"));

    let selected = null;

    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 110) {
        selected = heading;
      } else {
        break;
      }
    }

    if (!selected) {
      return {anchor: "__top", heading: "Start"};
    }

    return {
      anchor: selected.id,
      heading: selected.textContent.trim()
    };
  }

  function bookmarkForCurrentSection() {
    if (!current) return null;

    const section = currentSection();

    return annotations.bookmarks.find(bookmark =>
      bookmark.bookPath === current.path &&
      bookmark.anchor === section.anchor
    ) || null;
  }

  function updateBookmarkButton() {
    if (!e.bookmarkButton || e.bookmarkButton.hidden || !current) return;

    const existing = bookmarkForCurrentSection();
    e.bookmarkButton.classList.toggle("active", !!existing);
    e.bookmarkButton.setAttribute(
      "aria-label",
      existing ? "Remove bookmark" : "Bookmark this section"
    );
    e.bookmarkButton.title =
      existing ? "Remove bookmark" : "Bookmark this section";
  }

  async function toggleBookmark() {
    if (!current) return;

    const section = currentSection();
    const existingIndex = annotations.bookmarks.findIndex(bookmark =>
      bookmark.bookPath === current.path &&
      bookmark.anchor === section.anchor
    );

    if (existingIndex >= 0) {
      annotations.bookmarks.splice(existingIndex, 1);
      updateBookmarkButton();
      renderBookAnnotations();
      renderPageBookmarks();
      showToast("Bookmark removed.");
    } else {
      annotations.bookmarks.push({
        id: crypto.randomUUID?.() || `bookmark-${Date.now()}`,
        type: "bookmark",
        bookPath: current.path,
        bookTitle: current.title,
        anchor: section.anchor,
        heading: section.heading,
        created: new Date().toISOString()
      });

      updateBookmarkButton();
      renderBookAnnotations();
      renderPageBookmarks();
      showToast("Bookmarked.");
    }

    try {
      await persistAnnotations();
    } catch {}
  }

  function renderSaved(kind) {
    const source =
      kind === "bookmarks"
        ? [...annotations.bookmarks]
        : [...annotations.highlights];

    e.savedTitle.textContent =
      kind === "bookmarks" ? "Bookmarks" : "Highlights";

    source.sort((a, b) =>
      String(b.created || "").localeCompare(String(a.created || ""))
    );

    e.savedList.innerHTML = "";

    if (!source.length) {
      e.savedList.innerHTML =
        `<div class="savedEmpty">No ${kind} yet.</div>`;
      return;
    }

    source.forEach(item => {
      const wrapper = document.createElement("div");
      wrapper.className = "savedItem";
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "button");

      const title =
        kind === "bookmarks"
          ? escapeHtml(item.heading || "Start")
          : escapeHtml(item.sectionHeading || "Highlight");

      const quote =
        kind === "highlights"
          ? `<div class="savedItemQuote">“${escapeHtml(item.quote)}”</div>`
          : "";

      const icon = kind === "bookmarks" ? bookmarkIconInline() : "";

      wrapper.innerHTML = `
        <div class="savedItemBook">${escapeHtml(item.bookTitle || "Book")}</div>
        <div class="savedItemTitle">${icon}${title}</div>
        ${quote}
        <button class="savedItemDelete" type="button" aria-label="Delete">×</button>
      `;

      const open = () => openSavedItem(kind, item);

      wrapper.addEventListener("click", event => {
        if (event.target.closest(".savedItemDelete")) return;
        open();
      });

      wrapper.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });

      wrapper.querySelector(".savedItemDelete")
        .addEventListener("click", async event => {
          event.stopPropagation();

          if (kind === "bookmarks") {
            annotations.bookmarks =
              annotations.bookmarks.filter(x => x.id !== item.id);
          } else {
            annotations.highlights =
              annotations.highlights.filter(x => x.id !== item.id);
          }

          renderSaved(kind);

          try {
            await persistAnnotations();
            showToast(kind === "bookmarks"
              ? "Bookmark removed."
              : "Highlight removed.");
          } catch {}
        });

      e.savedList.appendChild(wrapper);
    });
  }

  function openSaved(kind) {
    renderSaved(kind);
    e.savedDialog.showModal();
  }

  function openSavedItem(kind, item) {
    const book = books.find(candidate => candidate.path === item.bookPath);

    if (!book) {
      showToast("That book is not currently in the library.");
      return;
    }

    e.savedDialog.close();

    if (kind === "bookmarks") {
      openBook(book, {
        anchor: item.anchor,
        heading: item.heading
      });
    } else {
      openBook(book, {
        highlightId: item.id,
        anchor: item.sectionAnchor,
        heading: item.sectionHeading
      });
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function textNodeAllowed(node) {
    const element = node.parentElement;
    if (!element) return false;

    if (
      element.closest(".footnotes") ||
      element.closest(".callout-label") ||
      element.closest("sup") ||
      element.closest("button") ||
      element.closest("script") ||
      element.closest("style")
    ) {
      return false;
    }

    return true;
  }

  function buildTextIndex() {
    const walker = document.createTreeWalker(
      e.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return textNodeAllowed(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let textValue = "";
    const positions = [];
    let node;

    while ((node = walker.nextNode())) {
      const value = node.nodeValue || "";

      for (let offset = 0; offset < value.length; offset++) {
        const char = value[offset];

        if (/\s/.test(char)) {
          if (textValue && !textValue.endsWith(" ")) {
            textValue += " ";
            positions.push({node, offset});
          }
        } else {
          textValue += char;
          positions.push({node, offset});
        }
      }
    }

    return {text: textValue, positions};
  }

  function indexForBoundary(index, node, offset, direction = "start") {
    if (!node) return -1;

    if (node.nodeType !== Node.TEXT_NODE) {
      const walker = document.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(candidate) {
            return textNodeAllowed(candidate)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        }
      );

      node = walker.nextNode();
      offset = direction === "start" ? 0 : (node?.nodeValue?.length || 0);
    }

    if (!node) return -1;

    if (direction === "start") {
      for (let i = 0; i < index.positions.length; i++) {
        const position = index.positions[i];

        if (position.node === node && position.offset >= offset) {
          return i;
        }
      }
    } else {
      for (let i = index.positions.length - 1; i >= 0; i--) {
        const position = index.positions[i];

        if (position.node === node && position.offset < offset) {
          return i + 1;
        }
      }
    }

    return -1;
  }

  function sectionForNode(node) {
    const headings = [...e.body.querySelectorAll("h1,h2,h3")]
      .filter(heading => !heading.closest(".footnotes"));

    let selected = null;

    for (const heading of headings) {
      const relation = heading.compareDocumentPosition(node);

      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        selected = heading;
      }
    }

    return selected
      ? {anchor: selected.id, heading: selected.textContent.trim()}
      : {anchor: "__top", heading: "Start"};
  }

  function captureSelection() {
    pendingHighlight = null;
    hideSelectionToolbar();

    if (!current || e.reader.hidden) return;

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (
      !e.body.contains(range.commonAncestorContainer) ||
      range.commonAncestorContainer.parentElement?.closest(".footnotes")
    ) {
      return;
    }

    const selectedMarks = [...e.body.querySelectorAll("mark.user-highlight")];

    if (
      selectedMarks.some(mark =>
        selection.containsNode(mark, true) ||
        mark.contains(range.startContainer) ||
        mark.contains(range.endContainer)
      )
    ) {
      return;
    }

    const quote = normalizeText(selection.toString());

    if (!quote || quote.length < 2) return;

    const index = buildTextIndex();
    let start = indexForBoundary(
      index,
      range.startContainer,
      range.startOffset,
      "start"
    );
    let end = indexForBoundary(
      index,
      range.endContainer,
      range.endOffset,
      "end"
    );

    if (start < 0 || end <= start) {
      const fallback = index.text.indexOf(quote);
      if (fallback < 0) return;

      start = fallback;
      end = fallback + quote.length;
    }

    const match = normalizeText(index.text.slice(start, end));
    if (!match) return;

    const section = sectionForNode(range.startContainer);

    pendingHighlight = {
      quote,
      match,
      prefix: normalizeText(index.text.slice(Math.max(0, start - 70), start)),
      suffix: normalizeText(index.text.slice(end, Math.min(index.text.length, end + 70))),
      sectionAnchor: section.anchor,
      sectionHeading: section.heading
    };

    positionSelectionToolbar(range);
  }

  function positionSelectionToolbar(range) {
    const rect = range?.getBoundingClientRect?.();

    e.selectionToolbar.classList.remove("fallbackBottom");
    e.selectionToolbar.style.left = "0px";
    e.selectionToolbar.style.top = "0px";
    e.selectionToolbar.style.bottom = "auto";
    e.selectionToolbar.hidden = false;

    if (
      !rect ||
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top) ||
      (rect.width === 0 && rect.height === 0)
    ) {
      e.selectionToolbar.classList.add("fallbackBottom");
      return;
    }

    requestAnimationFrame(() => {
      if (e.selectionToolbar.hidden) return;

      const toolbarWidth = e.selectionToolbar.offsetWidth;
      const toolbarHeight = e.selectionToolbar.offsetHeight;
      const margin = 8;
      const gap = 9;

      let left =
        rect.left + (rect.width / 2) - (toolbarWidth / 2);

      left = Math.max(
        margin,
        Math.min(left, window.innerWidth - toolbarWidth - margin)
      );

      let top = rect.top - toolbarHeight - gap;

      if (top < margin) {
        top = rect.bottom + gap;
      }

      if (top + toolbarHeight > window.innerHeight - margin) {
        e.selectionToolbar.classList.add("fallbackBottom");
        e.selectionToolbar.style.left = "";
        e.selectionToolbar.style.top = "";
        return;
      }

      e.selectionToolbar.style.left = `${Math.round(left)}px`;
      e.selectionToolbar.style.top = `${Math.round(top)}px`;
    });
  }

  function hideSelectionToolbar() {
    e.selectionToolbar.hidden = true;
    e.selectionToolbar.classList.remove("fallbackBottom");
    e.selectionToolbar.style.left = "";
    e.selectionToolbar.style.top = "";
    e.selectionToolbar.style.bottom = "";
  }

  function candidateMatch(record, index) {
    const needle = record.match || normalizeText(record.quote);
    if (!needle) return null;

    const starts = [];
    let from = 0;

    while (true) {
      const found = index.text.indexOf(needle, from);
      if (found < 0) break;

      starts.push(found);
      from = found + Math.max(1, needle.length);
    }

    if (!starts.length) return null;
    if (starts.length === 1) {
      return {start: starts[0], end: starts[0] + needle.length};
    }

    let best = null;

    for (const start of starts) {
      const end = start + needle.length;
      const before = normalizeText(
        index.text.slice(Math.max(0, start - 70), start)
      );
      const after = normalizeText(
        index.text.slice(end, Math.min(index.text.length, end + 70))
      );

      let score = 0;

      if (record.prefix && before.endsWith(record.prefix.slice(-50))) {
        score += 2;
      }

      if (record.suffix && after.startsWith(record.suffix.slice(0, 50))) {
        score += 2;
      }

      if (!best || score > best.score) {
        best = {start, end, score};
      }
    }

    return best;
  }

  function wrapIndexedRange(index, start, end, highlightId) {
    const groups = new Map();

    for (let i = start; i < end && i < index.positions.length; i++) {
      const position = index.positions[i];
      const currentGroup = groups.get(position.node) || {
        node: position.node,
        start: position.offset,
        end: position.offset + 1
      };

      currentGroup.start = Math.min(currentGroup.start, position.offset);
      currentGroup.end = Math.max(currentGroup.end, position.offset + 1);

      groups.set(position.node, currentGroup);
    }

    const ordered = [...groups.values()];

    for (let i = ordered.length - 1; i >= 0; i--) {
      const group = ordered[i];

      if (
        !group.node.isConnected ||
        group.node.parentElement?.closest("mark.user-highlight")
      ) {
        continue;
      }

      const range = document.createRange();
      range.setStart(group.node, group.start);
      range.setEnd(group.node, group.end);

      const mark = document.createElement("mark");
      mark.className = "user-highlight";
      mark.dataset.highlightId = highlightId;

      try {
        range.surroundContents(mark);
      } catch {}
    }
  }

  function applyHighlight(record) {
    if (record.bookPath !== current?.path) return false;

    const index = buildTextIndex();
    const match = candidateMatch(record, index);

    if (!match) return false;

    wrapIndexedRange(index, match.start, match.end, record.id);
    return true;
  }

  function applyHighlightsForCurrentBook() {
    if (!current) return;

    annotations.highlights
      .filter(highlight => highlight.bookPath === current.path)
      .forEach(highlight => applyHighlight(highlight));
  }

  async function savePendingHighlight() {
    if (!pendingHighlight || !current) return;

    const record = {
      id: crypto.randomUUID?.() || `highlight-${Date.now()}`,
      type: "highlight",
      bookPath: current.path,
      bookTitle: current.title,
      ...pendingHighlight,
      created: new Date().toISOString()
    };

    annotations.highlights.push(record);
    hideSelectionToolbar();

    const selection = window.getSelection();
    selection?.removeAllRanges();

    applyHighlight(record);
    pendingHighlight = null;
    renderBookAnnotations();

    showToast("Highlighted.");

    try {
      await persistAnnotations();
    } catch {}
  }

  function openHighlight(highlightId) {
    const record = annotations.highlights.find(
      highlight => highlight.id === highlightId
    );

    if (!record) return;

    currentHighlightId = highlightId;
    e.highlightQuote.textContent = `“${record.quote}”`;
    e.highlightDialog.showModal();
  }

  async function removeCurrentHighlight() {
    if (!currentHighlightId) return;

    annotations.highlights =
      annotations.highlights.filter(
        highlight => highlight.id !== currentHighlightId
      );

    const marks = [
      ...e.body.querySelectorAll(
        `mark.user-highlight[data-highlight-id="${CSS.escape(currentHighlightId)}"]`
      )
    ];

    marks.forEach(mark => {
      const parent = mark.parentNode;

      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }

      mark.remove();
      parent.normalize();
    });

    currentHighlightId = null;
    e.highlightDialog.close();
    renderBookAnnotations();
    showToast("Highlight removed.");

    try {
      await persistAnnotations();
    } catch {}
  }

  function openFootnote(link) {
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#")) return;

    const note = document.getElementById(href.slice(1));
    if (!note) return;

    const clone = note.cloneNode(true);
    clone.querySelectorAll(".footnote-back").forEach(back => back.remove());

    currentFootnoteTarget = note.id;

    e.footnoteTitle.textContent =
      `Note ${link.dataset.footnoteNumber || ""}`.trim();

    e.footnoteBody.innerHTML = clone.innerHTML;
    e.footnoteDialog.showModal();
  }

  function goToFootnote() {
    if (!currentFootnoteTarget) return;

    const note = document.getElementById(currentFootnoteTarget);
    e.footnoteDialog.close();

    if (note) {
      note.scrollIntoView({block: "center", behavior: "auto"});
    }
  }

  const DEFAULT_SETTINGS = {
    font: "georgia",
    size: 19,
    theme: "light"
  };

  function getSettings() {
    try {
      return {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(localStorage.getItem(KEYS.settings) || "{}")
      };
    } catch {
      return {...DEFAULT_SETTINGS};
    }
  }

  function applySettings(settings = getSettings()) {
    const fontStacks = {
      georgia: 'Georgia, "Times New Roman", serif',
      literata: '"Literata", Georgia, "Times New Roman", serif',
      "eb-garamond": '"EB Garamond", Georgia, "Times New Roman", serif',
      merriweather: '"Merriweather", Georgia, "Times New Roman", serif',
      bookerly: '"Bookerly", "Literata", Georgia, "Times New Roman", serif'
    };

    document.documentElement.style.setProperty(
      "--reader-font",
      fontStacks[settings.font] || fontStacks.georgia
    );

    document.documentElement.style.setProperty(
      "--reader-size",
      `${Number(settings.size) || 19}px`
    );

    document.documentElement.dataset.theme =
      settings.theme === "dark" ? "dark" : "light";

    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        settings.theme === "dark" ? "#181817" : "#f3f0e9"
      );

    document.querySelectorAll("[data-font]").forEach(button => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.font === settings.font)
      );
    });

    document.querySelectorAll("[data-size]").forEach(button => {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.size) === Number(settings.size))
      );
    });

    document.querySelectorAll("[data-theme-choice]").forEach(button => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.themeChoice === settings.theme)
      );
    });
  }

  function saveSettings(patch) {
    const settings = {...getSettings(), ...patch};
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
    applySettings(settings);
  }

  function disconnectDropbox(returnHome = true) {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.refresh);
    localStorage.removeItem(KEYS.expires);

    annotationsLoaded = false;
    annotations = {version: 1, bookmarks: [], highlights: []};

    updateConnectionUI();

    if (returnHome) {
      e.settingsDialog.close();
      e.status.textContent = "";
      show(e.welcome);
    }
  }

  e.connect.addEventListener("click", connectDropbox);
  e.connectWelcome.addEventListener("click", connectDropbox);

  $("refresh").addEventListener("click", () => loadLibrary(true));

  $("home").addEventListener("click", () => {
    if (
      localStorage.getItem(KEYS.token) ||
      localStorage.getItem(KEYS.refresh)
    ) {
      show(e.library);
      renderLibrary();
      hydrateCachedCovers();
    } else {
      show(e.welcome);
    }
  });

  $("back").addEventListener("click", () => {
    show(e.library);
    renderLibrary();
    hydrateCachedCovers();
  });

  e.tocButton.addEventListener("click", openContents);
  e.closeToc.addEventListener("click", closeContents);
  e.tocBackdrop.addEventListener("click", closeContents);

  e.contentsTab.addEventListener("click", () => selectDrawerTab("contents"));
  e.bookmarksTab.addEventListener("click", () => selectDrawerTab("bookmarks"));
  e.highlightsTab.addEventListener("click", () => selectDrawerTab("highlights"));

  e.bookmarkButton.addEventListener("click", toggleBookmark);
  e.bookmarksView.addEventListener("click", () => openSaved("bookmarks"));
  e.highlightsView.addEventListener("click", () => openSaved("highlights"));

  e.settingsButton.addEventListener("click", () => {
    applySettings();
    e.settingsDialog.showModal();
  });

  e.fontChoices.addEventListener("click", event => {
    const button = event.target.closest("[data-font]");
    if (button) saveSettings({font: button.dataset.font});
  });

  e.sizeChoices.addEventListener("click", event => {
    const button = event.target.closest("[data-size]");
    if (button) saveSettings({size: Number(button.dataset.size)});
  });

  e.themeChoices.addEventListener("click", event => {
    const button = event.target.closest("[data-theme-choice]");
    if (button) saveSettings({theme: button.dataset.themeChoice});
  });

  e.disconnect.addEventListener(
    "click",
    () => disconnectDropbox(true)
  );

  e.goToFootnote.addEventListener("click", goToFootnote);
  e.selectionToolbar.addEventListener("pointerdown", event => {
    event.preventDefault();
  });

  e.highlightSelection.addEventListener("click", savePendingHighlight);
  e.removeHighlight.addEventListener("click", removeCurrentHighlight);

  e.body.addEventListener("click", event => {
    const footnote = event.target.closest(".footnote-ref a");

    if (footnote) {
      event.preventDefault();
      openFootnote(footnote);
      return;
    }

    const highlight = event.target.closest("mark.user-highlight");

    if (highlight) {
      openHighlight(highlight.dataset.highlightId);
    }
  });

  document.addEventListener("selectionchange", () => {
    clearTimeout(document._marginaliaSelectionTimer);

    document._marginaliaSelectionTimer =
      setTimeout(captureSelection, 120);
  });

  addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeContents();
      hideSelectionToolbar();
    }
  });

  addEventListener("scroll", () => {
    if (current && !e.reader.hidden) {
      localStorage.setItem(
        KEYS.position + current.path,
        String(scrollY)
      );

      updateBookmarkButton();
      hideSelectionToolbar();
    }
  }, {passive: true});

  (async () => {
    applySettings();

    try {
      await finishOAuth();
      updateConnectionUI();

      if (
        localStorage.getItem(KEYS.token) ||
        localStorage.getItem(KEYS.refresh)
      ) {
        const hadCache = loadCachedLibrary();

        if (hadCache) {
          show(e.library);

          // Load annotations quietly. The Library is already visible.
          loadAnnotations().catch(() => {});

          // A lightweight root-folder check discovers added/removed books.
          // Existing books are not re-downloaded merely to draw the Library.
          list(C.DROPBOX_FOLDER)
            .then(entries => {
              const remotePaths = entries
                .filter(entry =>
                  entry[".tag"] === "folder" &&
                  !entry.name.startsWith("_")
                )
                .map(entry => entry.path_lower)
                .sort();

              const cachedPaths = books
                .map(book => book.path)
                .sort();

              if (JSON.stringify(remotePaths) !== JSON.stringify(cachedPaths)) {
                loadLibrary(true);
              }
            })
            .catch(() => {});
        } else {
          await loadLibrary(true);
        }
      } else {
        show(e.welcome);
      }
    } catch (error) {
      show(e.welcome);
      e.status.textContent = error.message;
      updateConnectionUI();
    }
  })();
})();
