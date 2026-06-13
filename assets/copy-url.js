(function exposeCopyUrl(root) {
  const INMORADAR_ORIGIN = "https://inmoradar.app";

  function normalizePublishedUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return { ok: false, value: "", reason: "missing_url" };

    let url;
    try {
      url = new URL(value);
    } catch {
      return { ok: false, value: "", reason: "invalid_url" };
    }

    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "inmoradar.app") {
      return { ok: false, value: "", reason: "external_url" };
    }

    url.hash = "";
    return { ok: true, value: url.toString(), reason: null };
  }

  function urlParam(search) {
    return new URLSearchParams(String(search || "").replace(/^\?/, "")).get("url") || "";
  }

  function selectElementText(element, doc) {
    if (!element || !doc?.createRange || !root.getSelection) return false;
    const range = doc.createRange();
    range.selectNodeContents(element);
    const selection = root.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  async function writeClipboard(text, clipboard) {
    const target = clipboard || (typeof navigator !== "undefined" ? navigator.clipboard : null);
    if (!target || typeof target.writeText !== "function") {
      throw new Error("clipboard_unavailable");
    }
    await target.writeText(text);
    return true;
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function initCopyUrlPage(doc) {
    const documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return null;

    const status = documentRef.querySelector("[data-copy-status]");
    const box = documentRef.querySelector("[data-copy-url-box]");
    const valueNode = documentRef.querySelector("[data-copy-url-value]");
    const link = documentRef.querySelector("[data-copy-url-link]");
    const button = documentRef.querySelector("[data-copy-url-button]");
    const fallback = documentRef.querySelector("[data-copy-url-fallback]");
    const invalid = documentRef.querySelector("[data-copy-url-invalid]");
    const normalized = normalizePublishedUrl(urlParam(root.location?.search || ""));

    if (!normalized.ok) {
      setText(status, "No podemos preparar esa URL.");
      setText(valueNode, "URL no valida o externa");
      box?.setAttribute("data-state", "invalid");
      link?.removeAttribute("href");
      if (link) link.hidden = true;
      if (button) button.disabled = true;
      if (invalid) invalid.hidden = false;
      return { ok: false, reason: normalized.reason };
    }

    setText(status, "Lista para copiar.");
    setText(valueNode, normalized.value);
    if (link) {
      link.href = normalized.value;
      link.hidden = false;
    }
    if (button) {
      button.disabled = false;
      button.addEventListener("click", async () => {
        try {
          await writeClipboard(normalized.value);
          setText(status, "URL copiada.");
          if (fallback) fallback.hidden = true;
        } catch {
          selectElementText(valueNode, documentRef);
          setText(status, "Selecciona la URL y copiala manualmente.");
          if (fallback) fallback.hidden = false;
        }
      });
    }
    return { ok: true, url: normalized.value };
  }

  const api = {
    INMORADAR_ORIGIN,
    initCopyUrlPage,
    normalizePublishedUrl,
    urlParam,
    writeClipboard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.InmoRadarCopyUrl = api;
    if (typeof document !== "undefined") {
      document.addEventListener("DOMContentLoaded", () => initCopyUrlPage(document));
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
