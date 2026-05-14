const CHECKOUT_URL = "https://inmoradar.lemonsqueezy.com/buy/REEMPLAZAR";
const WAITLIST_EMAIL = "hola@inmoradar.app";

function showCheckoutStatus(message) {
  document.querySelectorAll("[data-checkout-status]").forEach((node) => {
    node.textContent = message;
  });
}

document.querySelectorAll("[data-checkout-button]").forEach((button) => {
  button.addEventListener("click", () => {
    if (CHECKOUT_URL.includes("REEMPLAZAR")) {
      showCheckoutStatus("Te abrimos el correo para apuntarte a Premium.");
      window.location.href = `mailto:${WAITLIST_EMAIL}?subject=Quiero%20InmoRadar%20Premium&body=Hola,%20quiero%20activar%20InmoRadar%20Premium.`;
      return;
    }

    window.location.href = CHECKOUT_URL;
  });
});

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
