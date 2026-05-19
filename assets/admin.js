const TOKEN_KEY = "inmoradar_admin_token";
const VIDEO_PROJECT_KEY = "inmoradar_social_video_project";

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  activeSection: "marketing",
  premium: {
    q: "",
    status: "all"
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
  kpis: {
    schema: [],
    settings: {},
    defaults: {}
  },
  video: {
    lastProject: null,
    selectedSceneIndex: 0,
    busy: false
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
  refresh: document.querySelector("[data-admin-refresh]"),
  env: document.querySelector("[data-admin-env]"),
  stats: document.querySelector("[data-admin-stats]"),
  premiumRows: document.querySelector("[data-premium-rows]"),
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
  videoForm: document.querySelector("[data-video-form]"),
  videoPreview: document.querySelector("[data-video-preview]"),
  videoPreviewTopic: document.querySelector("[data-video-preview-topic]"),
  videoPreviewHeadline: document.querySelector("[data-video-preview-headline]"),
  videoPreviewBody: document.querySelector("[data-video-preview-body]"),
  videoPreviewTitle: document.querySelector("[data-video-preview-title]"),
  videoPreviewMeta: document.querySelector("[data-video-preview-meta]"),
  videoStoryboard: document.querySelector("[data-video-storyboard]"),
  videoCopyPrompt: document.querySelector("[data-video-copy-prompt]"),
  videoDownloadJson: document.querySelector("[data-video-download-json]"),
  videoDownloadHtml: document.querySelector("[data-video-download-html]"),
  videoExport: document.querySelector("[data-video-export]"),
  videoBusy: document.querySelector("[data-video-busy]"),
  videoBusyMessage: document.querySelector("[data-video-busy-message]")
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

function setAdminSection(section) {
  state.activeSection = ["marketing", "kpis", "parking", "videos"].includes(section) ? section : "marketing";
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
  if (["cancelled", "expired", "noindex"].includes(normalized)) return "bad";
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
  const seo = summary.seo || {};
  els.env.textContent = summary.env?.lemonsqueezy_test_mode ? "Test mode" : "Live mode";
  els.env.dataset.mode = summary.env?.lemonsqueezy_test_mode ? "test" : "live";
  els.stats.innerHTML = [
    stat("Premium total", premium.total || 0, { id: "premium-total" }),
    stat("Premium active", (premium.by_status?.active || 0) + (premium.by_status?.on_trial || 0), {
      id: "premium-active",
      hint: "Cuentas con suscripcion activa esta semana"
    }),
    stat("SEO publicadas", seo.published || 0, { id: "seo-publicadas" }),
    stat("SEO ready", seo.ready_to_publish || 0, { id: "seo-ready", trend: 100 })
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

function renderSeo(payload) {
  const rows = payload.landings || [];
  state.seo.page = Number(payload.page || state.seo.page || 1);
  state.seo.pageSize = Number(payload.page_size || state.seo.pageSize || 10);
  state.seo.hasNextPage = Boolean(payload.has_next_page);
  state.seo.hasPreviousPage = Boolean(payload.has_previous_page);

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
                return `
                  <label class="admin-kpi-field">
                    <span>
                      ${escapeHtml(field.label)}
                      ${field.suffix ? `<em>${escapeHtml(field.suffix)}</em>` : ""}
                    </span>
                    ${renderKpiControl(field, value)}
                    <small>${escapeHtml(field.description || "")}</small>
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
  [els.videoCopyPrompt, els.videoDownloadJson, els.videoDownloadHtml, els.videoExport].forEach((button) => {
    if (button) button.disabled = !enabled || state.video.busy;
  });
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

function renderVideoProject(project) {
  state.video.lastProject = project;
  state.video.selectedSceneIndex = Math.min(state.video.selectedSceneIndex || 0, Math.max((project.scenes || []).length - 1, 0));
  sessionStorage.setItem(VIDEO_PROJECT_KEY, JSON.stringify(project));
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
    els.videoPreviewMeta.textContent = `${project.duration_seconds || 24}s - ${project.format?.width || 1080}x${project.format?.height || 1920} - ${project.visual_style_label || "hogar"} - ${project.music_label || "musica"}`;
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

function drawVideoFrame(ctx, project, elapsedMs, logoImage) {
  const width = project.format?.width || 1080;
  const height = project.format?.height || 1920;
  const scenes = project.scenes || [];
  const scene =
    scenes.find((item) => elapsedMs >= Number(item.start_ms || 0) && elapsedMs < Number(item.end_ms || 0)) ||
    scenes[scenes.length - 1] ||
    {};
  const sceneIndex = Math.max(0, scenes.indexOf(scene));
  const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, (project.duration_seconds || 24) * 1000)));

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

  try {
    logoImage = await loadImage("assets/inmoradar-brand-mark.svg");
  } catch (error) {
    logoImage = null;
  }

  const durationMs = Math.max(1000, (project.duration_seconds || 24) * 1000);
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
      drawVideoFrame(ctx, project, elapsed, logoImage);
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
  showStatus(`Video exportado en ${extension.toUpperCase()} con personas de fondo, musica y branding obligatorio.`, "good");
}

async function runVideoGeneration(form) {
  const payload = videoFormPayload(form);
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
  const text = project.global_ai_prompt || "";
  try {
    await navigator.clipboard.writeText(text);
    showStatus("Prompt IA copiado.", "good");
  } catch (error) {
    downloadText(`${project.id || "inmoradar-video"}-prompt.txt`, "text/plain;charset=utf-8", text);
    showStatus("No pude copiar al portapapeles; he descargado el prompt.", "neutral");
  }
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

async function loadAll() {
  if (!state.token) return;
  showStatus("Cargando backoffice...");
  try {
    await Promise.all([loadSummary(), loadPremium(), loadSeo(), loadKpis(), loadParking()]);
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
    setAdminSection(button.dataset.adminSectionButton);
  });
});

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

if (els.videoForm) {
  els.videoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runVideoGeneration(els.videoForm).catch((error) => showStatus(error.message, "bad"));
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
