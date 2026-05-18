const TOKEN_KEY = "inmoradar_admin_token";

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  premium: {
    q: "",
    status: "all"
  },
  seo: {
    status: "all"
  }
};

const els = {
  login: document.querySelector("[data-admin-login]"),
  app: document.querySelector("[data-admin-app]"),
  tokenForm: document.querySelector("[data-admin-token-form]"),
  status: document.querySelector("[data-admin-status]"),
  liveStatus: document.querySelector("[data-admin-live-status]"),
  logout: document.querySelector("[data-admin-logout]"),
  refresh: document.querySelector("[data-admin-refresh]"),
  env: document.querySelector("[data-admin-env]"),
  stats: document.querySelector("[data-admin-stats]"),
  premiumRows: document.querySelector("[data-premium-rows]"),
  seoRows: document.querySelector("[data-seo-rows]"),
  premiumFilter: document.querySelector("[data-premium-filter]"),
  seoFilter: document.querySelector("[data-seo-filter]"),
  seoGenerate: document.querySelector("[data-seo-generate]"),
  seoPublish: document.querySelector("[data-seo-publish]")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function showStatus(message, tone = "neutral") {
  const target = els.app.hidden ? els.status : els.liveStatus;
  target.textContent = message || "";
  target.dataset.tone = tone;
}

function authHeaders() {
  return {
    authorization: `Bearer ${state.token}`,
    "content-type": "application/json"
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.error || "admin_request_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function requireLogin() {
  els.login.hidden = Boolean(state.token);
  els.app.hidden = !state.token;
  els.logout.hidden = !state.token;
}

function chip(value, variant = "") {
  const label = escapeHtml(value || "-");
  const className = variant ? `admin-chip ${variant}` : "admin-chip";
  return `<span class="${className}">${label}</span>`;
}

function statusTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "on_trial", "published", "index", "ready_to_publish"].includes(normalized)) return "good";
  if (["cancelled", "expired", "noindex", "archived"].includes(normalized)) return "bad";
  return "";
}

function stat(label, value) {
  return `
    <div class="admin-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderStats(summary) {
  const premium = summary.premium || {};
  const seo = summary.seo || {};
  els.env.textContent = summary.env?.lemonsqueezy_test_mode ? "Test mode" : "Live mode";
  els.stats.innerHTML = [
    stat("Premium total", premium.total || 0),
    stat("Premium active", (premium.by_status?.active || 0) + (premium.by_status?.on_trial || 0)),
    stat("SEO publicadas", seo.published || 0),
    stat("SEO ready", seo.ready_to_publish || 0)
  ].join("");
}

function renderPremium(rows) {
  if (!rows.length) {
    els.premiumRows.innerHTML = `<tr><td colspan="5">No hay suscripciones con este filtro.</td></tr>`;
    return;
  }

  els.premiumRows.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.email)}</strong>
          <div class="admin-subtle">${escapeHtml(row.provider_subscription_id || row.provider_order_id || "-")}</div>
        </td>
        <td>${chip(row.status, statusTone(row.status))}</td>
        <td>
          ${escapeHtml(formatDate(row.renews_at || row.trial_ends_at || row.ends_at))}
          <div class="admin-subtle">${row.trial_ends_at ? "trial" : ""}</div>
        </td>
        <td>${escapeHtml(row.event_name || "-")}</td>
        <td>${escapeHtml(formatDate(row.updated_at))}</td>
      </tr>
    `
    )
    .join("");
}

function renderSeo(rows) {
  if (!rows.length) {
    els.seoRows.innerHTML = `<tr><td colspan="5">No hay landings con este filtro.</td></tr>`;
    return;
  }

  els.seoRows.innerHTML = rows
    .map((row) => {
      const href = `/${String(row.slug || "").replace(/^\/+|\/+$/g, "")}/`;
      return `
        <tr>
          <td>
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(row.title || row.slug)}</a>
            <div class="admin-subtle">${escapeHtml(row.slug)} · ${escapeHtml(row.word_count || 0)} palabras</div>
          </td>
          <td>${escapeHtml(row.city || "-")}</td>
          <td>${chip(Number(row.quality_score || 0).toFixed(0), Number(row.quality_score || 0) >= 75 ? "good" : "bad")}</td>
          <td>
            ${chip(row.status, statusTone(row.status))}
            ${chip(row.index_status, statusTone(row.index_status))}
          </td>
          <td>
            <div class="admin-row-actions">
              <button class="admin-button tiny ghost" type="button" data-seo-action="regenerate" data-slug="${escapeHtml(row.slug)}">Regenerar</button>
              <button class="admin-button tiny ghost" type="button" data-seo-action="publish" data-slug="${escapeHtml(row.slug)}">Publish</button>
              <button class="admin-button tiny ghost" type="button" data-seo-action="noindex" data-slug="${escapeHtml(row.slug)}">Noindex</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadSummary() {
  const summary = await api("/api/admin?resource=summary");
  renderStats(summary);
}

async function loadPremium() {
  const params = new URLSearchParams({
    limit: "50",
    status: state.premium.status || "all"
  });
  if (state.premium.q) params.set("q", state.premium.q);
  const payload = await api(`/api/admin?resource=premium/subscriptions&${params.toString()}`);
  renderPremium(payload.subscriptions || []);
}

async function loadSeo() {
  const params = new URLSearchParams({
    limit: "50",
    status: state.seo.status || "all"
  });
  const payload = await api(`/api/admin?resource=seo/landings&${params.toString()}`);
  renderSeo(payload.landings || []);
}

async function loadAll() {
  if (!state.token) return;
  showStatus("Cargando backoffice...");
  try {
    await Promise.all([loadSummary(), loadPremium(), loadSeo()]);
    showStatus(`Actualizado ${formatDate(new Date().toISOString())}`, "good");
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      state.token = "";
      requireLogin();
      showStatus("Token incorrecto o caducado.", "bad");
      return;
    }
    showStatus(`Error: ${error.message}`, "bad");
  }
}

async function runSeoGeneration(mode) {
  const payload =
    mode === "publish"
      ? {
          mode: "publish",
          limit: 1,
          candidateLimit: 10,
          template_type: "price_city",
          autoPublish: true,
          includeExistingDrafts: true,
          publishFirstEligible: true
        }
      : {
          mode: "generate",
          limit: 1,
          template_type: "price_city",
          autoPublish: false
        };

  showStatus(mode === "publish" ? "Buscando SEO elegible para publicar..." : "Generando draft SEO...");
  await api("/api/admin?resource=seo/generate-landings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadAll();
}

async function runSeoRowAction(action, slug) {
  showStatus(`${action} · ${slug}`);
  await api("/api/admin?resource=seo/landings", {
    method: "POST",
    body: JSON.stringify({ action, slug })
  });
  await loadAll();
}

els.tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.tokenForm);
  state.token = String(form.get("token") || "").trim();
  if (!state.token) {
    showStatus("Pega el token admin.", "bad");
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, state.token);
  requireLogin();
  await loadAll();
});

els.logout.addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  state.token = "";
  requireLogin();
  showStatus("");
});

els.refresh.addEventListener("click", loadAll);

els.premiumFilter.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.premiumFilter);
  state.premium.q = String(form.get("q") || "").trim();
  state.premium.status = String(form.get("status") || "all");
  await loadPremium();
});

els.seoFilter.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.seoFilter);
  state.seo.status = String(form.get("status") || "all");
  await loadSeo();
});

els.seoGenerate.addEventListener("click", () => runSeoGeneration("generate").catch((error) => showStatus(error.message, "bad")));
els.seoPublish.addEventListener("click", () => runSeoGeneration("publish").catch((error) => showStatus(error.message, "bad")));

els.seoRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-seo-action]");
  if (!button) return;
  const action = button.dataset.seoAction;
  const slug = button.dataset.slug;
  runSeoRowAction(action, slug).catch((error) => showStatus(error.message, "bad"));
});

requireLogin();
loadAll();
