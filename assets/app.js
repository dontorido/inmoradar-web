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

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
