const assert = require("node:assert/strict");
const test = require("node:test");

const {
  generateDailyRoutine,
  generateKeywordSet,
  scoreCreator,
  normalizeRealCreator,
  generateDailyCreatorPlan,
  normalizeViralAction,
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


test("normalizeRealCreator adapta import manual al modelo interno", () => {
  const creator = normalizeRealCreator({
    platform: "TikTok",
    handle: "@hipotecasclaras",
    display_name: "Hipotecas Claras",
    profile_url: "https://www.tiktok.com/@hipotecasclaras",
    category: "asesor_hipotecario",
    city: "Madrid",
    topics: "hipoteca, entrada, primera vivienda",
    followers_count: 25000,
    avg_views: 12000,
    avg_comments: 80
  });

  assert.equal(creator.platform, "tiktok");
  assert.equal(creator.displayName, "Hipotecas Claras");
  assert.equal(creator.profileUrl, "https://www.tiktok.com/@hipotecasclaras");
  assert.deepEqual(creator.topics, ["hipoteca", "entrada", "primera vivienda"]);
  assert.equal(creator.followers, 25000);
  assert.ok(creator.creatorFitScore >= 80);
});

test("generateDailyCreatorPlan recomienda cuentas reales concretas y acciones manuales", () => {
  const creators = [
    {
      platform: "tiktok",
      handle: "@hipotecasclaras",
      display_name: "Hipotecas Claras",
      profile_url: "https://www.tiktok.com/@hipotecasclaras",
      category: "asesor_hipotecario",
      city: "Madrid",
      country: "Espana",
      topics: ["hipoteca", "entrada", "comprar piso"],
      followers_count: 25000,
      avg_views: 12000,
      avg_comments: 80
    },
    {
      platform: "x",
      handle: "@memesvivienda",
      category: "viral_general",
      country: "Argentina",
      topics: ["humor"],
      followers_count: 400000
    }
  ];

  const plan = generateDailyCreatorPlan(creators, [], "2026-05-22", { dailyLimits: { realCreators: 1 } });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].handle, "@hipotecasclaras");
  assert.equal(plan[0].platform, "tiktok");
  assert.ok(plan[0].priorityScore >= 70);
  assert.match(plan[0].whatToLookFor, /entrada|cuota|hipoteca/i);
  assert.ok(plan[0].suggestedComment.length <= 280);
  assert.equal(plan[0].status, "pending");
  assert.ok(["comment", "follow", "dm", "review_profile"].includes(plan[0].recommendedAction));
});

test("generateDailyCreatorPlan penaliza cuentas contactadas recientemente", () => {
  const creators = [
    {
      id: "creator_recent",
      platform: "tiktok",
      handle: "@reciente",
      category: "asesor_hipotecario",
      country: "Espana",
      city: "Madrid",
      topics: ["hipoteca", "entrada"],
      followers: 20000,
      avgViews: 10000,
      avgComments: 60
    },
    {
      id: "creator_fresh",
      platform: "instagram",
      handle: "@fresh",
      category: "comprar_piso",
      country: "Espana",
      city: "Madrid",
      topics: ["comprar piso", "primera vivienda"],
      followers: 18000,
      avgViews: 9000,
      avgComments: 50
    }
  ];
  const actions = [{ creatorId: "creator_recent", actionType: "dm_sent", actionDate: "2026-05-20" }];

  const plan = generateDailyCreatorPlan(creators, actions, "2026-05-22", { dailyLimits: { realCreators: 1 } });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].creatorId, "creator_fresh");
});

test("normalizeViralAction prepara resultados manuales medibles", () => {
  const action = normalizeViralAction({
    creator_id: "creator_1",
    platform: "instagram",
    action_type: "commented",
    target_url: "https://www.instagram.com/reel/123",
    used_comment: "Comentario manual",
    likes_count: "4",
    replies_count: 2,
    profile_visits: 7,
    installs_attributed: 1
  });

  assert.equal(action.creatorId, "creator_1");
  assert.equal(action.actionType, "commented");
  assert.equal(action.likesCount, 4);
  assert.equal(action.repliesCount, 2);
  assert.equal(action.profileVisits, 7);
  assert.equal(action.installsAttributed, 1);
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

