function createCoreHandlers({ average, countBy, safeFetch } = {}) {
  if (typeof average !== "function") throw new Error("admin_core_average_required");
  if (typeof countBy !== "function") throw new Error("admin_core_count_by_required");
  if (typeof safeFetch !== "function") throw new Error("admin_core_safe_fetch_required");

  async function handleParkingSummary() {
    const [result, assessmentResult] = await Promise.all([
      safeFetch(
        "parking_difficulty_cache?select=id,geohash,city,radius_m,perspective,score,label,confidence_score,calculated_at,expires_at&order=calculated_at.desc&limit=100"
      ),
      safeFetch(
        "parking_assessments?select=id,source_url,address_text,street,zone_name,district,municipality,profile,overall_score,overall_label,confidence_score,confidence_label,status,last_checked_at&order=last_checked_at.desc&limit=100"
      )
    ]);
    const rows = Array.isArray(result) ? result : result.rows;
    const assessmentRows = Array.isArray(assessmentResult) ? assessmentResult : assessmentResult.rows;
    const validRows = rows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());

    return {
      status: 200,
      payload: {
        ok: true,
        generated_at: new Date().toISOString(),
        total_cache_rows: rows.length,
        valid_cache_rows: validRows.length,
        expired_cache_rows: rows.length - validRows.length,
        average_score: average(validRows, "score"),
        average_confidence: average(validRows, "confidence_score"),
        by_label: countBy(validRows, "label"),
        by_perspective: countBy(validRows, "perspective"),
        assessments_total: assessmentRows.length,
        assessments_recent: assessmentRows,
        recent: assessmentRows.length ? assessmentRows : rows,
        error: result.error || assessmentResult.error || null
      }
    };
  }

  return {
    handleParkingSummary
  };
}

module.exports = {
  createCoreHandlers
};
