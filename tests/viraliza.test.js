const assert = require("node:assert/strict");
const test = require("node:test");

const {
  generateDailyRoutine,
  generateKeywordSet,
  scoreCreator,
  generateContextualComments,
  generateOutreachMessage,
  recordAction,
  recordResult,
  analyzeWeeklyLearning,
  recommendNextActions
} = require("../lib/viraliza/engine");

test("generateDailyRoutine crea una rutina human-in-the-loop completa", () => {
  const routine = generateDailyRoutine("2026-05-20");

  assert.equal(routine.date, "2026-05-20");
  assert.equal(routine.primaryKeywords.length, 3);
  assert.equal(routine.secondaryKeywords.length, 10);
  assert.equal(routine.comments.length, 10);
  assert.equal(routine.followQueue.length, 5);
  assert.equal(routine.hooks.length, 3);
  assert.ok(routine.creatorToContact);
  assert.equal(routine.tasks.length, 7);
  assert.equal(routine.qualityCheck.max_2_brand_comments, true);
  assert.equal(routine.qualityCheck.at_least_2_question_comments, true);
  assert.equal(routine.qualityCheck.at_least_1_checklist_comment, true);
  assert.equal(routine.qualityCheck.human_review_required, true);
  assert.equal(routine.qualityCheck.no_auto_publish, true);
});

test("generateKeywordSet incluye keyword local y enlaces de busqueda manual", () => {
  const set = generateKeywordSet({ date: "2026-05-20", cities: ["Madrid"] }, { keywords: [] });
  assert.equal(set.primary.length, 3);
  assert.equal(set.secondary.length, 10);
  assert.ok(set.primary.some((keyword) => keyword.category === "barrios"));
  assert.match(set.primary[0].searchUrls.tiktok, /^https:\/\/www\.tiktok\.com\/search/);
  assert.match(set.primary[0].searchUrls.youtube, /youtube\.com\/results/);
});

test("scoreCreator prioriza microcreadores espanoles relevantes", () => {
  const score = scoreCreator({
    category: "asesor_hipotecario",
    country: "Espana",
    city: "Madrid",
    followers: 25000,
    avgViews: 12000,
    avgComments: 80,
    postingFrequency: "3-5/semana",
    topics: ["hipoteca", "entrada", "comprar piso"]
  });
  assert.ok(score >= 80);
});

test("generateContextualComments recomienda comentarios utiles sin automatizar", () => {
  const result = generateContextualComments({
    creatorType: "asesor_hipotecario",
    description: "Video sobre entrada e hipoteca antes de comprar piso"
  });

  assert.equal(result.recommendation, "comentar");
  assert.equal(result.comments.length, 5);
  assert.ok(result.comments.some((comment) => comment.brandMention));
  assert.ok(result.comments.every((comment) => comment.text.length <= 280));
});

test("generateOutreachMessage personaliza por tipo de creador", () => {
  const message = generateOutreachMessage({
    id: "creator_1",
    name: "Laura",
    handle: "@laura",
    category: "asesor_hipotecario",
    topics: ["hipoteca"]
  });

  assert.match(message.dm, /Laura/);
  assert.match(message.dm, /hipotecas/);
  assert.match(message.dm, /Premium gratis/);
  assert.match(message.collaborationIdea, /hipoteca/);
});

test("recordAction y recordResult preparan eventos medibles", () => {
  const action = recordAction({ entityType: "comment", entityId: "c1", actionType: "used" });
  const results = recordResult({ entityType: "comment", id: "c1" }, { likes: 3, replies: 1 });

  assert.equal(action.entityType, "comment");
  assert.equal(action.actionType, "used");
  assert.equal(results.length, 2);
  assert.equal(results.find((item) => item.metricName === "replies").metricValue, 1);
});

test("analyzeWeeklyLearning recomienda repetir winners", () => {
  const report = analyzeWeeklyLearning(
    { from: "2026-05-13", to: "2026-05-20" },
    {
      videos: [{ metrics: { views: 10000, retention_rate: 0.48, likes: 600, comments: 90, shares: 80, saves: 100, link_clicks: 30 } }],
      hooks: [{ hook: "Antes de llamar por un piso, mira esto.", performanceScore: 91 }],
      keywords: [{ keyword: "entrada piso", performanceScore: 88 }],
      comments: [{ type: "mini_checklist", resultReplies: 3 }],
      creators: [{ category: "asesor_hipotecario", status: "replied" }]
    }
  );
  const actions = recommendNextActions(report);

  assert.equal(report.classifications.winner, 1);
  assert.ok(actions.some((action) => /10 variaciones/.test(action)));
});
