const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAddressIntelligenceResponse,
  buildCatastroDnpLocUrl,
  buildCatastroViaUrl,
  buildIdealistaMapsUrl,
  calculateAddressPriceAdjustment,
  clearAddressIntelCache,
  hasUsefulAddressIntel,
  parseCatastroPayload,
  parseCatastroViaCandidates,
  parseIdealistaMapsHtml,
  splitSpanishStreetType,
  slugifyIdealistaMapsPart
} = require("../api/_address/intelligence");

const MOCK_HTML = `
  <html>
    <body>
      <h1>Avenida Metro Del, 7, El Campello</h1>
      <p>03560 El Campello</p>
      <a>Fuente Dirección General de Catastro</a>
      <section>
        <h2>¿Cuanto vale una casa en Avenida Metro Del, 7?</h2>
        <p>rango estimado entre 94.000 € y 180.000 €</p>
      </section>
      <section>
        <a>Esc.1 1º A</a><p>Vivienda</p><p>·121 m² ·6966104YH2566N0003DE</p>
        <a>Esc.1 2º B</a><p>Vivienda</p><p>·90 m² ·6966104YH2566N0006HY</p>
        <a>Esc.1 Bajo IZ</a><p>Comercio</p><p>·89 m² ·6966104YH2566N0002SW</p>
      </section>
      <section>
        <h2>Información del edificio en Avenida Metro Del, 7, El Campello</h2>
        <ul>
          <li>345 m² de parcela</li>
          <li>Construido en 1965</li>
          <li>Calidad de construcción normal</li>
          <li>Edificio de 4 plantas</li>
          <li>2 vecinos por planta</li>
          <li>sin ascensor</li>
          <li>8 Viviendas</li>
          <li>2 Comercios</li>
        </ul>
      </section>
      <section>
        <p>transporte a 50 m</p>
        <p>4 supermercados</p>
      </section>
      <section>
        <h2>En esta dirección han estado publicados 2 anuncios</h2>
        <p>2 pisos en venta (en 2018)78.000 €</p>
      </section>
    </body>
  </html>
`;

const MOCK_CATASTRO = {
  consulta_dnp: {
    bico: {
      bi: {
        idbi: {
          rc: {
            pc1: "6966104",
            pc2: "YH2566N",
            car: "0003",
            cc1: "D",
            cc2: "E"
          }
        },
        dt: {
          ldt: "AV METRO DEL 7, EL CAMPELLO (ALICANTE)"
        },
        debi: {
          luso: "Residencial",
          sfc: "121",
          ant: "1965"
        }
      },
      lcons: {
        cons: [
          { es: "1", pt: "01", pu: "A", luso: "Vivienda", stl: "121" },
          { es: "1", pt: "02", pu: "B", luso: "Vivienda", stl: "90" }
        ]
      }
    }
  }
};

const MOCK_CATASTRO_ERROR = {
  consulta_dnp: {
    control: { cuerr: "1" },
    lerr: {
      err: { cod: "43", des: "EL NUMERO NO EXISTE" }
    }
  }
};

const MOCK_CATASTRO_VIA = {
  consulta_callejero: {
    callejero: {
      calle: {
        dir: { tv: "CL", nv: "SERRANO", cv: "12345" }
      }
    }
  }
};

const MOCK_CATASTRO_NUMERO = {
  consulta_numerero: {
    numerero: {
      nump: {
        pc: { pc1: "1234567", pc2: "VK4713A" },
        num: { pnp: "45" }
      }
    }
  }
};

test("slugifyIdealistaMapsPart construye slugs compatibles con idealista/maps", () => {
  assert.equal(slugifyIdealistaMapsPart("El Campello"), "el-campello");
  assert.equal(slugifyIdealistaMapsPart("Alicante"), "alicante");
  assert.equal(slugifyIdealistaMapsPart("Avenida Metro Del"), "avenida-metro-del");
  assert.equal(slugifyIdealistaMapsPart("Carrer de la Llum, Nº 7 Ç"), "carrer-de-la-llum-n-7-c");
});

test("buildIdealistaMapsUrl compone la URL probable", () => {
  assert.equal(
    buildIdealistaMapsUrl({
      municipality: "El Campello",
      province: "Alicante",
      street: "Avenida Metro Del",
      street_number: "7"
    }),
    "https://www.idealista.com/maps/el-campello-alicante/avenida-metro-del/7/"
  );
});

test("splitSpanishStreetType y buildCatastroDnpLocUrl preparan consulta oficial", () => {
  assert.deepEqual(splitSpanishStreetType("Avenida Metro Del"), {
    tipo_via: "AV",
    nom_via: "Metro Del"
  });
  const url = buildCatastroDnpLocUrl({
    province: "Alicante",
    municipality: "El Campello",
    street: "Avenida Metro Del",
    street_number: "7"
  });
  assert.match(url, /Consulta_DNPLOC/);
  assert.match(url, /TipoVia=AV/);
  assert.match(url, /NomVia=Metro\+Del/);
});

test("buildCatastroViaUrl y parseCatastroViaCandidates preparan candidatos de vía", () => {
  const url = buildCatastroViaUrl({
    province: "Madrid",
    municipality: "Madrid",
    street: "Calle Serrano"
  });
  assert.match(url, /ConsultaVia/);
  assert.match(url, /TipoVia=CL/);
  assert.match(url, /NomVia=Serrano/);
  assert.deepEqual(parseCatastroViaCandidates(MOCK_CATASTRO_VIA), [
    { tipo_via: "CL", nom_via: "SERRANO", codigo_via: "12345", raw: { dir: { tv: "CL", nv: "SERRANO", cv: "12345" } } }
  ]);
});

test("parseIdealistaMapsHtml extrae datos de edificio, fincas y valoración", () => {
  const parsed = parseIdealistaMapsHtml(MOCK_HTML, {
    street: "Avenida Metro Del",
    street_number: "7",
    municipality: "El Campello",
    province: "Alicante",
    source_url: "https://www.idealista.com/maps/el-campello-alicante/avenida-metro-del/7/"
  });

  assert.equal(parsed.address_full, "Avenida Metro Del, 7, El Campello");
  assert.equal(parsed.postal_code, "03560");
  assert.equal(parsed.cadastre_source, "Dirección General de Catastro");
  assert.equal(parsed.building.year_built, 1965);
  assert.equal(parsed.building.has_lift, false);
  assert.equal(parsed.building.homes_count, 8);
  assert.equal(parsed.building.floors, 4);
  assert.equal(parsed.building.construction_quality, "normal");
  assert.equal(parsed.valuation.min_price, 94000);
  assert.equal(parsed.valuation.max_price, 180000);
  assert.equal(parsed.units.length, 3);
  assert.equal(parsed.units[0].surface_m2, 121);
  assert.equal(parsed.nearby_services.nearest_transport_distance_km, 0.05);
  assert.equal(parsed.nearby_services.supermarket_count, 4);
});

test("parseCatastroPayload extrae referencia, antigüedad y superficies", () => {
  const parsed = parseCatastroPayload(MOCK_CATASTRO, {
    street: "Avenida Metro Del",
    street_number: "7",
    municipality: "El Campello",
    province: "Alicante"
  });

  assert.equal(parsed.source, "catastro");
  assert.equal(parsed.cadastre_source, "Dirección General de Catastro");
  assert.equal(parsed.address_full, "AV METRO DEL 7, EL CAMPELLO (ALICANTE)");
  assert.equal(parsed.building.year_built, 1965);
  assert.equal(parsed.building_refs[0], "6966104YH2566N0003DE");
  assert.equal(parsed.units.length, 2);
  assert.equal(parsed.units[0].surface_m2, 121);
});

test("hasUsefulAddressIntel rechaza cachés sin datos útiles", () => {
  assert.equal(
    hasUsefulAddressIntel({
      source: "catastro",
      address_full: "Calle Serrano, 45, Madrid",
      building_refs: [],
      units: [],
      building: {
        year_built: null,
        has_lift: null,
        floors: null,
        homes_count: null,
        commercial_units_count: null
      },
      valuation: { min_price: null, max_price: null },
      nearby_services: {}
    }),
    false
  );
  assert.equal(
    hasUsefulAddressIntel({
      source: "catastro",
      address_full: "Calle Serrano, 45, Madrid",
      building_refs: ["1234567VK4713A0001AB"],
      units: [],
      building: {}
    }),
    true
  );
});

test("buildAddressIntelligenceResponse devuelve cache hit tras un primer miss", async () => {
  clearAddressIntelCache();
  const input = {
    street: "Avenida Metro Del",
    street_number: "7",
    municipality: "El Campello",
    province: "Alicante"
  };

  const miss = await buildAddressIntelligenceResponse(input, { html: MOCK_HTML });
  assert.equal(miss.ok, true);
  assert.equal(miss.cache.hit, false);

  const hit = await buildAddressIntelligenceResponse(input, {
    fetchImpl: async () => {
      throw new Error("network should not be used");
    }
  });
  assert.equal(hit.ok, true);
  assert.equal(hit.cache.hit, true);
  assert.equal(hit.building.year_built, 1965);
});

test("buildAddressIntelligenceResponse maneja 404 sin romper", async () => {
  clearAddressIntelCache();
  const response = await buildAddressIntelligenceResponse(
    {
      street: "Calle Falsa",
      street_number: "123",
      municipality: "Madrid",
      province: "Madrid"
    },
    {
      fetchImpl: async () => ({ ok: false, status: 404, text: async () => "" }),
      useCatastroFallback: false
    }
  );

  assert.equal(response.ok, false);
  assert.equal(response.reason, "maps_not_found");
  assert.equal(response.message, "No se han podido obtener datos adicionales del edificio.");
});

test("buildAddressIntelligenceResponse usa Catastro si idealista/maps devuelve 403", async () => {
  clearAddressIntelCache();
  const response = await buildAddressIntelligenceResponse(
    {
      street: "Avenida Metro Del",
      street_number: "7",
      municipality: "El Campello",
      province: "Alicante"
    },
    {
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => "" }),
      catastroFetchImpl: async () => ({
        ok: true,
        json: async () => MOCK_CATASTRO
      })
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.source, "catastro");
  assert.equal(response.cache.layer, "catastro_fallback");
  assert.equal(response.building.year_built, 1965);
});

test("buildAddressIntelligenceResponse usa vía y número candidatos si DNPLOC falla", async () => {
  clearAddressIntelCache();
  const calls = [];
  const response = await buildAddressIntelligenceResponse(
    {
      street: "Calle Serrano",
      street_number: "45",
      municipality: "Madrid",
      province: "Madrid"
    },
    {
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => "" }),
      catastroFetchImpl: async (url) => {
        calls.push(String(url));
        if (String(url).includes("Consulta_DNPLOC") && calls.length === 1) {
          return { ok: true, json: async () => MOCK_CATASTRO_ERROR };
        }
        if (String(url).includes("ConsultaVia")) {
          return { ok: true, json: async () => MOCK_CATASTRO_VIA };
        }
        if (String(url).includes("ConsultaNumero")) {
          return { ok: true, json: async () => MOCK_CATASTRO_NUMERO };
        }
        return { ok: true, json: async () => MOCK_CATASTRO };
      }
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.source, "catastro");
  assert.equal(response.raw_payload.catastro_candidate_flow.via.nom_via, "SERRANO");
  assert.equal(response.building_refs[0], "6966104YH2566N0003DE");
});

test("buildAddressIntelligenceResponse no devuelve ok=true si Catastro solo trae errores", async () => {
  clearAddressIntelCache();
  const response = await buildAddressIntelligenceResponse(
    {
      street: "Calle Inexistente",
      street_number: "999",
      municipality: "Madrid",
      province: "Madrid"
    },
    {
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => "" }),
      catastroFetchImpl: async () => ({ ok: true, json: async () => MOCK_CATASTRO_ERROR })
    }
  );

  assert.equal(response.ok, false);
  assert.equal(response.reason, "maps_fetch_failed");
});

test("calculateAddressPriceAdjustment añade caveats de edificio", () => {
  const adjustment = calculateAddressPriceAdjustment(
    { price_total: 220000, surface_m2: 95, floor: "3º" },
    parseIdealistaMapsHtml(MOCK_HTML, {})
  );

  assert.ok(adjustment.caveats.some((text) => text.includes("sin ascensor")));
  assert.ok(adjustment.caveats.some((text) => text.includes("Edificio antiguo")));
  assert.ok(adjustment.caveats.some((text) => text.includes("por encima del rango")));
  assert.ok(adjustment.positive_signals.includes("transporte_cercano"));
  assert.ok(adjustment.positive_signals.includes("servicios_cercanos"));
});
