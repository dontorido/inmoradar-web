const assert = require("node:assert/strict");
const test = require("node:test");

const { VIDEO_BRANDING_CONFIG } = require("../lib/social-video/branding");
const { generateSocialVideoProject } = require("../lib/social-video/generator");
const { socialVideoProjectRow, socialVideoProjectSummary } = require("../lib/social-video/projects");
const { RunwayApiError, buildRunwayTextToVideoRequest, createRunwayTextToVideo, estimateRunwayCost, normalizeRunwayRatio, runwaySettings } = require("../lib/social-video/runway");
const { analyzePerformance, generateVideoBrief, seriesConfig } = require("../lib/social-video/videoStrategyInmoRadar");

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

test("social video projects normaliza fila persistible y resumen operativo", () => {
  const project = generateSocialVideoProject({
    topic: "zona",
    city: "Valencia",
    duration_seconds: 24,
    visual_style: "familia_casa",
    music_style: "calm_pop"
  });
  const row = socialVideoProjectRow(project, {
    status: "final_exported",
    has_uploaded_clip: true,
    final_exported_at: "2026-05-20T10:00:00.000Z"
  });

  assert.equal(row.id, project.id);
  assert.equal(row.title, project.title);
  assert.equal(row.city, "Valencia");
  assert.equal(row.status, "final_exported");
  assert.equal(row.has_uploaded_clip, true);
  assert.equal(row.project_json.id, project.id);

  const summary = socialVideoProjectSummary({
    ...row,
    created_at: "2026-05-20T09:58:00.000Z"
  });
  assert.equal(summary.id, project.id);
  assert.equal(summary.status, "final_exported");
  assert.equal(summary.project.title, project.title);
  assert.equal(summary.final_exported_at, "2026-05-20T10:00:00.000Z");
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
  assert.equal(clamped.duration_seconds, 10);
});

test("runway request uses InmoRadar safe-zone prompt and Gen-4.5 text-only ratio", () => {
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
  assert.equal(request.endpoint, "image_to_video");
  assert.equal(request.duration, 5);
  assert.equal(request.ratio, "1280:720");
  assert.ok(request.promptText.length <= 950);
  assert.match(request.promptText, /Dejar espacio libre arriba derecha/);
  assert.match(request.promptText, /Inmoradar\.app/);
  assert.match(request.promptText, /No incluir texto legible, logos externos/);
});

test("runway request keeps vertical ratio when a prompt image is provided", () => {
  const project = generateSocialVideoProject({
    topic: "parking",
    city: "Madrid",
    duration_seconds: 24
  });
  const request = buildRunwayTextToVideoRequest({
    project,
    model: "gen4.5",
    durationSeconds: 5,
    ratio: "720:1280",
    promptImage: "data:image/png;base64,abc"
  });

  assert.equal(request.endpoint, "image_to_video");
  assert.equal(request.ratio, "720:1280");
  assert.equal(request.promptImage, "data:image/png;base64,abc");
});

test("runway create exposes provider validation details", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ message: "ratio is invalid", code: "validation_error" })
  });

  await assert.rejects(
    () =>
      createRunwayTextToVideo({
        apiSecret: "secret",
        fetchImpl,
        request: {
          endpoint: "image_to_video",
          model: "gen4.5",
          promptText: "test",
          ratio: "720:1280",
          duration: 5
        }
      }),
    (error) => {
      assert.equal(error instanceof RunwayApiError, true);
      assert.equal(error.status, 400);
      assert.equal(error.payload.code, "validation_error");
      assert.equal(error.message, "ratio is invalid");
      return true;
    }
  );
});

test("runway settings are disabled by default to avoid accidental cost", () => {
  const settings = runwaySettings({});
  assert.equal(settings.enabled, false);
  assert.equal(settings.apiSecretConfigured, false);
  assert.equal(settings.model, "gen4.5");
  assert.equal(settings.ratio, "720:1280");
  assert.equal(settings.maxCostUsd, 0.75);
  assert.equal(settings.dailyBudgetUsd, 3);
});

test("runway ratio normaliza valores al formato Gen-4.5", () => {
  assert.equal(normalizeRunwayRatio("720:1280"), "720:1280");
  assert.equal(normalizeRunwayRatio("9:16"), "720:1280");
  assert.equal(normalizeRunwayRatio("768:1280"), "720:1280");
  assert.equal(normalizeRunwayRatio("1280:720"), "1280:720");
  assert.equal(normalizeRunwayRatio("1280:768"), "1280:720");
  assert.equal(normalizeRunwayRatio("720:1280", { textOnly: true }), "1280:720");
});

test("videoStrategyInmoRadar genera brief viral prudente para chollo o humo", () => {
  const brief = generateVideoBrief({
    seriesId: "chollo_o_humo",
    platform: "tiktok",
    objective: "comments_and_installs",
    duration: 28,
    propertyData: {
      ciudad: "Madrid",
      barrio: "Ventas",
      precio: "245.000 €",
      metros: "62 m²",
      precio_m2: "3.951 €/m²",
      entrada_estimada: "49.000 €",
      cuota_estimada: "980 €/mes",
      transporte: "Metro a 9 minutos",
      aparcamiento: "complicado",
      score: "6,8/10",
      veredicto: "lo compararia antes de llamar"
    }
  });

  assert.equal(brief.series_id, "chollo_o_humo");
  assert.equal(brief.platform, "tiktok");
  assert.equal(brief.duration, 28);
  assert.match(brief.hook, /chollo|oportunidad|precio|dudar/i);
  assert.match(brief.script, /245\.000/);
  assert.match(brief.script, /3\.951/);
  assert.match(brief.script, /980/);
  assert.ok(brief.scene_by_scene.length >= 7);
  assert.ok(brief.overlays.every((overlay) => overlay.split(/\s+/).length <= 7));
  assert.ok(brief.hashtags.includes("#InmoRadar"));
  assert.equal(brief.quality_check.hook_under_3_seconds, true);
  assert.equal(brief.quality_check.no_absolute_claims, true);
  assert.equal(brief.quality_check.cta_is_soft, true);
});

test("videoStrategyInmoRadar no inventa datos y anonimiza sensibles", () => {
  const brief = generateVideoBrief({
    seriesId: "pisos_seguidores",
    duration: 24,
    propertyData: {
      precio: "dato no disponible",
      direccion: "Calle Mayor 12",
      telefono: "612345678"
    }
  });

  assert.match(brief.script, /dato no disponible|no aparece claro|conviene comprobarlo/);
  assert.match(brief.script, /Oculto la direccion por privacidad/);
  assert.doesNotMatch(brief.script, /612345678/);
  assert.doesNotMatch(brief.script, /Calle Mayor 12/);
  assert.equal(brief.quality_check.no_absolute_claims, true);
});

test("generateSocialVideoProject integra la estrategia growth en escenas y export", () => {
  const project = generateSocialVideoProject({
    series_id: "piso_a_vs_piso_b",
    platform: "reels",
    objective: "comments",
    duration_seconds: 30,
    city: "Madrid",
    property_data: {
      ciudad: "Madrid",
      precio_base: "300.000 €",
      metros_a: "70",
      precio_m2_a: "4.285 €/m²",
      score_a: "7,8/10",
      metros_b: "82",
      precio_m2_b: "3.658 €/m²",
      score_b: "7,1/10",
      ventaja_a: "transporte",
      ventaja_b: "metros y precio por metro"
    }
  });

  assert.equal(project.engine, "growth_video_strategy");
  assert.equal(project.growth_strategy.series_id, "piso_a_vs_piso_b");
  assert.equal(project.topic_label, seriesConfig.piso_a_vs_piso_b.name);
  assert.ok(project.scenes.length >= 7);
  assert.match(project.caption, /#InmoRadar/);
  assert.ok(project.quality_checks.includes("growth_no_absolute_claims"));
  assert.ok(project.overlays.includes("A vs B"));
});

test("analyzePerformance clasifica ganadores y acciones de aprendizaje", () => {
  const result = analyzePerformance({
    views: 10000,
    retention_rate: 0.46,
    completion_rate: 0.41,
    likes: 420,
    comments: 95,
    shares: 80,
    saves: 120,
    link_clicks: 60,
    installs: 12
  });

  assert.equal(result.classification, "winner");
  assert.match(result.action, /10 variantes/);
  assert.ok(result.metrics.engagement_rate > 0.05);
});
