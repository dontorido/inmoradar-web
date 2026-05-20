const SOCIAL_VIDEO_PROJECT_STATUSES = Object.freeze([
  "storyboard_ready",
  "ai_clip_queued",
  "ai_clip_ready",
  "final_exported",
  "failed",
  "archived"
]);

function normalizeProjectStatus(value, fallback = "storyboard_ready") {
  const normalized = String(value || "").trim().toLowerCase();
  return SOCIAL_VIDEO_PROJECT_STATUSES.includes(normalized) ? normalized : fallback;
}

function socialVideoProjectRow(project = {}, overrides = {}) {
  const projectJson = overrides.project_json || project;
  const status = normalizeProjectStatus(overrides.status || project.status);
  const growth = project.growth_strategy || {};

  return {
    id: String(overrides.id || project.id || "").trim(),
    title: String(overrides.title || project.title || "Video InmoRadar").trim(),
    city: overrides.city ?? project.city ?? null,
    topic: String(overrides.topic || project.topic || "").trim() || null,
    topic_label: String(overrides.topic_label || project.topic_label || growth.series || "").trim() || null,
    platform: String(overrides.platform || growth.platform || project.platform || "").trim() || null,
    series_id: String(overrides.series_id || growth.series_id || "").trim() || null,
    objective: String(overrides.objective || growth.objective || "").trim() || null,
    status,
    duration_seconds: Number(overrides.duration_seconds || project.duration_seconds || growth.duration || 0) || null,
    visual_style: String(overrides.visual_style || project.visual_style || "").trim() || null,
    music_style: String(overrides.music_style || project.music_style || "").trim() || null,
    cta: String(overrides.cta || project.cta || "").trim() || null,
    has_uploaded_clip: Boolean(overrides.has_uploaded_clip ?? project.has_uploaded_clip),
    has_ai_clip: Boolean(overrides.has_ai_clip ?? project.has_ai_clip),
    final_exported_at: overrides.final_exported_at || project.final_exported_at || null,
    last_job_id: overrides.last_job_id || project.last_job_id || null,
    failure: overrides.failure || project.failure || null,
    project_json: projectJson,
    updated_at: new Date().toISOString()
  };
}

function socialVideoProjectSummary(row = {}) {
  const project = row.project_json && typeof row.project_json === "object" ? row.project_json : {};
  return {
    id: row.id,
    title: row.title || project.title || "Video InmoRadar",
    city: row.city || project.city || null,
    topic: row.topic || project.topic || null,
    topic_label: row.topic_label || project.topic_label || null,
    platform: row.platform || project.growth_strategy?.platform || null,
    series_id: row.series_id || project.growth_strategy?.series_id || null,
    objective: row.objective || project.growth_strategy?.objective || null,
    status: normalizeProjectStatus(row.status || project.status),
    duration_seconds: Number(row.duration_seconds || project.duration_seconds || 0) || null,
    visual_style: row.visual_style || project.visual_style || null,
    music_style: row.music_style || project.music_style || null,
    cta: row.cta || project.cta || null,
    has_uploaded_clip: Boolean(row.has_uploaded_clip),
    has_ai_clip: Boolean(row.has_ai_clip),
    final_exported_at: row.final_exported_at || null,
    last_job_id: row.last_job_id || null,
    failure: row.failure || null,
    generated_at: project.generated_at || row.created_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    project
  };
}

module.exports = {
  SOCIAL_VIDEO_PROJECT_STATUSES,
  normalizeProjectStatus,
  socialVideoProjectRow,
  socialVideoProjectSummary
};
