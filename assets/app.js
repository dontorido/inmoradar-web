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

async function loadPublishedNews() {
  const list = document.querySelector("[data-news-list]");
  if (!list) return;

  try {
    const response = await fetch("/api/news", {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json();
    if (response.ok && payload.ok) renderNewsItems(payload.news);
  } catch {
    // Si falla la API, se mantiene el contenido editorial estático.
  }
}

loadPublishedNews();

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
