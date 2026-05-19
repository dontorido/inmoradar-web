const assert = require("node:assert/strict");
const test = require("node:test");

const { VIDEO_BRANDING_CONFIG } = require("../lib/social-video/branding");
const { generateSocialVideoProject } = require("../lib/social-video/generator");

test("video branding config exige logo y web en posiciones fijas", () => {
  assert.equal(VIDEO_BRANDING_CONFIG.showLogo, true);
  assert.equal(VIDEO_BRANDING_CONFIG.logoPosition, "top-right");
  assert.equal(VIDEO_BRANDING_CONFIG.logoAssetPath, "/assets/inmoradar-brand-mark.svg");
  assert.equal(VIDEO_BRANDING_CONFIG.showWebsite, true);
  assert.equal(VIDEO_BRANDING_CONFIG.websiteText, "Inmoradar.app");
  assert.equal(VIDEO_BRANDING_CONFIG.websitePosition, "bottom-right");
});

test("generateSocialVideoProject genera storyboard con branding obligatorio", () => {
  const project = generateSocialVideoProject({
    topic: "parking",
    city: "Madrid",
    duration_seconds: 24,
    tone: "experto",
    audience: "comprador",
    cta: "install"
  });

  assert.equal(project.ok, true);
  assert.equal(project.format.width, 1080);
  assert.equal(project.format.height, 1920);
  assert.equal(project.branding.logoPosition, "top-right");
  assert.equal(project.branding.websiteText, "Inmoradar.app");
  assert.equal(project.render_contract.mandatory_overlay, true);
  assert.equal(project.render_contract.webm_fallback, true);
  assert.equal(project.scenes.length, 5);
  assert.match(project.global_ai_prompt, /logo de InmoRadar arriba a la derecha/);
  assert.match(project.global_ai_prompt, /"Inmoradar\.app" abajo a la derecha/);
  assert.ok(project.quality_checks.includes("branding_visible_all_scenes"));
});
