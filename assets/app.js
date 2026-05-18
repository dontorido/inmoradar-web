const WAITLIST_EMAIL = "hola@inmoradar.app";
const CHECKOUT_ENDPOINT = "/api/lemonsqueezy-checkout";

function showCheckoutStatus(message) {
  document.querySelectorAll("[data-checkout-status]").forEach((node) => {
    node.textContent = message;
  });
}

function setCheckoutButtonsLoading(isLoading) {
  document.querySelectorAll("[data-checkout-button]").forEach((button) => {
    button.disabled = isLoading;
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
  });
}

async function openCheckout(source) {
  showCheckoutStatus("Preparando checkout seguro de Lemon Squeezy...");
  setCheckoutButtonsLoading(true);

  try {
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ source })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.checkout_url) {
      if (payload.error === "lemonsqueezy_not_configured") {
        throw new Error("Falta configurar Lemon Squeezy en Vercel.");
      }
      throw new Error(payload.message || "No se ha podido crear el checkout.");
    }

    showCheckoutStatus(payload.test_mode ? "Abriendo checkout de prueba..." : "Abriendo checkout...");
    window.location.href = payload.checkout_url;
  } catch (error) {
    showCheckoutStatus(`${error.message} Escríbenos y lo activamos manualmente.`);
    window.location.href = `mailto:${WAITLIST_EMAIL}?subject=Quiero%20InmoRadar%20Premium&body=Hola,%20quiero%20activar%20InmoRadar%20Premium.`;
  } finally {
    setCheckoutButtonsLoading(false);
  }
}

document.querySelectorAll("[data-checkout-button]").forEach((button) => {
  button.addEventListener("click", () => {
    const source = button.dataset.checkoutSource || "premium_page";
    openCheckout(source);
  });
});

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderNewsItems(items) {
  const list = document.querySelector("[data-news-list]");
  if (!list || !Array.isArray(items) || !items.length) return;

  list.innerHTML = items
    .map(
      (item) => `
        <article class="news-item">
          <div>
            <span class="news-meta">${escapeHtml(item.meta || "Guía inmobiliaria")}</span>
            <h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h3>
          </div>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `
    )
    .join("");
}

function renderNewsItem(item, className) {
  return `
    <article class="${className}">
      <div>
        <span class="news-meta">${escapeHtml(item.meta || "Guía inmobiliaria")}</span>
        <h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h3>
      </div>
      <p>${escapeHtml(item.description)}</p>
    </article>
  `;
}

function archiveLoopItems(items) {
  const base = [];
  while (base.length < Math.max(items.length, 4)) {
    base.push(...items);
  }
  const visibleLoop = base.slice(0, Math.max(items.length, 4));
  return [...visibleLoop, ...visibleLoop];
}

function renderLatestAndArchiveNews(items) {
  const list = document.querySelector("[data-news-list]");
  const archive = document.querySelector("[data-news-archive]");
  const archiveTrack = document.querySelector("[data-news-track]");
  const archiveCount = document.querySelector("[data-news-archive-count]");
  if (!list || !Array.isArray(items) || !items.length) return;

  const latest = items.slice(0, 5);
  const older = items.slice(5);

  list.innerHTML = latest.map((item) => renderNewsItem(item, "news-item")).join("");

  if (!archive || !archiveTrack) return;
  if (!older.length) {
    archive.hidden = true;
    archiveTrack.innerHTML = "";
    return;
  }

  archive.hidden = false;
  if (archiveCount) {
    archiveCount.textContent = `${older.length} publicaciones anteriores`;
  }
  archiveTrack.innerHTML = archiveLoopItems(older)
    .map((item) => renderNewsItem(item, "news-archive-item"))
    .join("");
}

async function loadPublishedNews() {
  const list = document.querySelector("[data-news-list]");
  if (!list) return;

  try {
    const response = await fetch("/api/news", {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json();
    if (response.ok && payload.ok) renderLatestAndArchiveNews(payload.news);
  } catch {
    // Si falla la API, se mantiene el contenido editorial estático.
  }
}

loadPublishedNews();

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
