const { hasSupabaseConfig, json, supabaseFetch } = require("../_utils");
const {
  decryptToken,
  defaultSettings,
  encryptToken,
  failLinkedInPostState,
  generateLinkedInPost,
  hasPostForDay,
  nextScheduledAt,
  normalizeHashtags,
  normalizeOrganizationUrn,
  normalizeSettings,
  publishPost,
  refreshAccessToken,
  validatePublishInput
} = require("../../lib/linkedin/services");

function tokenFromRequest(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return String(req.headers["x-cron-secret"] || req.headers["x-admin-token"] || "").trim();
}

function assertCron(req, res) {
  const expected = process.env.CRON_SECRET || process.env.ADMIN_IMPORT_TOKEN;
  if (!expected) {
    json(res, 500, { ok: false, error: "cron_secret_not_configured" });
    return false;
  }
  if (tokenFromRequest(req) !== expected) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

async function readSettings() {
  try {
    const rows = await supabaseFetch("marketing_linkedin_settings?select=*&order=created_at.asc&limit=1");
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return normalizeSettings(row || defaultSettings());
  } catch (error) {
    return defaultSettings();
  }
}

async function readConnection() {
  try {
    const rows = await supabaseFetch("marketing_linkedin_connections?provider=eq.linkedin&select=*&limit=1");
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    return null;
  }
}

async function saveConnection(patch = {}) {
  const rows = await supabaseFetch("marketing_linkedin_connections?on_conflict=provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([
      {
        provider: "linkedin",
        ...patch,
        organization_urn: normalizeOrganizationUrn(patch.organization_urn || process.env.LINKEDIN_ORGANIZATION_URN),
        updated_at: new Date().toISOString()
      }
    ])
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function recentPosts() {
  try {
    const rows = await supabaseFetch("marketing_linkedin_posts?select=id,status,created_at,scheduled_at,published_at,manually_published_at&order=created_at.desc&limit=100");
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

async function scheduledDuePosts() {
  try {
    const now = encodeURIComponent(new Date().toISOString());
    const rows = await supabaseFetch(`marketing_linkedin_posts?select=*&status=eq.scheduled&scheduled_at=lte.${now}&order=scheduled_at.asc&limit=5`);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

async function insertPost(post) {
  const rows = await supabaseFetch("marketing_linkedin_posts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        title: post.title,
        hook: post.hook,
        body: post.body,
        cta: post.cta,
        hashtags: normalizeHashtags(post.hashtags),
        image_url: post.image_url,
        image_path: post.image_path,
        source_type: "auto",
        source_reference: post.source_reference || "daily",
        scheduled_at: post.scheduled_at,
        status: post.status,
        approval_required: post.approval_required
      }
    ])
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function patchPost(id, patch = {}) {
  const rows = await supabaseFetch(`marketing_linkedin_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function loadAccessToken(connection) {
  const accessToken = decryptToken(connection?.access_token_encrypted || "");
  if (!accessToken) throw new Error("linkedin_access_token_missing");
  const expiresAt = connection?.token_expires_at ? new Date(connection.token_expires_at).getTime() : null;
  if (!expiresAt || expiresAt > Date.now() + 120000) return { accessToken, connection };

  const refreshToken = decryptToken(connection?.refresh_token_encrypted || "");
  if (!refreshToken) throw new Error("linkedin_token_expired");
  const refreshed = await refreshAccessToken({ refreshToken });
  const updated = await saveConnection({
    status: "connected",
    access_token_encrypted: encryptToken(refreshed.access_token),
    refresh_token_encrypted: refreshed.refresh_token ? encryptToken(refreshed.refresh_token) : connection.refresh_token_encrypted,
    token_expires_at: refreshed.token_expires_at,
    refresh_token_expires_at: refreshed.refresh_token_expires_at || connection.refresh_token_expires_at,
    scopes: refreshed.scopes?.length ? refreshed.scopes : connection.scopes,
    last_error: null
  });
  return { accessToken: refreshed.access_token, connection: updated };
}

async function publishLinkedInPost(post, connection, settings) {
  try {
    validatePublishInput({ post, connection, settings });
    const { accessToken, connection: freshConnection } = await loadAccessToken(connection);
    const ownerUrn = normalizeOrganizationUrn(freshConnection.organization_urn || process.env.LINKEDIN_ORGANIZATION_URN);
    await patchPost(post.id, { status: "publishing", error_message: null });
    const result = await publishPost({ accessToken, post, ownerUrn });
    return await patchPost(post.id, {
      status: "published",
      published_at: new Date().toISOString(),
      linkedin_image_urn: result.linkedin_image_urn,
      linkedin_post_urn: result.linkedin_post_urn,
      linkedin_response: result.linkedin_response,
      error_message: null
    });
  } catch (error) {
    const message = String(error.message || "linkedin_publish_failed").slice(0, 800);
    if (/permission|scope|forbidden|organization|access/i.test(message)) {
      await saveConnection({ status: "error", mode: "manual", last_error: message });
    }
    const failed = failLinkedInPostState({}, message);
    return await patchPost(post.id, { status: failed.status, error_message: failed.error_message });
  }
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return json(res, 405, { ok: false, error: "method_not_allowed" });
  if (!assertCron(req, res)) return;
  if (!hasSupabaseConfig()) return json(res, 500, { ok: false, error: "supabase_not_configured" });

  try {
    const settings = await readSettings();
    const result = {
      ok: true,
      skipped: false,
      created_post: null,
      publish_results: []
    };

    if (settings.daily_generation_enabled) {
      const posts = await recentPosts();
      if (!hasPostForDay(posts, new Date())) {
        const post = generateLinkedInPost({ source_type: "auto", source_reference: "daily", scheduled_at: nextScheduledAt(settings) }, settings);
        result.created_post = await insertPost(post);
      } else {
        result.skipped = true;
        result.reason = "post_already_exists_today";
      }
    } else {
      result.skipped = true;
      result.reason = "daily_generation_disabled";
    }

    if (settings.auto_publish_enabled === true && process.env.LINKEDIN_AUTO_PUBLISH_ENABLED === "true") {
      const [connection, duePosts] = await Promise.all([readConnection(), scheduledDuePosts()]);
      for (const post of duePosts) {
        result.publish_results.push(await publishLinkedInPost(post, connection, settings));
      }
    }

    result.mode = settings.auto_publish_enabled && !settings.approval_required ? "automatic_ready" : "manual_or_review";
    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, { ok: false, error: "linkedin_daily_failed", message: String(error.message || error).slice(0, 500) });
  }
};