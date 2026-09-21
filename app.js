(() => {
  "use strict";

  const C = window.MARGINALIA_CONFIG || {};

  const KEYS = {
    token: "marginalia.token",
    refresh: "marginalia.refreshToken",
    expires: "marginalia.tokenExpires",
    pkce: "marginalia.pkce",
    settings: "marginalia.settings",
    position: "marginalia.pos."
  };

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
    settingsButton: $("settingsButton"),
    settingsDialog: $("settingsDialog"),
    bookHead: $("bookHead"),
    body: $("content"),
    disconnect: $("disconnect"),
    fontChoices: $("fontChoices"),
    sizeChoices: $("sizeChoices"),
    themeChoices: $("themeChoices")
  };

  let books = [];
  let current = null;

  function show(section) {
    [e.welcome, e.library, e.reader].forEach(el => {
      el.hidden = el !== section;
    });

    const reading = section === e.reader;
    e.tocButton.hidden = !reading;
    e.settingsButton.hidden = !reading;
    closeContents();
    updateConnectionUI();
  }

  function updateConnectionUI() {
    const connected = !!localStorage.getItem(KEYS.token) || !!localStorage.getItem(KEYS.refresh);
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
      redirect_uri: redirectUri()
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
      if (refreshed) return api(endpoint, arg, content, false);
    }

    if (!response.ok) {
      throw new Error("Dropbox request failed.");
    }

    return content ? response : response.json();
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

  async function imageUrl(path) {
    try {
      const blob = await (await api("files/download", {path}, true)).blob();
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
            const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
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

  function extractFootnotes(markdown) {
    const definitions = new Map();
    const numbers = new Map();
    const order = [];
    const referenceCounts = new Map();

    markdown = markdown.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, (_, id, value) => {
      definitions.set(id.trim(), value.trim());
      return "";
    });

    markdown = markdown.replace(/\[\^([^\]]+)\]/g, (whole, rawId) => {
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

      return `<sup class="footnote-ref" id="fnref-${safe}-${count}"><a href="#fn-${safe}" aria-label="Footnote ${number}">${number}</a></sup>`;
    });

    return {markdown, definitions, numbers, order};
  }

  function footnotesHtml(footnotes) {
    if (!footnotes.order.length) return "";

    const items = footnotes.order.map(id => {
      const safe = id.replace(/[^a-zA-Z0-9_-]/g, "-");
      const content = marked.parseInline(footnotes.definitions.get(id) || "");
      return `<li id="fn-${safe}">${content} <a class="footnote-back" href="#fnref-${safe}-1" aria-label="Back to text">↩</a></li>`;
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
      firstParagraph.innerHTML = firstParagraph.innerHTML.replace(match[0], "");

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

  async function loadLibrary() {
    show(e.library);
    e.grid.innerHTML = "<p>Loading library…</p>";

    try {
      const folders = (await list(C.DROPBOX_FOLDER))
        .filter(entry => entry[".tag"] === "folder");

      books = (await Promise.all(folders.map(async folder => {
        try {
          const markdown = await text(folder.path_lower + "/companion.md");
          const {meta} = frontMatter(markdown);
          const cover = await imageUrl(
            folder.path_lower + "/" + (meta.cover || "cover.jpg")
          );

          return {
            path: folder.path_lower,
            title: meta.title || folder.name,
            author: meta.author || "",
            markdown,
            cover
          };
        } catch {
          return null;
        }
      })))
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title));

      renderLibrary();
    } catch (error) {
      e.grid.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
      if (/connected/i.test(error.message)) {
        e.connect.hidden = false;
      }
    }
  }

  function renderLibrary() {
    e.grid.innerHTML = books.length ? "" : "<p>No commentaries found.</p>";

    books.forEach(book => {
      const button = document.createElement("button");
      button.className = "book";
      button.type = "button";

      button.innerHTML = book.cover
        ? `<img class="cover" src="${book.cover}" alt="">`
        : `<div class="cover">${escapeHtml(book.title)}</div>`;

      button.innerHTML += `
        <strong>${escapeHtml(book.title)}</strong>
        <span>${escapeHtml(book.author)}</span>
      `;

      button.addEventListener("click", () => openBook(book));
      e.grid.appendChild(button);
    });
  }

  function openBook(book) {
    current = book;

    const {meta, body} = frontMatter(book.markdown);
    const footnotes = extractFootnotes(body);

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

    show(e.reader);

    requestAnimationFrame(() => {
      scrollTo(0, Number(localStorage.getItem(KEYS.position + book.path) || 0));
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
    e.toc.classList.add("open");
    e.toc.setAttribute("aria-hidden", "false");
    e.tocBackdrop.hidden = false;
  }

  function closeContents() {
    e.toc.classList.remove("open");
    e.toc.setAttribute("aria-hidden", "true");
    e.tocBackdrop.hidden = true;
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
      ?.setAttribute("content", settings.theme === "dark" ? "#181817" : "#f3f0e9");

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

    updateConnectionUI();

    if (returnHome) {
      e.settingsDialog.close();
      e.status.textContent = "";
      show(e.welcome);
    }
  }

  e.connect.addEventListener("click", connectDropbox);
  e.connectWelcome.addEventListener("click", connectDropbox);

  $("refresh").addEventListener("click", loadLibrary);
  $("home").addEventListener("click", () => {
    if (localStorage.getItem(KEYS.token) || localStorage.getItem(KEYS.refresh)) {
      loadLibrary();
    } else {
      show(e.welcome);
    }
  });

  $("back").addEventListener("click", loadLibrary);

  e.tocButton.addEventListener("click", openContents);
  e.closeToc.addEventListener("click", closeContents);
  e.tocBackdrop.addEventListener("click", closeContents);

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

  e.disconnect.addEventListener("click", () => disconnectDropbox(true));

  addEventListener("keydown", event => {
    if (event.key === "Escape") closeContents();
  });

  addEventListener("scroll", () => {
    if (current && !e.reader.hidden) {
      localStorage.setItem(KEYS.position + current.path, String(scrollY));
    }
  }, {passive: true});

  (async () => {
    applySettings();

    try {
      await finishOAuth();
      updateConnectionUI();

      if (localStorage.getItem(KEYS.token) || localStorage.getItem(KEYS.refresh)) {
        await loadLibrary();
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
