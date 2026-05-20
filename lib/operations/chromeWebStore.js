const CHROME_SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE_URL = "https://chromewebstore.googleapis.com";

function configured(value) {
  return Boolean(String(value || "").trim());
}

function chromeWebStoreConfig(env = process.env) {
  const config = {
    publisherId: String(env.CHROME_WEBSTORE_PUBLISHER_ID || "").trim(),
    itemId: String(env.CHROME_WEBSTORE_ITEM_ID || "").trim(),
    accessToken: String(env.CHROME_WEBSTORE_ACCESS_TOKEN || "").trim(),
    clientId: String(env.CHROME_WEBSTORE_CLIENT_ID || "").trim(),
    clientSecret: String(env.CHROME_WEBSTORE_CLIENT_SECRET || "").trim(),
    refreshToken: String(env.CHROME_WEBSTORE_REFRESH_TOKEN || "").trim()
  };

  const missing = [];
  if (!config.publisherId) missing.push("CHROME_WEBSTORE_PUBLISHER_ID");
  if (!config.itemId) missing.push("CHROME_WEBSTORE_ITEM_ID");
  if (!config.accessToken) {
    if (!config.clientId) missing.push("CHROME_WEBSTORE_CLIENT_ID");
    if (!config.clientSecret) missing.push("CHROME_WEBSTORE_CLIENT_SECRET");
    if (!config.refreshToken) missing.push("CHROME_WEBSTORE_REFRESH_TOKEN");
  }

  return {
    ...config,
    itemName: config.publisherId && config.itemId ? `publishers/${config.publisherId}/items/${config.itemId}` : "",
    configured: missing.length === 0,
    missing
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload.error?.message || payload.error_description || payload.error || `chrome_webstore_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function chromeAccessToken(config = chromeWebStoreConfig(), fetchImpl = fetch) {
  if (!config.configured) {
    throw new Error(`chrome_webstore_missing_env:${config.missing.join(",")}`);
  }
  if (configured(config.accessToken)) return config.accessToken;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  const payload = await parseJsonResponse(response);
  if (!payload.access_token) throw new Error("chrome_webstore_access_token_missing");
  return payload.access_token;
}

async function chromeWebStoreRequest(path, options = {}) {
  const config = options.config || chromeWebStoreConfig();
  const fetchImpl = options.fetchImpl || fetch;
  const token = await chromeAccessToken(config, fetchImpl);
  const response = await fetchImpl(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    },
    body: options.body
  });
  return parseJsonResponse(response);
}

function chromePublishBody(options = {}) {
  const body = {};
  const publishType = String(options.publishType || "DEFAULT_PUBLISH").trim();
  if (publishType) body.publishType = publishType;
  if (options.deployPercentage !== undefined && options.deployPercentage !== null && options.deployPercentage !== "") {
    const deployPercentage = Math.max(0, Math.min(100, Number.parseInt(String(options.deployPercentage), 10) || 0));
    body.deployInfos = [{ deployPercentage }];
  }
  if (options.skipReview === true) body.skipReview = true;
  return body;
}

async function fetchChromeItemStatus(options = {}) {
  const config = options.config || chromeWebStoreConfig();
  return chromeWebStoreRequest(`/v2/${config.itemName}:fetchStatus`, { ...options, config });
}

async function uploadChromePackage(packageBuffer, options = {}) {
  if (!Buffer.isBuffer(packageBuffer) || !packageBuffer.length) {
    throw new Error("chrome_package_required");
  }
  const config = options.config || chromeWebStoreConfig();
  return chromeWebStoreRequest(`/upload/v2/${config.itemName}:upload`, {
    ...options,
    config,
    method: "POST",
    headers: {
      "content-type": options.mimeType || "application/zip"
    },
    body: packageBuffer
  });
}

async function publishChromeItem(options = {}) {
  const config = options.config || chromeWebStoreConfig();
  return chromeWebStoreRequest(`/v2/${config.itemName}:publish`, {
    ...options,
    config,
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(chromePublishBody(options))
  });
}

function decodeInlineArtifactPayload(artifact = {}) {
  const payload = artifact.artifact_payload || {};
  if (payload.encoding !== "base64" || !payload.content_base64) {
    throw new Error("release_artifact_inline_payload_required");
  }
  return Buffer.from(String(payload.content_base64), "base64");
}

module.exports = {
  CHROME_SCOPE,
  chromeAccessToken,
  chromePublishBody,
  chromeWebStoreConfig,
  decodeInlineArtifactPayload,
  fetchChromeItemStatus,
  publishChromeItem,
  uploadChromePackage
};
