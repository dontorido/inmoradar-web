const RELEASE_TARGETS = ["web", "extension", "backoffice"];
const RELEASE_CHANNELS = ["draft", "staging", "production", "beta", "stable"];
const RELEASE_STATUSES = ["draft", "ready", "submitted", "published", "failed", "archived"];
const RELEASE_ARTIFACT_KINDS = ["bundle", "manifest", "release_notes", "config", "build_log"];

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function oneOf(value, allowed, fallback) {
  const normalized = cleanText(value, 40).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeSha(value) {
  const sha = cleanText(value, 80).toLowerCase();
  return /^[a-f0-9]{64}$/.test(sha) ? sha : null;
}

function normalizeReleaseTarget(value, fallback = "web") {
  return oneOf(value, RELEASE_TARGETS, fallback);
}

function normalizeReleaseArtifactInput(input = {}) {
  const target = normalizeReleaseTarget(input.target);
  const version = cleanText(input.version, 80);
  const title = cleanText(input.title, 160);

  if (!version) throw new Error("release_version_required");
  if (!title) throw new Error("release_title_required");

  const fileSize = Number(input.file_size_bytes || 0);
  const artifactPayload = input.artifact_payload && typeof input.artifact_payload === "object"
    ? input.artifact_payload
    : null;

  return {
    target,
    version,
    title,
    channel: oneOf(input.channel, RELEASE_CHANNELS, "draft"),
    status: oneOf(input.status, RELEASE_STATUSES, "draft"),
    artifact_kind: oneOf(input.artifact_kind, RELEASE_ARTIFACT_KINDS, "bundle"),
    connector_target: cleanText(input.connector_target, 80) || null,
    file_name: cleanText(input.file_name, 240) || null,
    mime_type: cleanText(input.mime_type, 120) || null,
    file_size_bytes: Number.isFinite(fileSize) && fileSize > 0 ? Math.round(fileSize) : null,
    sha256: normalizeSha(input.sha256),
    storage_path: cleanText(input.storage_path, 500) || null,
    artifact_payload: artifactPayload,
    notes: cleanText(input.notes, 4000) || null,
    created_by: "backoffice"
  };
}

function configured(value) {
  return Boolean(String(value || "").trim());
}

function releaseConnectors(env = process.env) {
  return {
    web: [
      {
        id: "vercel",
        label: "Vercel",
        configured: configured(env.VERCEL_TOKEN) && (configured(env.VERCEL_PROJECT_ID) || configured(env.VERCEL_PROJECT_NAME)),
        purpose: "Crear despliegues web desde paquetes aprobados en backoffice."
      },
      {
        id: "github",
        label: "GitHub",
        configured: configured(env.GITHUB_TOKEN) && configured(env.GITHUB_REPOSITORY),
        purpose: "Sincronizar commits, etiquetas o releases cuando haga falta repositorio."
      }
    ],
    extension: [
      {
        id: "chrome",
        label: "Chrome Web Store",
        configured:
          configured(env.CHROME_WEBSTORE_PUBLISHER_ID) &&
          configured(env.CHROME_WEBSTORE_ITEM_ID) &&
          (configured(env.CHROME_WEBSTORE_ACCESS_TOKEN) ||
            (configured(env.CHROME_WEBSTORE_CLIENT_ID) &&
              configured(env.CHROME_WEBSTORE_CLIENT_SECRET) &&
              configured(env.CHROME_WEBSTORE_REFRESH_TOKEN))),
        purpose: "Subir ZIP, consultar estado y enviar a revisión/publicación mediante API oficial."
      },
      {
        id: "edge",
        label: "Microsoft Edge Add-ons",
        configured:
          configured(env.EDGE_ADDONS_PRODUCT_ID) &&
          (configured(env.EDGE_ADDONS_API_KEY) || configured(env.EDGE_ADDONS_ACCESS_TOKEN)),
        purpose: "Actualizar el draft del add-on y publicarlo mediante API oficial."
      },
      {
        id: "firefox",
        label: "Firefox AMO",
        configured:
          configured(env.FIREFOX_AMO_ADDON_GUID) &&
          configured(env.FIREFOX_AMO_JWT_ISSUER) &&
          configured(env.FIREFOX_AMO_JWT_SECRET),
        purpose: "Subir XPI/listed o unlisted a addons.mozilla.org."
      }
    ],
    backoffice: [
      {
        id: "vercel",
        label: "Vercel Backoffice",
        configured: configured(env.VERCEL_TOKEN) && (configured(env.VERCEL_PROJECT_ID) || configured(env.VERCEL_PROJECT_NAME)),
        purpose: "Publicar cambios del propio panel administrativo."
      },
      {
        id: "supabase",
        label: "Supabase",
        configured: configured(env.SUPABASE_URL) && configured(env.SUPABASE_SERVICE_ROLE_KEY),
        purpose: "Guardar artefactos, manifiestos, auditoria y configuracion operativa."
      }
    ]
  };
}

module.exports = {
  RELEASE_ARTIFACT_KINDS,
  RELEASE_CHANNELS,
  RELEASE_STATUSES,
  RELEASE_TARGETS,
  normalizeReleaseArtifactInput,
  normalizeReleaseTarget,
  releaseConnectors
};
