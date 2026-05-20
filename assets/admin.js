const TOKEN_KEY = "inmoradar_admin_token";
const VIDEO_PROJECT_KEY = "inmoradar_social_video_project";
const RELEASE_TARGETS = ["web", "extension", "backoffice"];
const MAX_RELEASE_FILE_BYTES = 3 * 1024 * 1024;

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  activeSection: "ventas",
  marketingSubsection: "",
  operacionesSubsection: "",
  premium: {
    q: "",
    status: "all",
    provider: "",
    eventName: ""
  },
  seo: {
    status: "all",
    page: 1,
    pageSize: 10,
    hasNextPage: false,
    hasPreviousPage: false
  },
  parking: {
    lastProbe: null
  },
  releases: {
    web: [],
    extension: [],
    backoffice: []
  },
  kpis: {
    schema: [],
    settings: {},
    defaults: {}
  },
  video: {
    lastProject: null,
    selectedSceneIndex: 0,
    busy: false,
    backgroundClipUrl: "",
    backgroundClipName: "",
    backgroundClipType: "",
    runwayEstimate: null,
    runwayJob: null,
    runwayConfig: null
  }
};

const els = {
  login: document.querySelector("[data-admin-login]"),
  app: document.querySelector("[data-admin-app]"),
  tokenForm: document.querySelector("[data-admin-token-form]"),
  status: document.querySelector("[data-admin-status]"),
  liveStatus: document.querySelector("[data-admin-live-status]"),
  logout: document.querySelector("[data-admin-logout]"),
  sectionButtons: document.querySelectorAll("[data-admin-section-button]"),
  views: document.querySelectorAll("[data-admin-view]"),
  subsectionButtons: document.querySelectorAll("[data-admin-subsection-button]"),
  subsectionPanels: document.querySelectorAll("[data-admin-subsection-panel]"),
  subsectionEmptyStates: document.querySelectorAll("[data-admin-subsection-empty]"),
  refresh: document.querySelector("[data-admin-refresh]"),
  env: document.querySelector("[data-admin-env]"),
  stats: document.querySelector("[data-admin-stats]"),
  revenueSummary: document.querySelector("[data-revenue-summary]"),
  revenueChart: document.querySelector("[data-revenue-chart]"),
  extensionStats: document.querySelector("[data-extension-stats]"),
  extensionBreakdown: document.querySelector("[data-extension-breakdown]"),
  premiumRows: document.querySelector("[data-premium-rows]"),
  seoSummary: document.querySelector("[data-seo-summary]"),
  seoRows: document.querySelector("[data-seo-rows]"),
  seoPagination: document.querySelector("[data-seo-pagination]"),
  premiumFilter: document.querySelector("[data-premium-filter]"),
  seoFilter: document.querySelector("[data-seo-filter]"),
  seoGenerate: document.querySelector("[data-seo-generate]"),
  seoPublish: document.querySelector("[data-seo-publish]"),
  kpiForm: document.querySelector("[data-kpi-form]"),
  kpiReset: document.querySelector("[data-kpi-reset]"),
  parkingStats: document.querySelector("[data-parking-stats]"),
  parkingRows: document.querySelector("[data-parking-rows]"),
  parkingRefresh: document.querySelector("[data-parking-refresh]"),
  parkingProbeForm: document.querySelector("[data-parking-probe-form]"),
  parkingResult: document.querySelector("[data-parking-result]"),
  releaseForms: document.querySelectorAll("[data-release-form]"),
  releaseRows: document.querySelectorAll("[data-release-rows]"),
  releaseConnectors: document.querySelectorAll("[data-release-connectors]"),
  releaseRefreshButtons: document.querySelectorAll("[data-release-refresh]"),
  videoForm: document.querySelector("[data-video-form]"),
  videoPreview: document.querySelector("[data-video-preview]"),
  videoPreviewTopic: document.querySelector("[data-video-preview-topic]"),
  videoPreviewHeadline: document.querySelector("[data-video-preview-headline]"),
  videoPreviewBody: document.querySelector("[data-video-preview-body]"),
  videoPreviewTitle: document.querySelector("[data-video-preview-title]"),
  videoPreviewMeta: document.querySelector("[data-video-preview-meta]"),
  videoPreviewClip: document.querySelector("[data-video-preview-clip]"),
  videoStoryboard: document.querySelector("[data-video-storyboard]"),
  videoCopyPrompt: document.querySelector("[data-video-copy-prompt]"),
  videoDownloadAiPack: document.querySelector("[data-video-download-ai-pack]"),
  videoDownloadJson: document.querySelector("[data-video-download-json]"),
  videoDownloadHtml: document.querySelector("[data-video-download-html]"),
  videoExport: document.querySelector("[data-video-export]"),
  videoBusy: document.querySelector("[data-video-busy]"),
  videoBusyMessage: document.querySelector("[data-video-busy-message]"),
  videoRunwayPanel: document.querySelector("[data-video-runway-panel]"),
  videoRunwayModel: document.querySelector("[data-video-runway-model]"),
  videoRunwayDuration: document.querySelector("[data-video-runway-duration]"),
  videoRunwayConfirm: document.querySelector("[data-video-runway-confirm]"),
  videoRunwayStatus: document.querySelector("[data-video-runway-status]"),
  videoRunwayEstimate: document.querySelector("[data-video-runway-estimate]"),
  videoRunwayRender: document.querySelector("[data-video-runway-render]"),
  videoRunwayPoll: document.querySelector("[data-video-runway-poll]"),
  videoRunwayImport: document.querySelector("[data-video-runway-import]")
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

function subsectionStateKey(group) {
  return group === "operaciones" ? "operacionesSubsection" : "marketingSubsection";
}

function subsectionGroupFromPanel(panelName) {
  return String(panelName || "").startsWith("operaciones-") ? "operaciones" : "marketing";
}

function syncSubsectionPanels() {
  els.subsectionButtons.forEach((button) => {
    const group = button.dataset.adminSubsectionGroup || "marketing";
    const key = subsectionStateKey(group);
    const active = state.activeSection === group && state[key] === button.dataset.adminSubsectionButton;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  els.subsectionPanels.forEach((panel) => {
    const panelName = panel.dataset.adminSubsectionPanel || "";
    const group = subsectionGroupFromPanel(panelName);
    const key = subsectionStateKey(group);
    panel.hidden = !(state.activeSection === group && state[key] === panelName);
  });

  els.subsectionEmptyStates.forEach((emptyState) => {
    const group = emptyState.dataset.adminSubsectionEmpty || "marketing";
    const key = subsectionStateKey(group);
    emptyState.hidden = !(state.activeSection === group && !state[key]);
  });
}

function setAdminSubsection(group, subsection) {
  const normalizedGroup = ["marketing", "operaciones"].includes(group) ? group : "marketing";
  state[subsectionStateKey(normalizedGroup)] = subsection || "";
  setAdminSection(normalizedGroup);
}

function setAdminSection(section, options = {}) {
  const nextSection = ["ventas", "marketing", "kpis", "operaciones"].includes(section) ? section : "ventas";
  if (options.resetSubsection && nextSection === "marketing") state.marketingSubsection = "";
  if (options.resetSubsection && nextSection === "operaciones") state.operacionesSubsection = "";
  state.activeSection = nextSection;
  els.views.forEach((view) => {
    view.hidden = view.dataset.adminView !== state.activeSection;
  });
  els.sectionButtons.forEach((button) => {
    const active = button.dataset.adminSectionButton === state.activeSection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  syncSubsectionPanels();
}

function slugId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function chip(value, variant = "", kind = "status") {
  const label = escapeHtml(value || "-");
  const className = ["admin-chip", kind, variant].filter(Boolean).join(" ");
  const testId = kind === "score" ? `score-pill-${slugId(value)}` : `status-pill-${slugId(value)}`;
  return `<span class="${className}" data-testid="${escapeHtml(testId)}">${label}</span>`;
}

function statusTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (["published", "active", "on_trial"].includes(normalized)) return "published";
  if (["ready_to_publish", "index", "paid"].includes(normalized)) return "ready";
  if (["cancelled", "expired", "noindex", "unpaid", "payment_failed"].includes(normalized)) return "bad";
  if (["past_due"].includes(normalized)) return "warn";
  if (["draft", "needs_review"].includes(normalized)) return "draft";
  if (["archived"].includes(normalized)) return "muted";
  return "draft";
}

function scoreTone(value) {
  const score = Number(value || 0);
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function stat(label, value, options = {}) {
  const id = options.id || slugId(label);
  const isZero = Number(value || 0) === 0;
  return `
    <div class="admin-stat${isZero ? " is-zero" : ""}" data-testid="stat-row-${escapeHtml(id)}">
      <div>
        <span>${escapeHtml(label)}</span>
        ${options.hint ? `<small>${escapeHtml(options.hint)}</small>` : ""}
      </div>
      <div class="admin-stat-value">
        <strong>${escapeHtml(value)}</strong>
        ${options.unit ? `<em>${escapeHtml(options.unit)}</em>` : ""}
        ${options.trend !== undefined ? chip(options.trend, scoreTone(options.trend), "score") : ""}
      </div>
    </div>
  `;
}

function getPath(source, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), source);
}

function setPath(target, path, value) {
  const keys = String(path).split(".");
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

function renderStats(summary) {
  const premium = summary.premium || {};
  const byStatus = premium.by_status || {};
  const statusCount = (status) => Number(byStatus[status] || 0);
  els.env.textContent = summary.env?.lemonsqueezy_test_mode ? "Test mode" : "Live mode";
  els.env.dataset.mode = summary.env?.lemonsqueezy_test_mode ? "test" : "live";
  els.stats.innerHTML = [
    stat("Premium total", premium.total || 0, { id: "premium-total" }),
    stat("Premium active", statusCount("active") + statusCount("on_trial"), {
      id: "premium-active",
      hint: "Cuentas con suscripcion activa esta semana"
    }),
    stat("On trial", statusCount("on_trial"), {
      id: "premium-trial",
      hint: "Pruebas activas pendientes de conversion"
    }),
    stat("Unpaid", statusCount("unpaid") + statusCount("past_due") + statusCount("payment_failed"), {
      id: "premium-unpaid",
      hint: "Pagos fallidos, pendientes o vencidos"
    }),
    stat("Canceladas", statusCount("cancelled") + statusCount("expired"), {
      id: "premium-cancelled",
      hint: "Suscripciones canceladas o expiradas"
    }),
    stat("Paid", statusCount("paid"), {
      id: "premium-paid",
      hint: "Eventos de pago confirmados"
    })
  ].join("");
}

function formatMoneyCents(cents, currency = "EUR") {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  } catch (error) {
    return `${amount.toFixed(Number.isInteger(amount) ? 0 : 2)} ${currency || "EUR"}`;
  }
}

function renderRevenue(revenue = {}) {
  if (!els.revenueSummary || !els.revenueChart) return;
  const currency = revenue.currency || "EUR";
  const months = revenue.months || [];
  const maxRevenue = Number(revenue.max_month_revenue_cents || Math.max(0, ...months.map((item) => Number(item.revenue_cents || 0))));
  const paymentCount = Number(revenue.payment_count || 0);

  els.revenueSummary.innerHTML = [
    stat("Ingresos 12m", formatMoneyCents(revenue.total_revenue_cents, currency), {
      id: "revenue-total",
      hint: `${paymentCount} cobros registrados`
    }),
    stat("Mes actual", formatMoneyCents(revenue.current_month_revenue_cents, currency), {
      id: "revenue-current-month",
      hint: "Cobros confirmados este mes"
    }),
    stat("Media mensual", formatMoneyCents(revenue.average_monthly_revenue_cents, currency), {
      id: "revenue-average",
      hint: "Media sobre la ventana visible"
    })
  ].join("");

  if (revenue.table_missing) {
    els.revenueChart.innerHTML = `<p class="admin-empty-state compact">Falta la tabla <strong>premium_revenue_events</strong>. Ejecuta <strong>database/premium-revenue-events.sql</strong> y los siguientes webhooks de Lemon empezaran a llenar la grafica.</p>`;
    return;
  }

  const bars = months
    .map((month) => {
      const value = Number(month.revenue_cents || 0);
      const height = maxRevenue ? Math.max(5, Math.round((value / maxRevenue) * 100)) : 3;
      return `
        <div class="admin-revenue-month" title="${escapeHtml(month.label)}: ${escapeHtml(formatMoneyCents(value, currency))}">
          <div class="admin-revenue-track"><i style="--revenue-height:${height}%"></i></div>
          <strong>${escapeHtml(month.label || "-")}</strong>
          <span>${escapeHtml(formatMoneyCents(value, currency))}</span>
        </div>
      `;
    })
    .join("");

  els.revenueChart.innerHTML = `
    ${paymentCount ? "" : `<p class="admin-empty-state compact">Sin cobros registrados todavia. La grafica se llenara con eventos de pago reales.</p>`}
    <div class="admin-revenue-bars">${bars}</div>
  `;
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!total) return "0 min";
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)} min`;
}

function renderUsageList(title, rows) {
  const items = (rows || []).slice(0, 6);
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0) || 1;
  return `
    <section class="admin-extension-card">
      <span>${escapeHtml(title)}</span>
      ${
        items.length
          ? items
              .map((item) => {
                const pct = Math.max(4, Math.round((Number(item.count || 0) / total) * 100));
                return `
                  <div class="admin-extension-row">
                    <strong>${escapeHtml(item.label || "unknown")}</strong>
                    <em>${escapeHtml(item.count || 0)}</em>
                    <i style="--usage-pct:${pct}%"></i>
                  </div>
                `;
              })
              .join("")
          : `<p class="admin-empty-state compact">Sin datos todavia.</p>`
      }
    </section>
  `;
}

function renderExtensionUsage(payload) {
  if (!els.extensionStats || !els.extensionBreakdown) return;
  if (!payload?.ok && payload?.table_missing) {
    els.extensionStats.innerHTML = [
      stat("Usuarios 30d", 0, { id: "extension-users", hint: "Ejecuta database/extension-usage-events.sql" }),
      stat("Activos 7d", 0, { id: "extension-active-7d" }),
      stat("Sesiones 30d", 0, { id: "extension-sessions" }),
      stat("Tiempo uso", "0 min", { id: "extension-usage-time" })
    ].join("");
    els.extensionBreakdown.innerHTML = `<p class="admin-empty-state compact">Falta la tabla <strong>extension_usage_events</strong>. Cuando exista y la extensión envíe eventos, aquí aparecerán navegador, país, versión y eventos.</p>`;
    return;
  }

  els.extensionStats.innerHTML = [
    stat("Usuarios 30d", payload.unique_users_30d || 0, {
      id: "extension-users",
      hint: "Personas anonimas distintas usando la extension"
    }),
    stat("Activos 7d", payload.active_users_7d || 0, {
      id: "extension-active-7d",
      hint: `${payload.active_users_24h || 0} activos en 24h`
    }),
    stat("Sesiones 30d", payload.sessions_30d || 0, {
      id: "extension-sessions",
      hint: `${payload.total_events || 0} eventos registrados`
    }),
    stat("Tiempo uso", formatDuration(payload.active_seconds_30d), {
      id: "extension-usage-time",
      hint: `Media sesion ${formatDuration(payload.average_session_seconds)}`
    })
  ].join("");

  els.extensionBreakdown.innerHTML = [
    renderUsageList("Navegador", payload.by_browser),
    renderUsageList("Pais", payload.by_country),
    renderUsageList("Version", payload.by_extension_version),
    renderUsageList("Evento", payload.by_event_name)
  ].join("");
}

function renderParkingStats(payload) {
  if (!els.parkingStats) return;
  els.parkingStats.innerHTML = [
    stat("Cache total", payload.total_cache_rows || 0, { id: "cache-total", unit: "entradas" }),
    stat("Cache vigente", payload.valid_cache_rows || 0, { id: "cache-vigente", hint: "Entradas con TTL activo" }),
    stat("Assessments", payload.assessments_total || 0, { id: "assessments" }),
    stat("Score medio", payload.average_score || 0, { id: "score-medio", unit: "/10", trend: payload.average_score || 0 })
  ].join("");
}

function renderParkingRows(rows) {
  if (!els.parkingRows) return;
  if (!rows.length) {
    els.parkingRows.innerHTML = `<tr><td colspan="5">No hay calculos de parking cacheados todavia.</td></tr>`;
    return;
  }

  els.parkingRows.innerHTML = rows
    .map((row) => {
      if (Object.prototype.hasOwnProperty.call(row, "overall_score")) {
        const score = Number(row.overall_score || 0);
        const confidence = Number(row.confidence_score || 0);
        return `
          <tr>
            <td>
              <strong>${escapeHtml(row.address_text || row.street || row.source_url || "-")}</strong>
              <div class="admin-subtle">${escapeHtml([row.zone_name, row.district, row.municipality].filter(Boolean).join(" / ") || "-")}</div>
            </td>
            <td>${chip(`${score}/10 - ${row.overall_label || "-"}`, score >= 7 ? "bad" : score <= 4 ? "published" : "warn")}</td>
            <td>${chip(confidence.toFixed(2), confidence >= 0.7 ? "published" : "draft")}</td>
            <td>${escapeHtml(row.profile || "general")}</td>
            <td>
              ${escapeHtml(formatDate(row.last_checked_at))}
              <div class="admin-subtle">${escapeHtml(row.status || "-")}</div>
            </td>
          </tr>
        `;
      }

      const score = Number(row.score || 0);
      const confidence = Number(row.confidence_score || 0);
      const expired = row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
      return `
        <tr>
          <td>
            <strong>${escapeHtml(row.city || row.geohash || "-")}</strong>
            <div class="admin-subtle">${escapeHtml(row.geohash || "-")} - ${escapeHtml(row.radius_m || 500)} m</div>
          </td>
          <td>${chip(`${score}/10 - ${row.label || "-"}`, score >= 7 ? "bad" : score <= 4 ? "published" : "warn")}</td>
          <td>${chip(confidence.toFixed(2), confidence >= 0.7 ? "published" : "draft")}</td>
          <td>${escapeHtml(row.perspective || "visitor")}</td>
          <td>
            ${escapeHtml(formatDate(row.expires_at))}
            <div class="admin-subtle">${expired ? "caducado" : "vigente"}</div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function releaseTargetLabel(target) {
  return {
    web: "Web",
    extension: "Extensión",
    backoffice: "Backoffice"
  }[target] || target;
}

function releaseRowsElement(target) {
  return Array.from(els.releaseRows).find((node) => node.dataset.releaseRows === target);
}

function releaseConnectorsElement(target) {
  return Array.from(els.releaseConnectors).find((node) => node.dataset.releaseConnectors === target);
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function connectorCard(connector) {
  return `
    <article class="admin-release-connector ${connector.configured ? "is-ready" : "is-missing"}">
      <div>
        <strong>${escapeHtml(connector.label)}</strong>
        <span>${escapeHtml(connector.configured ? "Configurado" : "Pendiente")}</span>
      </div>
      <p>${escapeHtml(connector.purpose || "")}</p>
    </article>
  `;
}

function renderReleaseConnectors(target, connectors = {}) {
  const targetEl = releaseConnectorsElement(target);
  if (!targetEl) return;
  const items = connectors[target] || [];
  targetEl.innerHTML = items.length
    ? items.map(connectorCard).join("")
    : `<p class="admin-empty-state compact">Sin conectores definidos para ${escapeHtml(releaseTargetLabel(target))}.</p>`;
}

function releaseChromeActions(row) {
  const connector = String(row.connector_target || "").toLowerCase();
  if (row.target !== "extension" || connector !== "chrome") return "";
  const id = escapeHtml(row.id || "");
  return `
    <div class="admin-row-actions">
      <button class="admin-button tiny ghost" type="button" data-release-chrome-action="status" data-release-id="${id}">Estado Chrome</button>
      <button class="admin-button tiny ghost" type="button" data-release-chrome-action="upload" data-release-id="${id}">Subir ZIP</button>
      <button class="admin-button tiny" type="button" data-release-chrome-action="publish" data-release-id="${id}">Enviar revision</button>
    </div>
  `;
}

function renderReleaseRows(target, payload = {}) {
  const targetEl = releaseRowsElement(target);
  if (!targetEl) return;
  renderReleaseConnectors(target, payload.connectors || {});
  const rows = payload.artifacts || [];
  state.releases[target] = rows;

  if (payload.table_missing) {
    targetEl.innerHTML = `<tr><td colspan="4">Falta la tabla release_artifacts. Ejecuta database/release-artifacts.sql.</td></tr>`;
    return;
  }
  if (!rows.length) {
    targetEl.innerHTML = `<tr><td colspan="4">Aun no hay artefactos de ${escapeHtml(releaseTargetLabel(target))} guardados.</td></tr>`;
    return;
  }

  targetEl.innerHTML = rows
    .map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.version || "-")}</strong>
          <div class="admin-subtle">${escapeHtml(row.title || "-")}</div>
          <div class="admin-subtle">${escapeHtml(formatDate(row.created_at))}</div>
        </td>
        <td>
          ${chip(row.channel || "draft", statusTone(row.channel))}
          <div class="admin-subtle">${escapeHtml(row.connector_target || row.artifact_kind || "-")}</div>
        </td>
        <td>
          <strong>${escapeHtml(row.file_name || row.artifact_kind || "-")}</strong>
          <div class="admin-subtle">${escapeHtml(formatBytes(row.file_size_bytes))}</div>
          <div class="admin-subtle">${escapeHtml(row.sha256 ? `sha ${row.sha256.slice(0, 10)}` : row.storage_path || "-")}</div>
        </td>
        <td>
          ${chip(row.status || "draft", statusTone(row.status))}
          ${releaseChromeActions(row)}
        </td>
      </tr>
    `)
    .join("");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function releaseFilePayload(file) {
  if (!file) return {};
  if (file.size > MAX_RELEASE_FILE_BYTES) {
    throw new Error("Archivo demasiado grande para guardar inline. Usa Storage cuando activemos paquetes grandes.");
  }
  const buffer = await file.arrayBuffer();
  return {
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    file_size_bytes: file.size,
    sha256: await sha256Hex(buffer),
    artifact_payload: {
      encoding: "base64",
      content_base64: arrayBufferToBase64(buffer)
    }
  };
}

async function releasePayloadFromForm(form) {
  const data = new FormData(form);
  const file = data.get("artifact_file");
  return {
    target: form.dataset.releaseTarget,
    version: String(data.get("version") || "").trim(),
    title: String(data.get("title") || "").trim(),
    channel: String(data.get("channel") || "draft"),
    status: "draft",
    artifact_kind: String(data.get("artifact_kind") || "bundle"),
    connector_target: String(data.get("connector_target") || "").trim(),
    notes: String(data.get("notes") || "").trim(),
    ...(await releaseFilePayload(file && file.name ? file : null))
  };
}

async function saveReleaseArtifact(form) {
  const target = form.dataset.releaseTarget;
  const payload = await releasePayloadFromForm(form);
  await api("/api/admin?resource=operations/releases", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  form.reset();
  await loadReleaseArtifacts(target);
  showStatus(`${releaseTargetLabel(target)} guardado en backoffice.`, "good");
}

async function runChromeReleaseAction(action, artifactId, button) {
  if (action === "publish" && !window.confirm("Enviar este ZIP a revision/publicacion en Chrome Web Store?")) return;
  const label = {
    status: "leyendo estado de Chrome",
    upload: "subiendo ZIP a Chrome",
    publish: "enviando a revision en Chrome"
  }[action] || "ejecutando accion de Chrome";
  showStatus(`Chrome: ${label}...`);
  if (button) button.disabled = true;
  try {
    const payload = await api("/api/admin?resource=operations/chrome", {
      method: "POST",
      body: JSON.stringify({
        action,
        artifact_id: artifactId,
        publish_type: "DEFAULT_PUBLISH"
      })
    });
    await loadReleaseArtifacts("extension");
    showStatus(payload.message || "Accion de Chrome completada.", "good");
  } finally {
    if (button) button.disabled = false;
  }
}

function premiumDetail(label, value) {
  if (!value) return "";
  return `<div class="admin-subtle"><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`;
}

function premiumDateDetail(label, value) {
  if (!value) return "";
  return premiumDetail(label, formatDate(value));
}

function renderPremium(rows) {
  if (!rows.length) {
    els.premiumRows.innerHTML = `<tr><td colspan="6">No hay suscripciones con este filtro.</td></tr>`;
    return;
  }

  els.premiumRows.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.email || "-")}</strong>
          ${premiumDetail("customer", row.provider_customer_id)}
        </td>
        <td>${chip(row.status, statusTone(row.status))}</td>
        <td>
          <strong>${escapeHtml(row.provider || "-")}</strong>
          ${premiumDetail("product", row.product_id)}
          ${premiumDetail("variant", row.variant_id)}
        </td>
        <td>
          ${premiumDetail("subscription", row.provider_subscription_id)}
          ${premiumDetail("order", row.provider_order_id)}
        </td>
        <td>
          ${premiumDateDetail("renueva", row.renews_at)}
          ${premiumDateDetail("trial", row.trial_ends_at)}
          ${premiumDateDetail("termina", row.ends_at)}
          ${premiumDateDetail("creada", row.created_at)}
          ${premiumDateDetail("actualizada", row.updated_at)}
        </td>
        <td>${escapeHtml(row.event_name || "-")}</td>
      </tr>
    `
    )
    .join("");
}

function renderSeo(payload) {
  const rows = payload.landings || [];
  state.seo.page = Number(payload.page || state.seo.page || 1);
  state.seo.pageSize = Number(payload.page_size || state.seo.pageSize || 10);
  state.seo.hasNextPage = Boolean(payload.has_next_page);
  state.seo.hasPreviousPage = Boolean(payload.has_previous_page);
  renderSeoSummary(payload.summary || {}, rows);

  if (!rows.length) {
    els.seoRows.innerHTML = `<tr><td colspan="5">No hay landings con este filtro.</td></tr>`;
    renderSeoPagination(payload);
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
        <td>${chip(Number(row.quality_score || 0).toFixed(0), scoreTone(row.quality_score), "score")}</td>
          <td>
            ${chip(row.status, statusTone(row.status))}
            ${chip(row.index_status, statusTone(row.index_status))}
          </td>
          <td>
            <div class="admin-row-actions">
              <button class="admin-icon-button" type="button" data-seo-action="regenerate" data-slug="${escapeHtml(row.slug)}" aria-label="Regenerar landing">R</button>
              <button class="admin-icon-button" type="button" data-seo-action="publish" data-slug="${escapeHtml(row.slug)}" aria-label="Publicar landing">P</button>
              <button class="admin-icon-button" type="button" data-seo-action="noindex" data-slug="${escapeHtml(row.slug)}" aria-label="Marcar noindex">N</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
  renderSeoPagination(payload);
}

function renderSeoSummary(summary = {}, fallbackRows = []) {
  if (!els.seoSummary) return;
  const rows = Array.isArray(fallbackRows) ? fallbackRows : [];
  const fallbackTotal = rows.length;
  const total = Number(summary.total_landings ?? fallbackTotal);
  const published = Number(summary.published ?? rows.filter((row) => row.status === "published").length);
  const pending = Number(summary.pending_landings ?? rows.filter((row) => ["draft", "needs_review", "ready_to_publish"].includes(row.status)).length);
  const ready = Number(summary.ready_to_publish ?? rows.filter((row) => row.status === "ready_to_publish").length);
  const needsReview = Number(summary.needs_review ?? rows.filter((row) => row.status === "needs_review").length);
  const noindex = Number(summary.noindex ?? rows.filter((row) => row.index_status === "noindex" || row.status === "noindex").length);
  const opportunities = Number(summary.pending_opportunities ?? 0);
  const averageScore = Number(summary.average_quality_score ?? 0);

  els.seoSummary.innerHTML = [
    stat("Total", total, { id: "seo-total", hint: "Landings SEO creadas" }),
    stat("Publicadas", published, { id: "seo-published", hint: "Visibles e indexables" }),
    stat("Pendientes", pending, { id: "seo-pending", hint: "Draft + revision + ready" }),
    stat("Ready", ready, { id: "seo-ready", hint: "Listas para publicar" }),
    stat("Revision", needsReview, { id: "seo-review", hint: "Necesitan criterio humano" }),
    stat("Noindex", noindex, { id: "seo-noindex", hint: "Bloqueadas para indice" }),
    stat("Oportunidades", opportunities, { id: "seo-opportunities", hint: "Pendientes de generar" }),
    stat("Score medio", averageScore ? averageScore.toFixed(0) : 0, { id: "seo-average-score", unit: "/100", hint: "Solo landings con score" })
  ].join("");
}

function renderSeoPagination(payload) {
  if (!els.seoPagination) return;
  const page = Number(payload.page || state.seo.page || 1);
  const from = Number(payload.from || 0);
  const to = Number(payload.to || 0);
  const hasPrevious = Boolean(payload.has_previous_page);
  const hasNext = Boolean(payload.has_next_page);
  const range = from && to ? `${from}-${to}` : "0";

  els.seoPagination.innerHTML = `
    <span>Pagina ${escapeHtml(page)} - Landings ${escapeHtml(range)} - 10 por pagina</span>
    <div class="admin-pagination-actions">
      <button class="admin-button tiny ghost" type="button" data-seo-page="previous" data-testid="pagination-prev" ${hasPrevious ? "" : "disabled"}>Anterior</button>
      <button class="admin-button tiny secondary" type="button" data-seo-page="next" data-testid="pagination-next" ${hasNext ? "" : "disabled"}>Siguiente</button>
    </div>
  `;
}

function fieldOptions(field, value) {
  if (field.type === "boolean") {
    return [
      { value: "true", label: "Si" },
      { value: "false", label: "No" }
    ]
      .map((option) => {
        const selected = String(value === true) === option.value ? " selected" : "";
        return `<option value="${option.value}"${selected}>${escapeHtml(option.label)}</option>`;
      })
      .join("");
  }

  return (field.options || [])
    .map((option) => {
      const selected = String(value) === String(option.value) ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join("");
}

function renderKpiControl(field, value) {
  const path = escapeHtml(field.path);
  const common = `name="${path}" data-kpi-path="${path}" data-kpi-type="${escapeHtml(field.type)}"`;

  if (field.type === "select" || field.type === "boolean") {
    return `<select ${common}>${fieldOptions(field, value)}</select>`;
  }

  if (field.type === "textarea") {
    return `<textarea ${common} rows="3">${escapeHtml(value ?? "")}</textarea>`;
  }

  if (field.type === "number") {
    const min = typeof field.min === "number" ? ` min="${field.min}"` : "";
    const max = typeof field.max === "number" ? ` max="${field.max}"` : "";
    const step = typeof field.step === "number" ? ` step="${field.step}"` : "";
    return `<input ${common} type="number"${min}${max}${step} value="${escapeHtml(value ?? field.defaultValue ?? "")}">`;
  }

  return `<input ${common} type="text" value="${escapeHtml(value ?? "")}">`;
}

function defaultKpiValue(field) {
  const storedDefault = getPath(state.kpis.defaults, field.path);
  return storedDefault ?? field.defaultValue;
}

function formatKpiValue(field, value) {
  if (value === undefined || value === null || value === "") return "-";
  if (field.type === "boolean") return value ? "Si" : "No";
  if (field.type === "select") {
    const option = (field.options || []).find((item) => String(item.value) === String(value));
    return option ? option.label : value;
  }
  if (field.type === "number" && field.suffix) return `${value}${field.suffix}`;
  return String(value);
}

function kpiProposalText(field) {
  const proposedValue = defaultKpiValue(field);
  const formattedValue = formatKpiValue(field, proposedValue);
  const path = String(field.path || "");

  if (field.type === "boolean") {
    return `${formattedValue}. Mi propuesta es mantener esta bandera como punto de control para activar o apagar el bloque sin tocar el calculo interno.`;
  }
  if (path.includes("fallback")) {
    return `Partir de ${formattedValue}. La propuesta evita KPIs fijos cuando falta dato real y deja claro cuando el resultado es orientativo.`;
  }
  if (path.includes("weight")) {
    return `Partir de ${formattedValue}. La propuesta reparte el peso para que ningun factor aislado domine el score sin evidencia suficiente.`;
  }
  if (path.includes("threshold") || path.includes("minimum")) {
    return `Partir de ${formattedValue}. La propuesta fija un umbral prudente y se deberia ajustar solo con datos historicos medidos.`;
  }
  if (path.includes("cap") || path.includes("max")) {
    return `Partir de ${formattedValue}. La propuesta limita el optimismo cuando la precision del dato de partida baja.`;
  }
  return `Partir de ${formattedValue}. Es el dato de partida recomendado para medir resultados antes de endurecer o relajar la regla.`;
}

function renderKpis(payload) {
  state.kpis.schema = payload.schema || [];
  state.kpis.settings = payload.settings || {};
  state.kpis.defaults = payload.defaults || {};

  const note = payload.table_missing
    ? `<div class="admin-kpi-alert">Falta la tabla <strong>kpi_settings</strong>. Ejecuta <strong>database/kpi-settings.sql</strong> en Supabase para guardar cambios.</div>`
    : payload.error
      ? `<div class="admin-kpi-alert">Aviso KPI: ${escapeHtml(payload.error)}</div>`
      : `<div class="admin-kpi-meta">Ultima actualizacion KPI: ${escapeHtml(formatDate(payload.updated_at))}</div>`;

  els.kpiForm.innerHTML =
    note +
    state.kpis.schema
      .map(
        (group) => `
        <section class="admin-kpi-group">
          <div class="admin-kpi-group-title">
            <span>${escapeHtml(group.label)}</span>
            <small>${escapeHtml(group.description || "")}</small>
          </div>
          <div class="admin-kpi-fields">
            ${(group.fields || [])
              .map((field) => {
                const value = getPath(state.kpis.settings, field.path);
                const startingValue = defaultKpiValue(field);
                const currentValue = value ?? startingValue;
                return `
                  <label class="admin-kpi-field">
                    <span>
                      ${escapeHtml(field.label)}
                      ${field.suffix ? `<em>${escapeHtml(field.suffix)}</em>` : ""}
                    </span>
                    ${renderKpiControl(field, currentValue)}
                    <small class="admin-kpi-purpose"><strong>Para que sirve:</strong> ${escapeHtml(field.description || "Define como se calcula o se muestra este KPI.")}</small>
                    <small class="admin-kpi-proposal"><strong>Mi propuesta:</strong> ${escapeHtml(kpiProposalText(field))}</small>
                    <div class="admin-kpi-field-meta">
                      <span><strong>Dato actual:</strong> ${escapeHtml(formatKpiValue(field, currentValue))}</span>
                      <span><strong>Dato de partida:</strong> ${escapeHtml(formatKpiValue(field, startingValue))}</span>
                    </div>
                  </label>
                `;
              })
              .join("")}
          </div>
        </section>
      `
      )
      .join("");
}

function setVideoActions(enabled) {
  [els.videoCopyPrompt, els.videoDownloadAiPack, els.videoDownloadJson, els.videoDownloadHtml, els.videoExport].forEach((button) => {
    if (button) button.disabled = !enabled || state.video.busy;
  });
  setRunwayActions();
}

function setVideoBusy(isBusy, message = "Trabajando...") {
  state.video.busy = Boolean(isBusy);
  if (els.videoBusy) {
    els.videoBusy.hidden = !state.video.busy;
  }
  if (els.videoBusyMessage) {
    els.videoBusyMessage.textContent = message;
  }
  if (els.videoForm) {
    els.videoForm.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = state.video.busy;
    });
  }
  setVideoActions(Boolean(state.video.lastProject));
}

function setRunwayStatus(message, tone = "neutral") {
  if (!els.videoRunwayStatus) return;
  els.videoRunwayStatus.textContent = message || "";
  els.videoRunwayStatus.dataset.tone = tone;
}

function setRunwayActions() {
  const hasProject = Boolean(state.video.lastProject);
  const hasEstimate = Boolean(state.video.runwayEstimate);
  const hasJob = Boolean(state.video.runwayJob?.id);
  const hasResult = Boolean(state.video.runwayJob?.result_url);
  const isBusy = Boolean(state.video.busy);
  if (els.videoRunwayEstimate) els.videoRunwayEstimate.disabled = !hasProject || isBusy;
  if (els.videoRunwayRender) els.videoRunwayRender.disabled = !hasProject || !hasEstimate || isBusy;
  if (els.videoRunwayPoll) els.videoRunwayPoll.disabled = !hasJob || isBusy || hasResult;
  if (els.videoRunwayImport) els.videoRunwayImport.disabled = !hasResult || isBusy;
}

function runwayPayload(extra = {}) {
  return {
    project: state.video.lastProject,
    model: els.videoRunwayModel?.value || "gen4.5",
    duration_seconds: Number(els.videoRunwayDuration?.value || 5),
    scene_index: state.video.selectedSceneIndex || 0,
    ...extra
  };
}

function formatRunwayEstimate(estimate, limits = {}) {
  if (!estimate) return "Sin estimacion.";
  const maxCost = limits.max_cost_usd !== undefined ? ` Limite/render: $${Number(limits.max_cost_usd).toFixed(2)}.` : "";
  const dailyBudget = limits.daily_budget_usd !== undefined ? ` Presupuesto diario: $${Number(limits.daily_budget_usd).toFixed(2)}.` : "";
  return `Estimacion Runway: ${estimate.model}, ${estimate.duration_seconds}s, ${estimate.estimated_credits} creditos, $${Number(estimate.estimated_cost_usd).toFixed(2)}.${maxCost}${dailyBudget}`;
}

async function estimateRunwayRender() {
  if (!state.video.lastProject) {
    setRunwayStatus("Genera primero un storyboard.", "bad");
    return null;
  }
  const payload = await api("/api/admin?resource=social-video/render", {
    method: "POST",
    body: JSON.stringify(runwayPayload({ dry_run: true }))
  });
  state.video.runwayEstimate = payload.estimate;
  state.video.runwayJob = null;
  setRunwayStatus(formatRunwayEstimate(payload.estimate, payload), "good");
  setRunwayActions();
  return payload;
}

async function startRunwayRender() {
  if (!state.video.runwayEstimate) await estimateRunwayRender();
  if (!els.videoRunwayConfirm?.checked) {
    setRunwayStatus("Marca la confirmacion de coste antes de lanzar Runway.", "bad");
    return;
  }
  setVideoBusy(true, "Enviando render a Runway con limite de coste.");
  try {
    const payload = await api("/api/admin?resource=social-video/render", {
      method: "POST",
      body: JSON.stringify(
        runwayPayload({
          confirm_cost_usd: state.video.runwayEstimate?.estimated_cost_usd || 0
        })
      )
    });
    state.video.runwayJob = payload.job;
    setRunwayStatus(`Runway lanzado. Job ${payload.job?.id || "-"} en estado ${payload.job?.status || "submitted"}.`, "good");
    showStatus("Render Runway lanzado. Usa Comprobar estado para traer el clip cuando termine.", "good");
  } finally {
    setVideoBusy(false);
    setRunwayActions();
  }
}

async function pollRunwayRender() {
  const jobId = state.video.runwayJob?.id;
  if (!jobId) return;
  const payload = await api(`/api/admin?resource=social-video/render&job_id=${encodeURIComponent(jobId)}`);
  state.video.runwayJob = payload.job;
  if (payload.job?.result_url) {
    setRunwayStatus("Runway ha terminado. Pulsa Usar clip IA para cargarlo como fondo.", "good");
  } else if (payload.job?.failure) {
    setRunwayStatus(`Runway fallo: ${payload.job.failure}`, "bad");
  } else {
    setRunwayStatus(`Runway sigue en estado ${payload.job?.status || "pendiente"}.`, "neutral");
  }
  setRunwayActions();
}

async function importRunwayClip() {
  const jobId = state.video.runwayJob?.id;
  if (!jobId) return;
  setVideoBusy(true, "Importando clip Runway para usarlo como fondo.");
  try {
    const response = await fetch(`/api/admin?resource=social-video/render-content&job_id=${encodeURIComponent(jobId)}`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || payload.error || "runway_clip_import_failed");
    }
    const blob = await response.blob();
    if (state.video.backgroundClipUrl) URL.revokeObjectURL(state.video.backgroundClipUrl);
    state.video.backgroundClipUrl = URL.createObjectURL(blob);
    state.video.backgroundClipName = `runway-${jobId}.mp4`;
    state.video.backgroundClipType = blob.type || "video/mp4";
    renderVideoPreview();
    renderVideoStoryboard();
    setRunwayStatus("Clip Runway cargado como fondo. Ya puedes exportar la maqueta final con marca InmoRadar.", "good");
    showStatus("Clip Runway cargado como fondo.", "good");
  } finally {
    setVideoBusy(false);
    setRunwayActions();
  }
}

function videoFormPayload(form) {
  const data = new FormData(form);
  return {
    topic: String(data.get("topic") || "random"),
    city: String(data.get("city") || "").trim(),
    duration_seconds: Number(data.get("duration_seconds") || 24),
    tone: String(data.get("tone") || "directo"),
    audience: String(data.get("audience") || "general"),
    visual_style: String(data.get("visual_style") || "hogar_cotidiano"),
    music_style: String(data.get("music_style") || "warm_house"),
    cta: String(data.get("cta") || "install")
  };
}

function syncVideoBackgroundClip(form) {
  const file = form?.querySelector('[name="background_clip"]')?.files?.[0];
  if (!file) return;
  if (state.video.backgroundClipUrl) {
    URL.revokeObjectURL(state.video.backgroundClipUrl);
  }
  state.video.backgroundClipUrl = URL.createObjectURL(file);
  state.video.backgroundClipName = file.name || "clip-personas-reales";
  state.video.backgroundClipType = file.type || "video";
}

function storedVideoProject(project) {
  if (!project) return null;
  const copy = { ...project };
  delete copy.local_background_clip;
  return copy;
}

function realVideoPackText(project) {
  if (!project) return "";
  const pack = project.real_ai_video || {};
  const scenePrompts = (pack.scene_prompts || project.scenes || [])
    .map((scene, index) => {
      const title = scene.title || scene.headline || `Escena ${index + 1}`;
      const prompt = scene.prompt || scene.visual_prompt || "";
      return `${String(index + 1).padStart(2, "0")} - ${title}\n${prompt}`;
    })
    .join("\n\n");

  return [
    `INMORADAR - PACK VIDEO IA REAL`,
    `Titulo: ${project.title || ""}`,
    `Duracion: ${project.duration_seconds || 24}s`,
    `Formato: ${project.format?.width || 1080}x${project.format?.height || 1920}`,
    "",
    "PROMPT MAESTRO",
    pack.master_prompt || project.global_ai_prompt || "",
    "",
    "NEGATIVE PROMPT",
    pack.negative_prompt || "Sin dibujos, sin 3D, sin avatares, sin caras deformes, sin manos deformes, sin texto ilegible, sin logotipos externos.",
    "",
    "ESCENAS",
    scenePrompts,
    "",
    "MUSICA",
    project.music_prompt || project.music_direction || "",
    "",
    "BRANDING OBLIGATORIO",
    `Logo InmoRadar arriba derecha. Texto exacto "${project.branding?.websiteText || "Inmoradar.app"}" abajo derecha durante todo el video.`,
    "",
    "USO RECOMENDADO",
    "Genera el video base con este pack en una IA de video. Despues sube ese clip en 'Clip IA/personas reales' y exporta la maqueta final con texto, marca y musica desde InmoRadar."
  ].join("\n");
}

function renderVideoProject(project) {
  const isNewProject = project?.id && project.id !== state.video.lastProject?.id;
  state.video.lastProject = project;
  if (isNewProject) {
    state.video.runwayEstimate = null;
    state.video.runwayJob = null;
    if (els.videoRunwayConfirm) els.videoRunwayConfirm.checked = false;
  }
  state.video.selectedSceneIndex = Math.min(state.video.selectedSceneIndex || 0, Math.max((project.scenes || []).length - 1, 0));
  sessionStorage.setItem(VIDEO_PROJECT_KEY, JSON.stringify(storedVideoProject(project)));
  renderVideoPreview();
  renderVideoStoryboard();
  setVideoActions(Boolean(project));
}

function renderVideoPreview() {
  const project = state.video.lastProject;
  if (!project || !els.videoPreview) return;
  const scenes = project.scenes || [];
  const scene = scenes[state.video.selectedSceneIndex] || scenes[0] || {};
  els.videoPreview.dataset.videoTopic = project.topic || "";
  if (els.videoPreviewTopic) els.videoPreviewTopic.textContent = project.topic_label || "Video IA";
  if (els.videoPreviewHeadline) els.videoPreviewHeadline.textContent = scene.headline || project.title || "Video InmoRadar";
  if (els.videoPreviewBody) els.videoPreviewBody.textContent = scene.body || project.caption || "";
  if (els.videoPreviewTitle) els.videoPreviewTitle.textContent = project.title || "Video InmoRadar";
  if (els.videoPreviewMeta) {
    const clipLabel = state.video.backgroundClipName ? `clip real: ${state.video.backgroundClipName}` : "maqueta local sin clip real";
    els.videoPreviewMeta.textContent = `${project.duration_seconds || 24}s - ${project.format?.width || 1080}x${project.format?.height || 1920} - ${project.visual_style_label || "hogar"} - ${project.music_label || "musica"} - ${clipLabel}`;
  }
  if (els.videoPreviewClip) {
    if (state.video.backgroundClipUrl) {
      if (els.videoPreviewClip.src !== state.video.backgroundClipUrl) {
        els.videoPreviewClip.src = state.video.backgroundClipUrl;
      }
      els.videoPreviewClip.hidden = false;
      els.videoPreviewClip.play().catch(() => {});
      els.videoPreview.classList.add("has-real-clip");
    } else {
      els.videoPreviewClip.hidden = true;
      els.videoPreviewClip.removeAttribute("src");
      els.videoPreview.classList.remove("has-real-clip");
    }
  }
}

function renderVideoStoryboard() {
  const project = state.video.lastProject;
  if (!els.videoStoryboard) return;
  if (!project) {
    els.videoStoryboard.innerHTML = `<p class="admin-empty-state">Genera un video para ver aqui el storyboard completo.</p>`;
    return;
  }
  els.videoStoryboard.innerHTML = `
    <section class="admin-video-output-head">
      <div>
        <span class="admin-kicker muted">Paquete IA</span>
        <h3>${escapeHtml(project.title)}</h3>
        <p>${escapeHtml(project.caption || "")}</p>
      </div>
      <div class="admin-video-output-meta">
        ${chip(project.status || "storyboard_ready", "ready")}
        ${chip(`${project.duration_seconds || 24}s`, "draft")}
      </div>
    </section>
    <section class="admin-video-branding-card">
      <strong>Reglas globales del video</strong>
      <p>Fondo humano: ${escapeHtml(project.visual_style_label || "Hogar cotidiano")} - ${escapeHtml(project.visual_backdrop || "")}</p>
      <p>Musica: ${escapeHtml(project.music_label || "House suave")} - ${escapeHtml(project.music_direction || "")}</p>
      <p>Branding: logo arriba derecha (${escapeHtml(project.branding?.logoSizePx || 72)} px) y texto exacto "${escapeHtml(project.branding?.websiteText || "Inmoradar.app")}" abajo derecha durante todo el video.</p>
    </section>
    <section class="admin-video-branding-card">
      <strong>Personas reales</strong>
      <p>${state.video.backgroundClipName ? `Clip real activo: ${escapeHtml(state.video.backgroundClipName)}. Se usara como fondo del export local.` : "Sin clip real subido. El export local usa una maqueta; para personas reales descarga el Pack IA real, genera un clip vertical y subelo en el formulario."}</p>
      <p>${escapeHtml(project.real_ai_video?.production_note || "El render final con personas reales requiere una IA de video o un clip real como fuente visual.")}</p>
    </section>
    <div class="admin-video-scenes">
      ${(project.scenes || [])
        .map(
          (scene, index) => `
          <button class="admin-video-scene${index === state.video.selectedSceneIndex ? " active" : ""}" type="button" data-video-scene="${index}" data-testid="admin-video-scene-${index + 1}">
            <span>${String(index + 1).padStart(2, "0")} - ${escapeHtml(scene.role || "scene")}</span>
            <strong>${escapeHtml(scene.headline || "")}</strong>
            <p>${escapeHtml(scene.body || "")}</p>
            <small><b>Voz:</b> ${escapeHtml(scene.voiceover || "")}</small>
            <small><b>Visual IA:</b> ${escapeHtml(scene.visual_prompt || "")}</small>
            <small><b>Movimiento:</b> ${escapeHtml(scene.motion || "")}</small>
          </button>
        `
        )
        .join("")}
    </div>
    <section class="admin-video-prompt">
      <span class="admin-kicker muted">Prompt maestro IA</span>
      <pre>${escapeHtml(project.global_ai_prompt || "")}</pre>
    </section>
  `;
}

function downloadText(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildVideoPreviewHtml(project) {
  const firstScene = project.scenes?.[0] || {};
  const scenes = (project.scenes || [])
    .map(
      (scene, index) => `
      <article class="scene">
        <span>${String(index + 1).padStart(2, "0")} / ${escapeHtml(scene.role || "scene")}</span>
        <h2>${escapeHtml(scene.headline || "")}</h2>
        <p>${escapeHtml(scene.body || "")}</p>
      </article>
    `
    )
    .join("");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project.title || "Video InmoRadar")}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#09090B;color:#fff;font-family:Inter,system-ui,sans-serif}.canvas{position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(circle at 25% 15%,rgba(255,69,0,.28),transparent 34%),linear-gradient(145deg,#09090B,#18181B 58%,#0A140F)}.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px);background-size:72px 72px}.people{position:absolute;inset:auto 0 0 0;height:56%;opacity:.9;background:radial-gradient(circle at 24% 34%,rgba(255,210,185,.38) 0 44px,transparent 45px),radial-gradient(circle at 49% 30%,rgba(255,210,185,.36) 0 40px,transparent 41px),radial-gradient(circle at 74% 36%,rgba(255,210,185,.34) 0 42px,transparent 43px),linear-gradient(90deg,transparent 12%,rgba(245,242,234,.22) 12% 28%,transparent 28% 35%,rgba(255,98,44,.22) 35% 55%,transparent 55% 62%,rgba(245,242,234,.18) 62% 82%,transparent 82%);filter:blur(.1px)}.people:before{content:"";position:absolute;left:140px;bottom:230px;width:150px;height:265px;border-radius:56px 56px 36px 36px;background:rgba(245,242,234,.56);box-shadow:270px -28px 0 rgba(255,98,44,.48),540px 16px 0 rgba(245,242,234,.46)}.people:after{content:"";position:absolute;left:356px;bottom:124px;width:370px;height:188px;border-radius:32px;background:rgba(9,9,11,.34);box-shadow:36px 40px 0 rgba(255,255,255,.13)}.content{position:absolute;left:76px;right:160px;top:260px;display:grid;gap:36px}.eyebrow{color:#FF4500;font:700 28px/1 monospace;letter-spacing:.22em;text-transform:uppercase}.content h1{margin:0;font-size:112px;line-height:.9;letter-spacing:-.07em}.content p{margin:0;color:rgba(255,255,255,.78);font-size:38px;line-height:1.35;max-width:760px}.scene-list{position:absolute;left:76px;right:76px;bottom:180px;display:grid;gap:18px}.scene{padding:24px 28px;border:1px solid rgba(255,255,255,.14);border-radius:28px;background:rgba(255,255,255,.08);backdrop-filter:blur(12px)}.scene span{color:#FF4500;font:700 18px/1 monospace;letter-spacing:.18em;text-transform:uppercase}.scene h2{margin:10px 0 6px;font-size:36px;line-height:1}.scene p{margin:0;color:rgba(255,255,255,.72);font-size:24px}.brand-logo{position:absolute;top:${project.branding?.logoMarginTopPx || 48}px;right:${project.branding?.logoMarginRightPx || 48}px;width:${project.branding?.logoSizePx || 72}px;height:${project.branding?.logoSizePx || 72}px;border-radius:22px}.brand-site{position:absolute;right:${project.branding?.websiteMarginRightPx || 48}px;bottom:${project.branding?.websiteMarginBottomPx || 48}px;font-size:${project.branding?.websiteFontSizePx || 32}px;font-weight:800;letter-spacing:-.02em}.safe{position:absolute;inset:96px;border:1px dashed rgba(255,255,255,.18);border-radius:42px;pointer-events:none}
  </style>
</head>
<body>
  <main class="canvas">
    <div class="grid"></div>
    <div class="safe"></div>
    <div class="people" aria-hidden="true"></div>
    <section class="content">
      <span class="eyebrow">${escapeHtml(project.topic_label || "InmoRadar")}</span>
      <h1>${escapeHtml(firstScene.headline || project.title || "Analiza antes de contactar.")}</h1>
      <p>${escapeHtml(project.caption || "")}</p>
    </section>
    <section class="scene-list">${scenes}</section>
    <img class="brand-logo" src="https://www.inmoradar.app/assets/inmoradar-brand-mark.svg" alt="InmoRadar">
    <span class="brand-site">Inmoradar.app</span>
  </main>
</body>
</html>`;
}

function supportedVideoMimeType() {
  if (!window.MediaRecorder) return "";
  return [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.64001F,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=h264"
  ].find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrapCanvasText(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawPerson(ctx, x, y, scale, tone, phase, accent = "#FF4500") {
  ctx.save();
  ctx.translate(x, y + Math.sin(phase) * 4);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.9;

  ctx.fillStyle = "rgba(0,0,0,.24)";
  roundRect(ctx, -70, 90, 140, 22, 12);
  ctx.fill();

  ctx.fillStyle = "rgba(18,18,20,.68)";
  roundRect(ctx, -34, 74, 24, 108, 12);
  ctx.fill();
  roundRect(ctx, 12, 74, 24, 108, 12);
  ctx.fill();

  ctx.fillStyle = tone;
  roundRect(ctx, -52, -22, 104, 118, 34);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.42;
  roundRect(ctx, -46, 2, 92, 16, 8);
  ctx.fill();
  ctx.globalAlpha = 0.9;

  ctx.fillStyle = "rgba(255,210,185,.82)";
  ctx.beginPath();
  ctx.arc(0, -64, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(10,10,11,.72)";
  ctx.beginPath();
  ctx.arc(-4, -82, 28, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,210,185,.64)";
  ctx.lineWidth = 20;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-48, 10);
  ctx.lineTo(-92, 56 + Math.sin(phase) * 8);
  ctx.moveTo(48, 10);
  ctx.lineTo(92, 56 + Math.cos(phase) * 8);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,.26)";
  roundRect(ctx, -24, -8, 48, 10, 5);
  ctx.fill();
  ctx.restore();
}

function drawPeopleBackground(ctx, project, elapsedMs) {
  const width = project.format?.width || 1080;
  const height = project.format?.height || 1920;
  const phase = elapsedMs / 900;

  ctx.save();
  ctx.globalAlpha = 0.98;
  const windowGlow = ctx.createLinearGradient(0, 620, width, 1180);
  windowGlow.addColorStop(0, "rgba(255,255,255,.12)");
  windowGlow.addColorStop(0.45, "rgba(255,69,0,.12)");
  windowGlow.addColorStop(1, "rgba(255,255,255,.05)");
  ctx.fillStyle = windowGlow;
  roundRect(ctx, 72, 640, 936, 520, 44);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.12)";
  roundRect(ctx, 108, 1080, 864, 300, 72);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.22)";
  roundRect(ctx, 78, 1288, 924, 154, 46);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.14)";
  roundRect(ctx, 220, 1440, 640, 92, 46);
  ctx.fill();

  const style = String(project.visual_style || "hogar_cotidiano");
  const palette =
    style === "amigos_piso"
      ? ["rgba(245,242,234,.82)", "rgba(255,98,44,.72)", "rgba(212,255,63,.52)"]
      : style === "familia_casa"
        ? ["rgba(245,242,234,.78)", "rgba(255,205,180,.74)", "rgba(255,255,255,.66)"]
        : ["rgba(245,242,234,.78)", "rgba(255,98,44,.68)", "rgba(255,255,255,.62)"];

  drawPerson(ctx, 250, 1168, 1.28, palette[0], phase, "#FF4500");
  drawPerson(ctx, 530, 1128, 1.18, palette[1], phase + 0.8, "#D4FF3F");
  drawPerson(ctx, 790, 1182, 1.08, palette[2], phase + 1.4, "#FF4500");

  ctx.fillStyle = "rgba(9,9,11,.34)";
  roundRect(ctx, 340, 1230, 380, 188, 30);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.16)";
  roundRect(ctx, 382, 1268, 296, 86, 20);
  ctx.fill();
  ctx.fillStyle = "#FF4500";
  roundRect(ctx, 404, 1370, 128, 10, 5);
  ctx.fill();
  ctx.restore();
}

function drawVideoBranding(ctx, project, logoImage) {
  const branding = project.branding || {};
  const width = project.format?.width || 1080;
  const height = project.format?.height || 1920;
  const logoSize = Number(branding.logoSizePx || 72);
  const logoX = width - Number(branding.logoMarginRightPx || 48) - logoSize;
  const logoY = Number(branding.logoMarginTopPx || 48);

  if (branding.showLogo !== false) {
    if (logoImage) {
      ctx.save();
      roundRect(ctx, logoX, logoY, logoSize, logoSize, 18);
      ctx.clip();
      ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
      ctx.restore();
    } else {
      ctx.fillStyle = "#09090B";
      roundRect(ctx, logoX, logoY, logoSize, logoSize, 18);
      ctx.fill();
      ctx.strokeStyle = "#FF4500";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(logoX + logoSize / 2, logoY + logoSize / 2);
      ctx.lineTo(logoX + logoSize * 0.62, logoY + logoSize * 0.37);
      ctx.stroke();
    }
  }

  if (branding.showWebsite !== false) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `900 ${Number(branding.websiteFontSizePx || 32)}px Arial`;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 18;
    ctx.fillText(
      branding.websiteText || "Inmoradar.app",
      width - Number(branding.websiteMarginRightPx || 48),
      height - Number(branding.websiteMarginBottomPx || 48)
    );
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }
}

function drawCoverVideo(ctx, video, width, height) {
  const videoWidth = video.videoWidth || width;
  const videoHeight = video.videoHeight || height;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.drawImage(video, x, y, drawWidth, drawHeight);
}

function drawVideoFrame(ctx, project, elapsedMs, logoImage, backgroundVideo) {
  const width = project.format?.width || 1080;
  const height = project.format?.height || 1920;
  const scenes = project.scenes || [];
  const scene =
    scenes.find((item) => elapsedMs >= Number(item.start_ms || 0) && elapsedMs < Number(item.end_ms || 0)) ||
    scenes[scenes.length - 1] ||
    {};
  const sceneIndex = Math.max(0, scenes.indexOf(scene));
  const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, (project.duration_seconds || 24) * 1000)));

  if (backgroundVideo && backgroundVideo.readyState >= 2) {
    drawCoverVideo(ctx, backgroundVideo, width, height);
    const photoOverlay = ctx.createLinearGradient(0, 0, width, height);
    photoOverlay.addColorStop(0, "rgba(9,9,11,.82)");
    photoOverlay.addColorStop(0.46, "rgba(9,9,11,.36)");
    photoOverlay.addColorStop(1, "rgba(9,9,11,.22)");
    ctx.fillStyle = photoOverlay;
    ctx.fillRect(0, 0, width, height);
    const bottomOverlay = ctx.createLinearGradient(0, height * 0.58, 0, height);
    bottomOverlay.addColorStop(0, "rgba(9,9,11,0)");
    bottomOverlay.addColorStop(1, "rgba(9,9,11,.82)");
    ctx.fillStyle = bottomOverlay;
    ctx.fillRect(0, 0, width, height);
  } else {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#09090B");
    bg.addColorStop(0.55, "#18181B");
    bg.addColorStop(1, "#0A140F");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const orangeGlow = ctx.createRadialGradient(270, 240, 0, 270, 240, 520);
    orangeGlow.addColorStop(0, "rgba(255,69,0,.38)");
    orangeGlow.addColorStop(1, "rgba(255,69,0,0)");
    ctx.fillStyle = orangeGlow;
    ctx.fillRect(0, 0, width, height);

    const limeGlow = ctx.createRadialGradient(900, 340, 0, 900, 340, 420);
    limeGlow.addColorStop(0, "rgba(212,255,63,.14)");
    limeGlow.addColorStop(1, "rgba(212,255,63,0)");
    ctx.fillStyle = limeGlow;
    ctx.fillRect(0, 0, width, height);

    drawPeopleBackground(ctx, project, elapsedMs);
  }

  ctx.strokeStyle = "rgba(255,255,255,.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#FF4500";
  ctx.font = "800 30px 'JetBrains Mono', monospace";
  ctx.letterSpacing = "4px";
  ctx.fillText(String(project.topic_label || "InmoRadar").toUpperCase(), 78, 278);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 112px Arial";
  let nextY = drawWrappedText(ctx, scene.headline || project.title, 76, 410, 760, 104, 5);

  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.font = "500 42px Arial";
  nextY = drawWrappedText(ctx, scene.body || project.caption, 80, nextY + 34, 760, 58, 4);

  ctx.fillStyle = "rgba(255,255,255,.09)";
  roundRect(ctx, 76, 1328, 928, 250, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.stroke();
  ctx.fillStyle = "#FF4500";
  ctx.font = "800 22px 'JetBrains Mono', monospace";
  ctx.fillText(`${String(sceneIndex + 1).padStart(2, "0")} / ${String(scene.role || "scene").toUpperCase()}`, 116, 1390);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 44px Arial";
  drawWrappedText(ctx, scene.on_screen_text || scene.headline || "", 116, 1460, 820, 52, 2);

  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundRect(ctx, 76, 1632, 928, 12, 8);
  ctx.fill();
  ctx.fillStyle = "#FF4500";
  roundRect(ctx, 76, 1632, 928 * progress, 12, 8);
  ctx.fill();

  drawVideoBranding(ctx, project, logoImage);
}

function musicNotesForStyle(style) {
  const maps = {
    warm_house: [196, 246.94, 293.66, 329.63, 293.66, 246.94, 220, 246.94],
    calm_pop: [174.61, 220, 261.63, 329.63, 261.63, 220],
    urban_soft: [146.83, 196, 233.08, 261.63, 233.08, 196],
    editorial_ambient: [130.81, 196, 261.63, 392]
  };
  return maps[style] || maps.warm_house;
}

async function createVideoMusicTrack(project, durationMs) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  const audioContext = new AudioContextCtor();
  await audioContext.resume();
  const destination = audioContext.createMediaStreamDestination();
  const master = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  master.gain.setValueAtTime(0.18, audioContext.currentTime);
  master.connect(compressor);
  compressor.connect(destination);

  const start = audioContext.currentTime + 0.08;
  const durationSeconds = durationMs / 1000;
  const style = String(project.music_style || "warm_house");
  const notes = musicNotesForStyle(style);
  const step = style === "editorial_ambient" ? 1.6 : 0.48;

  const pad = audioContext.createOscillator();
  const padGain = audioContext.createGain();
  pad.type = "sine";
  pad.frequency.setValueAtTime(notes[0] / 2, start);
  padGain.gain.setValueAtTime(0, start);
  padGain.gain.linearRampToValueAtTime(0.08, start + 0.8);
  padGain.gain.linearRampToValueAtTime(0.055, start + Math.max(1, durationSeconds - 1));
  padGain.gain.linearRampToValueAtTime(0, start + durationSeconds);
  pad.connect(padGain);
  padGain.connect(master);
  pad.start(start);
  pad.stop(start + durationSeconds + 0.1);

  for (let t = 0; t < durationSeconds; t += step) {
    const index = Math.floor(t / step) % notes.length;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = style === "urban_soft" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(notes[index], start + t);
    gain.gain.setValueAtTime(0, start + t);
    gain.gain.linearRampToValueAtTime(style === "editorial_ambient" ? 0.06 : 0.11, start + t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + t + Math.max(0.18, step * 0.86));
    osc.connect(gain);
    gain.connect(master);
    osc.start(start + t);
    osc.stop(start + t + step);

    if (style !== "editorial_ambient" && Math.floor(t / step) % 2 === 0) {
      const kick = audioContext.createOscillator();
      const kickGain = audioContext.createGain();
      kick.type = "sine";
      kick.frequency.setValueAtTime(86, start + t);
      kick.frequency.exponentialRampToValueAtTime(48, start + t + 0.12);
      kickGain.gain.setValueAtTime(0.13, start + t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, start + t + 0.18);
      kick.connect(kickGain);
      kickGain.connect(master);
      kick.start(start + t);
      kick.stop(start + t + 0.2);
    }
  }

  return {
    stream: destination.stream,
    close: async () => {
      await audioContext.close().catch(() => {});
    }
  };
}

function createBackgroundVideo(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const done = () => resolve(video);
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadeddata = done;
    video.onerror = () => reject(new Error("background_clip_load_failed"));
    video.src = url;
    video.load();
  });
}

async function exportVideoProject() {
  const project = state.video.lastProject;
  if (!project) return;
  if (!HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
    throw new Error("video_export_not_supported");
  }
  const mimeType = supportedVideoMimeType();
  if (!mimeType) throw new Error("video_mime_not_supported");

  const canvas = document.createElement("canvas");
  canvas.width = project.format?.width || 1080;
  canvas.height = project.format?.height || 1920;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(project.format?.fps || 30);
  const chunks = [];
  const extension = mimeType.includes("webm") ? "webm" : "mp4";
  let logoImage = null;
  let musicTrack = null;
  let backgroundVideo = null;

  try {
    logoImage = await loadImage("assets/inmoradar-brand-mark.svg");
  } catch (error) {
    logoImage = null;
  }

  const durationMs = Math.max(1000, (project.duration_seconds || 24) * 1000);
  try {
    backgroundVideo = await createBackgroundVideo(state.video.backgroundClipUrl);
    if (backgroundVideo) {
      backgroundVideo.currentTime = 0;
      await backgroundVideo.play().catch(() => {});
    }
  } catch (error) {
    backgroundVideo = null;
    showStatus("No pude cargar el clip real; exporto maqueta local.", "neutral");
  }

  try {
    musicTrack = await createVideoMusicTrack(project, durationMs);
    musicTrack?.stream?.getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch (error) {
    musicTrack = null;
  }

  const recorder = new MediaRecorder(stream, { mimeType });

  const finished = new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => resolve();
  });

  setVideoBusy(true, "Exportando video con personas de fondo, musica y marca fija.");
  showStatus(`Exportando video ${extension.toUpperCase()} con musica audible... manten esta pestana abierta.`);
  const start = performance.now();

  recorder.start(500);
  await new Promise((resolve) => {
    function frame(now) {
      const elapsed = Math.min(durationMs, now - start);
      drawVideoFrame(ctx, project, elapsed, logoImage, backgroundVideo);
      if (elapsed < durationMs) {
        requestAnimationFrame(frame);
      } else {
        recorder.stop();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
  await finished;
  stream.getTracks().forEach((track) => track.stop());
  if (musicTrack) await musicTrack.close();
  if (backgroundVideo) {
    backgroundVideo.pause();
    backgroundVideo.removeAttribute("src");
    backgroundVideo.load();
  }

  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.id || "inmoradar-video"}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setVideoBusy(false);
  showStatus(
    `Video exportado en ${extension.toUpperCase()} ${state.video.backgroundClipName ? "con clip real de fondo" : "como maqueta local"} y musica.`,
    "good"
  );
}

async function runVideoGeneration(form) {
  const payload = videoFormPayload(form);
  syncVideoBackgroundClip(form);
  setVideoBusy(true, "Generando guion, storyboard y preview con marca fija.");
  showStatus("Generando storyboard de video IA...");
  try {
    const project = await api("/api/admin?resource=social-video/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderVideoProject(project);
    showStatus(`Video IA preparado: ${project.title}`, "good");
  } finally {
    setVideoBusy(false);
  }
}

async function copyVideoPrompt() {
  const project = state.video.lastProject;
  if (!project) return;
  const text = project.real_ai_video?.master_prompt || project.global_ai_prompt || "";
  try {
    await navigator.clipboard.writeText(text);
    showStatus("Prompt IA real copiado.", "good");
  } catch (error) {
    downloadText(`${project.id || "inmoradar-video"}-prompt.txt`, "text/plain;charset=utf-8", text);
    showStatus("No pude copiar al portapapeles; he descargado el prompt.", "neutral");
  }
}

function downloadVideoAiPack() {
  const project = state.video.lastProject;
  if (!project) return;
  downloadText(`${project.id || "inmoradar-video"}-pack-ia-real.txt`, "text/plain;charset=utf-8", realVideoPackText(project));
}

function downloadVideoJson() {
  const project = state.video.lastProject;
  if (!project) return;
  downloadText(`${project.id || "inmoradar-video"}-storyboard.json`, "application/json;charset=utf-8", JSON.stringify(project, null, 2));
}

function downloadVideoHtml() {
  const project = state.video.lastProject;
  if (!project) return;
  downloadText(`${project.id || "inmoradar-video"}-preview.html`, "text/html;charset=utf-8", buildVideoPreviewHtml(project));
}

async function loadSummary() {
  const summary = await api("/api/admin?resource=summary");
  renderStats(summary);
  renderRevenue(summary.revenue);
}

async function loadPremium() {
  const params = new URLSearchParams({
    limit: "100",
    status: state.premium.status || "all"
  });
  if (state.premium.q) params.set("q", state.premium.q);
  if (state.premium.provider) params.set("provider", state.premium.provider);
  if (state.premium.eventName) params.set("event_name", state.premium.eventName);
  const payload = await api(`/api/admin?resource=premium/subscriptions&${params.toString()}`);
  renderPremium(payload.subscriptions || []);
}

async function loadExtensionUsage() {
  if (!els.extensionStats) return;
  const payload = await api("/api/admin?resource=extension/usage");
  renderExtensionUsage(payload);
}

async function loadSeo() {
  const params = new URLSearchParams({
    limit: String(state.seo.pageSize || 10),
    page: String(state.seo.page || 1),
    status: state.seo.status || "all"
  });
  const payload = await api(`/api/admin?resource=seo/landings&${params.toString()}`);
  renderSeo(payload);
}

async function loadKpis() {
  const payload = await api("/api/admin?resource=kpis/settings");
  renderKpis(payload);
}

async function loadParking() {
  const payload = await api("/api/admin?resource=parking/summary");
  renderParkingStats(payload);
  renderParkingRows(payload.recent || []);
}

async function loadReleaseArtifacts(target) {
  const payload = await api(`/api/admin?resource=operations/releases&target=${encodeURIComponent(target)}`);
  renderReleaseRows(target, payload);
}

async function loadReleaseHubs() {
  if (!els.releaseRows.length) return;
  await Promise.all(RELEASE_TARGETS.map((target) => loadReleaseArtifacts(target)));
}

async function loadRunwayConfig() {
  if (!els.videoRunwayPanel) return;
  try {
    const payload = await api("/api/admin?resource=social-video/runway-config");
    state.video.runwayConfig = payload;
    if (payload.default_model && els.videoRunwayModel) els.videoRunwayModel.value = payload.default_model;
    if (payload.default_duration_seconds && els.videoRunwayDuration) {
      els.videoRunwayDuration.value = String(payload.default_duration_seconds);
    }
    setRunwayStatus(
      payload.enabled
        ? `Runway activo. Limite/render $${Number(payload.max_cost_usd || 0).toFixed(2)} y presupuesto diario $${Number(payload.daily_budget_usd || 0).toFixed(2)}.`
        : "Runway esta en modo estimacion. Para render real activa RUNWAY_RENDER_ENABLED=true y configura la API key.",
      payload.enabled ? "good" : "neutral"
    );
  } catch (error) {
    setRunwayStatus("No pude leer la configuracion de Runway. La estimacion se activara al generar storyboard.", "neutral");
  }
  setRunwayActions();
}

async function loadAll() {
  if (!state.token) return;
  showStatus("Cargando backoffice...");
  try {
    await Promise.all([
      loadSummary(),
      loadPremium(),
      loadExtensionUsage(),
      loadSeo(),
      loadKpis(),
      loadParking(),
      loadReleaseHubs(),
      loadRunwayConfig()
    ]);
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

async function runParkingProbe(form) {
  const data = new FormData(form);
  const params = new URLSearchParams({
    street: String(data.get("street") || ""),
    street_number: String(data.get("street_number") || ""),
    zone: String(data.get("zone") || ""),
    district: String(data.get("district") || ""),
    municipality: String(data.get("municipality") || ""),
    garage_included: String(data.get("garage_included") || ""),
    profile: String(data.get("profile") || "general"),
    source_url: String(data.get("source_url") || "")
  });

  showStatus("Calculando Parking Intelligence...");
  const response = await fetch(`/api/parking-assessment?${params.toString()}`, {
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || payload.error || "parking_probe_failed");
  }
  state.parking.lastProbe = payload;
  if (els.parkingResult) {
    els.parkingResult.textContent = JSON.stringify(
      {
        score: payload.parking_assessment?.overall_score,
        label: payload.parking_assessment?.overall_label,
        confidence_score: payload.parking_assessment?.confidence_score,
        confidence_label: payload.parking_assessment?.confidence_label,
        garage: payload.garage,
        street_parking: payload.street_parking,
        resident_parking: payload.resident_parking,
        paid_parking: payload.paid_parking,
        transport_offset: payload.transport_offset,
        recommendations: payload.recommendations,
        sources: payload.sources,
        disclaimer: payload.disclaimer
      },
      null,
      2
    );
  }
  await loadParking();
  showStatus(`Parking ${payload.parking_assessment?.overall_score}/10 - ${payload.parking_assessment?.overall_label}`, "good");
}

function collectKpiValues() {
  const values = {};
  els.kpiForm.querySelectorAll("[data-kpi-path]").forEach((field) => {
    const path = field.dataset.kpiPath;
    const type = field.dataset.kpiType;
    let value = field.value;
    if (type === "boolean") value = value === "true";
    if (type === "number") value = Number(value);
    setPath(values, path, value);
  });
  return values;
}

async function saveKpis(settings) {
  showStatus("Guardando reglas KPI...");
  const payload = await api("/api/admin?resource=kpis/settings", {
    method: "POST",
    body: JSON.stringify({ settings })
  });
  renderKpis(payload);
  showStatus("KPIs guardados.", "good");
}

async function runSeoGeneration(mode) {
  const payload =
    mode === "publish"
      ? {
          mode: "publish",
          limit: 1,
          candidateLimit: 25,
          template_type: "random",
          autoPublish: true,
          includeExistingDrafts: true,
          publishFirstEligible: true
        }
      : {
          mode: "generate",
          limit: 1,
          template_type: "random",
          autoPublish: false
        };

  showStatus(mode === "publish" ? "Buscando SEO elegible para publicar..." : "Generando draft SEO...");
  const result = await api("/api/admin?resource=seo/generate-landings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadAll();
  if (!result.generated_count) {
    showStatus("No hay oportunidades SEO pendientes para generar.", "neutral");
    return;
  }
  const first = result.results?.[0];
  if (mode === "publish") {
    showStatus(
      result.published_count
        ? `Publicado y añadido a Noticias: ${first?.slug || "landing SEO"}`
        : `Generado, pero sin publicar: score ${first?.quality_score || 0}`,
      result.published_count ? "good" : "neutral"
    );
    return;
  }
  showStatus(`Draft SEO generado: ${first?.slug || "landing SEO"} · score ${first?.quality_score || 0}`, "good");
}

async function runSeoRowAction(action, slug) {
  showStatus(`${action} · ${slug}`);
  await api("/api/admin?resource=seo/landings", {
    method: "POST",
    body: JSON.stringify({ action, slug })
  });
  await loadAll();
  if (action === "publish") {
    showStatus(`Publicado y añadido a Noticias: ${slug}`, "good");
  }
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

els.sectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAdminSection(button.dataset.adminSectionButton, { resetSubsection: true });
  });
});

els.subsectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAdminSubsection(button.dataset.adminSubsectionGroup, button.dataset.adminSubsectionButton);
  });
});

els.premiumFilter.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.premiumFilter);
  state.premium.q = String(form.get("q") || "").trim();
  state.premium.status = String(form.get("status") || "all");
  state.premium.provider = String(form.get("provider") || "").trim();
  state.premium.eventName = String(form.get("event_name") || "").trim();
  await loadPremium();
});

els.seoFilter.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.seoFilter);
  state.seo.status = String(form.get("status") || "all");
  state.seo.page = 1;
  await loadSeo();
});

els.seoGenerate.addEventListener("click", () => runSeoGeneration("generate").catch((error) => showStatus(error.message, "bad")));
els.seoPublish.addEventListener("click", () => runSeoGeneration("publish").catch((error) => showStatus(error.message, "bad")));

els.kpiForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveKpis(collectKpiValues()).catch((error) => showStatus(error.message, "bad"));
});

els.kpiReset.addEventListener("click", () => {
  if (!window.confirm("Restaurar los valores recomendados de KPIs?")) return;
  saveKpis(state.kpis.defaults).catch((error) => showStatus(error.message, "bad"));
});

if (els.parkingRefresh) {
  els.parkingRefresh.addEventListener("click", () => loadParking().catch((error) => showStatus(error.message, "bad")));
}

if (els.parkingProbeForm) {
  els.parkingProbeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runParkingProbe(els.parkingProbeForm).catch((error) => showStatus(error.message, "bad"));
  });
}

els.releaseForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveReleaseArtifact(form).catch((error) => showStatus(error.message, "bad"));
  });
});

els.releaseRefreshButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.releaseRefresh;
    loadReleaseArtifacts(target).catch((error) => showStatus(error.message, "bad"));
  });
});

els.releaseRows.forEach((rowsEl) => {
  rowsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-release-chrome-action]");
    if (!button) return;
    runChromeReleaseAction(button.dataset.releaseChromeAction, button.dataset.releaseId, button).catch((error) =>
      showStatus(error.message, "bad")
    );
  });
});

if (els.videoForm) {
  els.videoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runVideoGeneration(els.videoForm).catch((error) => showStatus(error.message, "bad"));
  });
  els.videoForm.querySelector('[name="background_clip"]')?.addEventListener("change", () => {
    syncVideoBackgroundClip(els.videoForm);
    renderVideoPreview();
    renderVideoStoryboard();
    if (state.video.backgroundClipName) {
      showStatus(`Clip real cargado: ${state.video.backgroundClipName}`, "good");
    }
  });
}

if (els.videoStoryboard) {
  els.videoStoryboard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-video-scene]");
    if (!button) return;
    state.video.selectedSceneIndex = Number(button.dataset.videoScene || 0);
    renderVideoPreview();
    renderVideoStoryboard();
  });
}

if (els.videoCopyPrompt) {
  els.videoCopyPrompt.addEventListener("click", () => copyVideoPrompt().catch((error) => showStatus(error.message, "bad")));
}

if (els.videoDownloadAiPack) {
  els.videoDownloadAiPack.addEventListener("click", downloadVideoAiPack);
}

if (els.videoDownloadJson) {
  els.videoDownloadJson.addEventListener("click", downloadVideoJson);
}

if (els.videoDownloadHtml) {
  els.videoDownloadHtml.addEventListener("click", downloadVideoHtml);
}

if (els.videoExport) {
  els.videoExport.addEventListener("click", () =>
    exportVideoProject().catch((error) => {
      setVideoBusy(false);
      showStatus(error.message, "bad");
    })
  );
}

if (els.videoRunwayEstimate) {
  els.videoRunwayEstimate.addEventListener("click", () => estimateRunwayRender().catch((error) => setRunwayStatus(error.message, "bad")));
}

if (els.videoRunwayRender) {
  els.videoRunwayRender.addEventListener("click", () => startRunwayRender().catch((error) => {
    setVideoBusy(false);
    setRunwayStatus(error.message, "bad");
  }));
}

if (els.videoRunwayPoll) {
  els.videoRunwayPoll.addEventListener("click", () => pollRunwayRender().catch((error) => setRunwayStatus(error.message, "bad")));
}

if (els.videoRunwayImport) {
  els.videoRunwayImport.addEventListener("click", () => importRunwayClip().catch((error) => {
    setVideoBusy(false);
    setRunwayStatus(error.message, "bad");
  }));
}

if (els.videoRunwayModel) {
  els.videoRunwayModel.addEventListener("change", () => {
    state.video.runwayEstimate = null;
    setRunwayStatus("Modelo cambiado. Vuelve a estimar el coste.", "neutral");
    setRunwayActions();
  });
}

if (els.videoRunwayDuration) {
  els.videoRunwayDuration.addEventListener("change", () => {
    state.video.runwayEstimate = null;
    setRunwayStatus("Duracion cambiada. Vuelve a estimar el coste.", "neutral");
    setRunwayActions();
  });
}

els.seoRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-seo-action]");
  if (!button) return;
  const action = button.dataset.seoAction;
  const slug = button.dataset.slug;
  runSeoRowAction(action, slug).catch((error) => showStatus(error.message, "bad"));
});

if (els.seoPagination) {
  els.seoPagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-seo-page]");
    if (!button || button.disabled) return;
    const direction = button.dataset.seoPage;
    if (direction === "previous") state.seo.page = Math.max(1, state.seo.page - 1);
    if (direction === "next") state.seo.page += 1;
    loadSeo().catch((error) => showStatus(error.message, "bad"));
  });
}

requireLogin();
setAdminSection(state.activeSection);
try {
  const storedProject = JSON.parse(sessionStorage.getItem(VIDEO_PROJECT_KEY) || "null");
  if (storedProject) renderVideoProject(storedProject);
} catch (error) {
  sessionStorage.removeItem(VIDEO_PROJECT_KEY);
}
loadAll();
