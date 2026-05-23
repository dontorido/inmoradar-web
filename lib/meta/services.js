const settings = require("./settings");
const content = require("./content");
const images = require("./images");
const oauth = require("./oauth");
const publishing = require("./publishing");

function validatePublishInput({ post, posts = [], connection, settings: metaSettings = {}, env = process.env } = {}) {
  const platform = String(post?.platform || "").toLowerCase();
  const normalizedSettings = settings.normalizeSettings(metaSettings, env);
  const summary = settings.summarizeConnection(connection, env);
  const decision = settings.shouldRunAutopublisher({
    posts,
    settings: normalizedSettings,
    connection,
    env,
    platform
  });
  if (!settings.META_PLATFORMS.includes(platform)) throw new Error("meta_unsupported_platform");
  if (!post?.caption) throw new Error("meta_caption_missing");
  if (!post?.source_url) throw new Error("meta_source_url_missing");
  if (platform === "instagram" && !images.isPublicImageUrl(post.image_url)) throw new Error("meta_instagram_public_image_required");
  if (!summary.has_facebook_page) throw new Error("meta_facebook_page_id_missing");
  if (platform === "instagram" && !summary.has_instagram_account) throw new Error("meta_instagram_business_account_id_missing");
  if (summary.missing_scopes.length) throw new Error(`meta_missing_permissions:${summary.missing_scopes.join(",")}`);
  if (decision.reason === "META_AUTOPOST_ENABLED=false") throw new Error("META_AUTOPOST_ENABLED=false");
  if (decision.reason === "autopost_enabled=false") throw new Error("meta_autopost_disabled");
  if (decision.reason === "max_per_day_reached") throw new Error("meta_max_per_day_reached");
  if (decision.reason === "frequency_not_due") throw new Error("meta_frequency_not_due");
  if (!["connected", "needs_permissions"].includes(summary.status) && !summary.automatic_available) throw new Error("meta_connection_not_ready");
  return true;
}

module.exports = {
  ...settings,
  ...content,
  ...images,
  ...oauth,
  ...publishing,
  validatePublishInput
};
