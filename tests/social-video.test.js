const assert = require("node:assert/strict");
const test = require("node:test");

const { VIDEO_BRANDING_CONFIG } = require("../lib/social-video/branding");
const { generateSocialVideoProject } = require("../lib/social-video/generator");
const { buildRunwayTextToVideoRequest, estimateRunwayCost, runwaySettings } = require("../lib/social-video/runway");

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
  assert.equal(project.visual_style, "hogar_cotidiano");
  assert.match(project.visual_backdrop, /personas reales|familia|amigos/);
  assert.equal(project.music_style, "warm_house");
  assert.match(project.music_direction, /volumen bajo|BPM|instrumental/);
  assert.equal(project.real_ai_video.status, "requires_external_ai_video_renderer");
  assert.match(project.real_ai_video.master_prompt, /Personas reales y fotorealistas|REQUISITO CRITICO DE REALISMO/);
  assert.match(project.real_ai_video.negative_prompt, /ilustracion|avatar|manos deformes/);
  assert.equal(project.real_ai_video.scene_prompts.length, 5);
  assert.equal(project.render_contract.mandatory_overlay, true);
  assert.equal(project.render_contract.real_people_final, "external_ai_video_renderer_or_uploaded_clip_required");
  assert.equal(project.render_contract.webm_fallback, true);
  assert.equal(project.render_contract.audio_track, true);
  assert.equal(project.scenes.length, 5);
  assert.match(project.scenes[0].visual_prompt, /personas|familia|amigos|casa/);
  assert.match(project.global_ai_prompt, /logo de InmoRadar arriba a la derecha/);
  assert.match(project.global_ai_prompt, /"Inmoradar\.app" abajo a la derecha/);
  assert.match(project.global_ai_prompt, /Musica obligatoria/);
  assert.ok(project.quality_checks.includes("branding_visible_all_scenes"));
  assert.ok(project.quality_checks.includes("people_background_present"));
  assert.ok(project.quality_checks.includes("real_people_ai_pack_ready"));
  assert.ok(project.quality_checks.includes("music_track_present"));
});

test("runway estimate clamps duration and exposes cost before spending", () => {
  const estimate = estimateRunwayCost({
    model: "gen4.5",
    durationSeconds: 5
  });

  assert.equal(estimate.model, "gen4.5");
  assert.equal(estimate.duration_seconds, 5);
  assert.equal(estimate.estimated_credits, 60);
  assert.equal(estimate.estimated_cost_usd, 0.6);

  const clamped = estimateRunwayCost({
    model: "unknown",
    durationSeconds: 60
  });
  assert.equal(clamped.model, "gen4.5");
  assert.equal(clamped.duration_seconds, 15);
});

test("runway request uses InmoRadar safe-zone prompt and vertical ratio", () => {
  const project = generateSocialVideoProject({
    topic: "parking",
    city: "Madrid",
    duration_seconds: 24
  });
  const request = buildRunwayTextToVideoRequest({
    project,
    model: "gen4.5",
    durationSeconds: 5,
    ratio: "720:1280"
  });

  assert.equal(request.model, "gen4.5");
  assert.equal(request.duration, 5);
  assert.equal(request.ratio, "720:1280");
  assert.match(request.promptText, /Dejar espacio libre arriba derecha/);
  assert.match(request.promptText, /Inmoradar\.app/);
  assert.match(request.promptText, /No incluir texto legible, logos externos/);
});

test("runway settings are disabled by default to avoid accidental cost", () => {
  const settings = runwaySettings({});
  assert.equal(settings.enabled, false);
  assert.equal(settings.apiSecretConfigured, false);
  assert.equal(settings.model, "gen4.5");
  assert.equal(settings.maxCostUsd, 0.75);
  assert.equal(settings.dailyBudgetUsd, 3);
});
