(() => {
  const CONSENT_KEY = "inmoradar_cookie_consent_v1";
  const GA_ID = "G-DN6123E9KV";
  const GTM_ID = "GTM-NWHKRNMD";

  function readConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Consent still applies for the current page, even if storage is blocked.
    }
  }

  function injectStyles() {
    if (document.getElementById("inmoradar-consent-style")) return;
    const style = document.createElement("style");
    style.id = "inmoradar-consent-style";
    style.textContent = `
      .consent-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:980px;margin:0 auto;padding:18px;border:1px solid rgba(10,20,15,.18);border-radius:18px;background:#fff;color:#0a140f;box-shadow:0 24px 80px rgba(10,20,15,.18);font-family:Inter,Arial,sans-serif}
      .consent-banner strong{display:block;margin:0 0 6px;font-size:15px}
      .consent-banner p{margin:0;color:#4b5563;font-size:13px;line-height:1.45}
      .consent-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .consent-button{border:1px solid #0a140f;border-radius:999px;padding:10px 14px;background:#0a140f;color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
      .consent-button.secondary{background:#fff;color:#0a140f}
      .consent-details{display:none;margin-top:14px;padding:12px;border-radius:12px;background:#f5f5f2;color:#374151;font-size:13px;line-height:1.45}
      .consent-banner.is-configuring .consent-details{display:block}
      .consent-preferences-button{margin-top:12px}
      @media (max-width:640px){.consent-banner{left:10px;right:10px;bottom:10px}.consent-button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  function loadAnalytics() {
    if (window.__inmoradarAnalyticsLoaded) return;
    window.__inmoradarAnalyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { anonymize_ip: true });
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);

    window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    loadScript(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`);
  }

  function closeBanner() {
    document.querySelector("[data-consent-banner]")?.remove();
  }

  function acceptAnalytics() {
    saveConsent("accepted");
    closeBanner();
    loadAnalytics();
  }

  function rejectAnalytics() {
    saveConsent("rejected");
    closeBanner();
  }

  function renderBanner(force = false) {
    if (!force && readConsent()) return;
    injectStyles();
    closeBanner();
    const banner = document.createElement("section");
    banner.className = "consent-banner";
    banner.dataset.consentBanner = "true";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Preferencias de privacidad");
    banner.innerHTML = `
      <strong>Privacidad y analitica</strong>
      <p>Usamos cookies tecnicas necesarias y, solo si aceptas, Google Analytics/Tag Manager para medir visitas y mejorar la web. Puedes aceptar, rechazar o configurar.</p>
      <div class="consent-details">
        <p><strong>Analitica opcional</strong> Nos ayuda a entender paginas visitadas, eventos agregados y rendimiento. No vendemos datos ni usamos esta informacion para publicidad personalizada.</p>
      </div>
      <div class="consent-actions">
        <button class="consent-button" type="button" data-consent-accept>Aceptar</button>
        <button class="consent-button secondary" type="button" data-consent-reject>Rechazar</button>
        <button class="consent-button secondary" type="button" data-consent-config>Configurar</button>
      </div>
    `;
    document.body.appendChild(banner);
  }

  function init() {
    injectStyles();
    if (readConsent() === "accepted") loadAnalytics();
    else if (!readConsent()) renderBanner();

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-consent-accept],[data-consent-reject],[data-consent-config],[data-cookie-preferences]");
      if (!target) return;
      if (target.matches("[data-consent-accept]")) acceptAnalytics();
      if (target.matches("[data-consent-reject]")) rejectAnalytics();
      if (target.matches("[data-consent-config]")) {
        target.closest("[data-consent-banner]")?.classList.toggle("is-configuring");
      }
      if (target.matches("[data-cookie-preferences]")) renderBanner(true);
    });
  }

  window.InmoRadarConsent = {
    accept: acceptAnalytics,
    reject: rejectAnalytics,
    open: () => renderBanner(true),
    status: readConsent
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
