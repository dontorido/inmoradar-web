const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPhotoConditionAnalysisResponse,
  clearPhotoAnalysisMemory,
  combinePriceAndPhotoAssessment,
  selectRepresentativeListingImages
} = require("../api/_photo/analysis");

const MODEL_RESPONSE = {
  condition: { label: "dated", label_es: "Antiguo/desactualizado", score: 42 },
  renovation: {
    probability: "high",
    probability_es: "Alta",
    type: "partial_renovation",
    type_es: "Reforma parcial",
    estimated_scope: ["cocina", "bano"]
  },
  signals: {
    kitchen: { status: "dated", renovation_likelihood: "high", notes: ["Cocina antigua."] },
    bathroom: { status: "dated", renovation_likelihood: "medium", notes: [] },
    flooring: { status: "average", renovation_likelihood: "medium", notes: [] },
    walls_ceilings: { status: "good", renovation_likelihood: "low", notes: [] },
    windows_doors: { status: "unknown", renovation_likelihood: "unknown", notes: [] },
    general_light: { status: "good", renovation_likelihood: "low", notes: [] }
  },
  confidence_score: 0.72,
  caveats: ["Segun las fotos disponibles."],
  price_interpretation: { impact: "negative", message: "Puede afectar a la lectura del precio." }
};

test("selectRepresentativeListingImages deduplica y prioriza interiores", () => {
  const selection = selectRepresentativeListingImages([
    { url: "https://img.example.com/logo.png", alt: "logo" },
    { url: "https://img.example.com/mapa.jpg", alt: "mapa" },
    { url: "https://img.example.com/foto1.jpg?imwidth=1200", alt: "cocina" },
    { url: "https://img.example.com/foto1.jpg?imwidth=600", alt: "cocina duplicada" },
    { url: "https://img.example.com/foto2.jpg", alt: "bano" },
    { url: "data:image/png;base64,abc", alt: "base64" }
  ]);

  assert.equal(selection.selectedImages.length, 4);
  assert.equal(selection.selectedImages[0], "https://img.example.com/foto1.jpg?imwidth=1200");
  assert.equal(selection.selectedImages[1], "https://img.example.com/foto2.jpg");
  assert.ok(selection.discardedImages.some((item) => item.reason === "duplicate"));
  assert.ok(selection.discardedImages.some((item) => item.reason === "invalid_url"));
});

test("photo-condition-analysis devuelve no_images si no hay fotos", async () => {
  clearPhotoAnalysisMemory();
  const response = await buildPhotoConditionAnalysisResponse({}, { skipRateLimit: true });
  assert.equal(response.status, 400);
  assert.equal(response.body.reason, "no_images");
});

test("photo-condition-analysis devuelve respuesta normalizada y cachea", async () => {
  clearPhotoAnalysisMemory();
  const input = {
    listing_url: "https://www.idealista.com/inmueble/1/",
    portal: "idealista",
    image_urls: ["https://img.example.com/cocina.jpg", "https://img.example.com/bano.jpg"],
    price_label: "buen_precio"
  };

  const first = await buildPhotoConditionAnalysisResponse(input, {
    modelResponse: MODEL_RESPONSE,
    skipRateLimit: true
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.images_analyzed, 2);
  assert.equal(first.body.condition.label, "dated");
  assert.equal(first.body.cache.hit, false);

  const second = await buildPhotoConditionAnalysisResponse(input, { skipRateLimit: true });
  assert.equal(second.status, 200);
  assert.equal(second.body.cache.hit, true);
});

test("photo-condition-analysis aplica rate limit basico", async () => {
  clearPhotoAnalysisMemory();
  const input = {
    listing_url: "https://www.idealista.com/inmueble/rate/",
    image_urls: ["https://img.example.com/cocina.jpg"]
  };
  for (let index = 0; index < 5; index += 1) {
    const response = await buildPhotoConditionAnalysisResponse(input, {
      modelResponse: MODEL_RESPONSE,
      skipCache: true,
      clientKey: "rate-test"
    });
    assert.equal(response.status, 200);
  }

  const blocked = await buildPhotoConditionAnalysisResponse(input, {
    modelResponse: MODEL_RESPONSE,
    skipCache: true,
    clientKey: "rate-test"
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.reason, "rate_limited");
});

test("combinePriceAndPhotoAssessment mezcla precio y fotos", () => {
  assert.equal(
    combinePriceAndPhotoAssessment({ label: "caro" }, { renovation: { probability: "high" } }),
    "El precio esta por encima de mercado y las fotos sugieren posible necesidad de reforma. Conviene revisar con especial cautela."
  );
  assert.equal(
    combinePriceAndPhotoAssessment({ label: "algo_caro" }, { condition: { label: "good" } }),
    "El precio esta por encima de la referencia, pero el estado visual podria justificar parte de la prima."
  );
});
