const { cleanText, metaConfig } = require("./settings");
const { isPublicImageUrl } = require("./images");

class MetaApiError extends Error {
  constructor(message, status, payload = {}) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.payload = payload;
  }
}

function sanitizeMetaPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const copy = Array.isArray(payload) ? [] : {};
  for (const [key, value] of Object.entries(payload)) {
    if (/token|secret|authorization/i.test(key)) continue;
    copy[key] = value && typeof value === "object" ? sanitizeMetaPayload(value) : value;
  }
  return copy;
}

async function graphRequest(path, { method = "GET", accessToken = "", body = null, env = process.env, fetchImpl = fetch } = {}) {
  const config = metaConfig(env);
  const url = new URL(`${config.graphUrl}/${config.graphVersion}/${String(path).replace(/^\/+/, "")}`);
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
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.error) {
    const message = payload?.error?.message || payload?.message || `meta_graph_request_failed_${response.status}`;
    throw new MetaApiError(message, response.status, sanitizeMetaPayload(payload));
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

async function publishInstagramPost({ accessToken, instagramBusinessAccountId, caption, imageUrl, env = process.env, fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error("meta_access_token_missing");
  if (!instagramBusinessAccountId) throw new Error("meta_instagram_business_account_id_missing");
  if (!caption) throw new Error("meta_caption_missing");
  if (!isPublicImageUrl(imageUrl)) throw new Error("meta_instagram_public_image_required");
  const media = await graphRequest(`${instagramBusinessAccountId}/media`, {
    method: "POST",
    accessToken,
    env,
    fetchImpl,
    body: {
      image_url: imageUrl,
      caption
    }
  });
  const creationId = media.id;
  if (!creationId) throw new Error("meta_instagram_creation_id_missing");
  const published = await graphRequest(`${instagramBusinessAccountId}/media_publish`, {
    method: "POST",
    accessToken,
    env,
    fetchImpl,
    body: {
      creation_id: creationId
    }
  });
  let permalink = null;
  if (published.id) {
    try {
      const details = await graphRequest(published.id, {
        method: "GET",
        accessToken,
        env,
        fetchImpl,
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
      permalink
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
  facebookPostUrl,
  graphRequest,
  publishFacebookPost,
  publishInstagramPost,
  publishToPlatform,
  sanitizeMetaPayload
};
