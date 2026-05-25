const {
  normalizeReleaseArtifactInput,
  normalizeReleaseTarget,
  releaseConnectors
} = require("../../../lib/operations/releases");

function createOperationsReleaseHandler({ clampLimit, readJsonBody, safeFetch, supabaseFetch } = {}) {
  if (typeof clampLimit !== "function") throw new Error("admin_operations_clamp_limit_required");
  if (typeof readJsonBody !== "function") throw new Error("admin_operations_read_json_body_required");
  if (typeof safeFetch !== "function") throw new Error("admin_operations_safe_fetch_required");
  if (typeof supabaseFetch !== "function") throw new Error("admin_operations_supabase_fetch_required");

  return async function handleReleaseArtifacts(req, url) {
    if (req.method === "GET") {
      const rawTarget = url.searchParams.get("target");
      const target = rawTarget ? normalizeReleaseTarget(rawTarget) : "";
      const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
      const params = new URLSearchParams({
        select:
          "id,target,version,title,channel,status,artifact_kind,connector_target,file_name,mime_type,file_size_bytes,sha256,storage_path,notes,created_at,updated_at",
        order: "created_at.desc",
        limit: String(limit)
      });
      if (target) params.set("target", `eq.${target}`);
      const result = await safeFetch(`release_artifacts?${params.toString()}`);
      const rows = Array.isArray(result) ? result : result.rows;
      return {
        status: 200,
        payload: {
          ok: true,
          target: target || "all",
          artifacts: rows,
          connectors: releaseConnectors(),
          table_missing: !Array.isArray(result) && /release_artifacts/.test(result.error || ""),
          error: Array.isArray(result) ? null : result.error || null
        }
      };
    }

    if (req.method !== "POST") {
      return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
    }

    const input = await readJsonBody(req);
    const artifact = normalizeReleaseArtifactInput(input);
    const rows = await supabaseFetch("release_artifacts", {
      method: "POST",
      headers: {
        prefer: "return=representation"
      },
      body: JSON.stringify(artifact)
    });

    return {
      status: 200,
      payload: {
        ok: true,
        artifact: Array.isArray(rows) ? rows[0] : artifact,
        connectors: releaseConnectors()
      }
    };
  };
}

module.exports = {
  createOperationsReleaseHandler
};
