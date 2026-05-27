const { cleanText, metaConfig, sanitizeSecretText } = require("./settings");
const { isPublicImageUrl } = require("./images");

class MetaApiError extends Error {
  constructor(message, status, payload = {}, endpoint = "") {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.payload = payload;
    this.endpoint = endpoint;
  }
}

class MetaPublishError extends Error {
  constructor(message, diagnostic = {}) {
    super(message);
    this.name = "MetaPublishError";
    this.stage = diagnostic.stage || null;
    this.status = diagnostic.status || null;
    this.payload = diagnostic.response_body || null;
    this.meta_response = diagnostic;
  }
}

function sanitizeMetaPayload(payload = {}) {
  if (typeof payload === "string") return sanitizeSecretText(payload);
  if (!payload || typeof payload !== "object") return payload;
  const copy = Array.isArray(payload) ? [] : {};
  for (const [key, value] of Object.entries(payload)) {
    if (/token|secret|authorization/i.test(key)) continue;
    copy[key] = value && typeof value === "object"
      ? sanitizeMetaPayload(value)
      : typeof value === "string"
        ? sanitizeSecretText(value)
        : value;
  }
  return copy;
}

function graphRequestEndpoint(path, { env = process.env, graph = "facebook" } = {}) {
  const config = metaConfig(env);
  const baseUrl = graph === "instagram" ? config.instagramGraphUrl : config.graphUrl;
  const version = graph === "instagram" ? config.instagramGraphVersion : config.graphVersion;
  return `${baseUrl}/${version}/${String(path).replace(/^\/+/, "")}`;
}

async function graphRequest(path, { method = "GET", accessToken = "", body = null, env = process.env, fetchImpl = fetch, graph = "facebook" } = {}) {
  const url = new URL(graphRequestEndpoint(path, { env, graph }));
  const options = { method };
  if (method === "GET") {
    if (body && typeof body === "object") {
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
      });
    }
    if (accessToken) url.searchParams.set("access_token", accessToken);
  } else {
    const params = new URLSearchParams();
    if (body && typeof body === "object") {
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      });
    }
    if (accessToken) params.set("access_token", accessToken);
    options.headers = { "content-type": "application/x-www-form-urlencoded" };
    options.body = params.toString();
  }
  const response = await fetchImpl(url.href, options);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    payload = { raw_response: sanitizeSecretText(text || "") };
  }
  if (!response.ok || payload.error) {
    const message = sanitizeSecretText(payload?.error?.message || payload?.message || `meta_graph_request_failed_${response.status}`);
    const endpoint = new URL(url.href);
    endpoint.searchParams.delete("access_token");
    throw new MetaApiError(message, response.status, sanitizeMetaPayload(payload), endpoint.href);
  }
  return sanitizeMetaPayload(payload);
}

function facebookPostUrl(id) {
  const clean = cleanText(id, 200);
  return clean ? `https://www.facebook.com/${clean}` : null;
}

async function publishFacebookPost({ accessToken, pageId, caption, link, imageUrl = "", env = process.env, fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error("meta_access_token_missing");
  if (!pageId) throw new Error("meta_facebook_page_id_missing");
  if (!caption) throw new Error("meta_caption_missing");
  if (!link) throw new Error("meta_link_missing");
  const payload = await graphRequest(`${pageId}/feed`, {
    method: "POST",
    accessToken,
    env,
    fetchImpl,
    body: {
      message: caption,
      link,
      ...(isPublicImageUrl(imageUrl) ? { picture: imageUrl } : {})
    }
  });
  return {
    external_post_id: payload.id || null,
    published_url: payload.permalink_url || facebookPostUrl(payload.id),
    meta_response: {
      id: payload.id || null,
      published_url: payload.permalink_url || facebookPostUrl(payload.id)
    }
  };
}

function isPublicInstagramMediaUrl(value) {
  if (!isPublicImageUrl(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (/\.vercel\.app$/i.test(url.hostname)) return false;
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchInstagramLoginProfile({ accessToken, env = process.env, fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error("meta_instagram_access_token_missing");
  const profile = await graphRequest("me", {
    method: "GET",
    accessToken,
    env,
    fetchImpl,
    graph: "instagram",
    body: { fields: "id,username,account_type,user_id" }
  });
  return {
    id: cleanText(profile.id, 120),
    user_id: cleanText(profile.user_id, 120),
    username: cleanText(profile.username, 120),
    account_type: cleanText(profile.account_type, 80)
  };
}

function instagramPublishDiagnostic({ stage, endpoint, idUsed, mediaUrl, status = null, responseBody = null, profile = null } = {}) {
  return sanitizeMetaPayload({
    stage,
    endpoint,
    id_used: idUsed || null,
    media_url: mediaUrl || null,
    status,
    response_body: responseBody || null,
    instagram_profile: profile || null
  });
}

function logInstagramPublishDiagnostic(diagnostic) {
  console.warn(`[Meta Instagram Publish] ${JSON.stringify(diagnostic)}`);
}

function instagramPublishError(stage, error, context = {}) {
  const status = error?.status || null;
  const prefix = status ? `meta_instagram_publish_failed_${status}` : "meta_instagram_publish_failed";
  const message = sanitizeSecretText(error?.message || prefix);
  const diagnostic = instagramPublishDiagnostic({
    stage,
    endpoint: error?.endpoint || context.endpoint,
    idUsed: context.idUsed,
    mediaUrl: context.mediaUrl,
    status,
    responseBody: error?.payload || error?.meta_response || null,
    profile: context.profile
  });
  logInstagramPublishDiagnostic(diagnostic);
  return new MetaPublishError(`${prefix}:${stage}:${message}`, diagnostic);
}

async function publishInstagramPost({ accessToken, instagramBusinessAccountId, caption, imageUrl, env = process.env, fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error("meta_access_token_missing");
  if (!caption) throw new Error("meta_caption_missing");
  if (!isPublicInstagramMediaUrl(imageUrl)) throw new Error("meta_instagram_public_https_image_required");
  const config = metaConfig(env);
  let profile = null;
  try {
    profile = await fetchInstagramLoginProfile({ accessToken, env, fetchImpl });
    console.log(`[Meta Instagram Publish] ${JSON.stringify(instagramPublishDiagnostic({
      stage: "instagram_profile",
      endpoint: graphRequestEndpoint("me", { env, graph: "instagram" }),
      idUsed: profile.id,
      profile
    }))}`);
  } catch (error) {
    throw instagramPublishError("instagram_profile", error, {
      endpoint: graphRequestEndpoint("me", { env, graph: "instagram" })
    });
  }
  const configuredPublishId = cleanText(config.instagramPublishAccountId, 120);
  const publishPathId = configuredPublishId || "me";
  const publishingUserId = configuredPublishId || profile.user_id || profile.id || instagramBusinessAccountId;
  const createEndpoint = graphRequestEndpoint(`${publishPathId}/media`, { env, graph: "instagram" });
  const publishEndpoint = graphRequestEndpoint(`${publishPathId}/media_publish`, { env, graph: "instagram" });
  let media;
  try {
    media = await graphRequest(`${publishPathId}/media`, {
      method: "POST",
      accessToken,
      env,
      fetchImpl,
      graph: "instagram",
      body: {
        image_url: imageUrl,
        caption
      }
    });
  } catch (error) {
    throw instagramPublishError("create_media_container", error, {
      endpoint: createEndpoint,
      idUsed: publishingUserId,
      mediaUrl: imageUrl,
      profile
    });
  }
  const creationId = media.id;
  if (!creationId) throw new Error("meta_instagram_creation_id_missing");
  let published;
  try {
    published = await graphRequest(`${publishPathId}/media_publish`, {
      method: "POST",
      accessToken,
      env,
      fetchImpl,
      graph: "instagram",
      body: {
        creation_id: creationId
      }
    });
  } catch (error) {
    throw instagramPublishError("publish_media_container", error, {
      endpoint: publishEndpoint,
      idUsed: publishingUserId,
      mediaUrl: imageUrl,
      profile
    });
  }
  let permalink = null;
  if (published.id) {
    try {
      const details = await graphRequest(published.id, {
        method: "GET",
        accessToken,
        env,
        fetchImpl,
        graph: "instagram",
        body: { fields: "id,permalink" }
      });
      permalink = details.permalink || null;
    } catch (error) {
      permalink = null;
    }
  }
  return {
    external_post_id: published.id || null,
    published_url: permalink,
    meta_response: {
      creation_id: creationId,
      id: published.id || null,
      permalink,
      instagram_profile: profile,
      publishing_user_id: publishingUserId,
      publish_target: publishPathId,
      create_media_endpoint: createEndpoint,
      publish_media_endpoint: publishEndpoint
    }
  };
}

async function publishToPlatform({ platform, accessToken, pageId, instagramBusinessAccountId, caption, link, imageUrl, env = process.env, fetchImpl = fetch } = {}) {
  if (platform === "facebook") {
    return publishFacebookPost({ accessToken, pageId, caption, link, imageUrl, env, fetchImpl });
  }
  if (platform === "instagram") {
    return publishInstagramPost({ accessToken, instagramBusinessAccountId, caption, imageUrl, env, fetchImpl });
  }
  throw new Error("meta_unsupported_platform");
}

module.exports = {
  MetaApiError,
  MetaPublishError,
  facebookPostUrl,
  fetchInstagramLoginProfile,
  graphRequest,
  publishFacebookPost,
  publishInstagramPost,
  publishToPlatform,
  sanitizeMetaPayload
};
