const VIDEO_BRANDING_CONFIG = Object.freeze({
  showLogo: true,
  logoPosition: "top-right",
  logoSizePx: 72,
  logoMarginTopPx: 48,
  logoMarginRightPx: 48,
  showWebsite: true,
  websiteText: "Inmoradar.app",
  websitePosition: "bottom-right",
  websiteFontSizePx: 32,
  websiteMarginBottomPx: 48,
  websiteMarginRightPx: 48,
  logoAssetPath: "/assets/favicon.svg",
  safeZonePx: 96
});

function getVideoBrandingConfig(overrides = {}) {
  return {
    ...VIDEO_BRANDING_CONFIG,
    ...(overrides && typeof overrides === "object" ? overrides : {})
  };
}

module.exports = {
  VIDEO_BRANDING_CONFIG,
  getVideoBrandingConfig
};
