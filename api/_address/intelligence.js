const { hasSupabaseConfig, supabaseFetch } = require("../_utils");

const IDEALISTA_MAPS_BASE_URL = "https://www.idealista.com/maps";
const CATASTRO_DNPLOC_URL =
  "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPLOC";
const CATASTRO_VIA_URL =
  "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/ConsultaVia";
const CATASTRO_NUMERO_URL =
  "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/ConsultaNumero";
const IDEALISTA_MAPS_SOURCE = "idealista_maps";
const CATASTRO_SOURCE = "catastro";
const DEFAULT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;

const memoryCache = new Map();
const rateLimitBuckets = new Map();

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let normalized = String(value).trim().replace(/\s/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (hasComma) normalized = normalized.replace(",", ".");
  else if (hasDot) {
    const parts = normalized.split(".");
    if (parts.length > 1 && (parts.at(-1) || "").length === 3) normalized = normalized.replace(/\./g, "");
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugifyIdealistaMapsPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedAddressKey(input = {}) {
  const address = input.address || [input.street, input.street_number, input.postal_code, input.municipality, input.province]
    .filter(Boolean)
    .join(" ");
  return normalizeText(address);
}

function splitStreetAndNumber(address = "") {
  const cleaned = String(address || "").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(.+?)[,\s]+(\d+[a-zA-Z]?)\b/);
  if (!match) return { street: "", street_number: "" };
  return {
    street: match[1].replace(/,+$/g, "").trim(),
    street_number: match[2].trim()
  };
}

function buildIdealistaMapsUrl({ street, street_number, municipality, province }) {
  const municipalitySlug = slugifyIdealistaMapsPart(municipality);
  const provinceSlug = slugifyIdealistaMapsPart(province);
  const streetSlug = slugifyIdealistaMapsPart(street);
  const numberSlug = slugifyIdealistaMapsPart(street_number);
  if (!municipalitySlug || !provinceSlug || !streetSlug || !numberSlug) return null;
  return `${IDEALISTA_MAPS_BASE_URL}/${municipalitySlug}-${provinceSlug}/${streetSlug}/${numberSlug}/`;
}

function splitSpanishStreetType(street = "") {
  const cleaned = String(street || "").replace(/\s+/g, " ").trim();
  const patterns = [
    [/^(avenida|avda\.?|av\.?)\s+/i, "AV"],
    [/^(calle|c\/|cl\.?)\s+/i, "CL"],
    [/^(plaza|pl\.?|pza\.?)\s+/i, "PZ"],
    [/^(paseo|ps\.?)\s+/i, "PS"],
    [/^(carretera|ctra\.?)\s+/i, "CR"],
    [/^(camino|cmno\.?)\s+/i, "CM"],
    [/^(ronda)\s+/i, "RD"],
    [/^(traves[ií]a|trv\.?)\s+/i, "TR"],
    [/^(callejón|callejon)\s+/i, "CJ"],
    [/^(bulevar|boulevard)\s+/i, "BL"]
  ];
  for (const [regex, type] of patterns) {
    if (regex.test(cleaned)) {
      return {
        tipo_via: type,
        nom_via: cleaned.replace(regex, "").trim()
      };
    }
  }
  return { tipo_via: "", nom_via: cleaned };
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&euro;/gi, "€");
}

function htmlToLines(html) {
  const text = decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:a|h1|h2|h3|h4|p|li|div|section|article|tr|td|dd|dt)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return text;
}

function firstMatch(lines, regex) {
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match;
  }
  return null;
}

function parseEuro(value) {
  const match = String(value || "").match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*€/);
  return match ? asNumber(match[1]) : null;
}

function parseSurface(value) {
  const match = String(value || "").match(/(\d{1,4}(?:[.,]\d+)?)\s*m²/i);
  return match ? asNumber(match[1]) : null;
}

function parseAddress(lines, fallback = {}) {
  const heading = lines.find((line) => {
    const normalized = normalizeText(line);
    return normalized.includes(normalizeText(fallback.street)) && normalized.includes(normalizeText(fallback.municipality));
  });
  const postalLine = lines.find((line) => /\b\d{5}\b/.test(line));
  const postalMatch = postalLine?.match(/\b(\d{5})\b/);
  return {
    address_full: heading || fallback.address || [fallback.street, fallback.street_number, fallback.municipality].filter(Boolean).join(", ") || null,
    postal_code: fallback.postal_code || postalMatch?.[1] || null
  };
}

function parseUnits(lines) {
  const units = [];
  for (let index = 0; index < lines.length - 2; index += 1) {
    const label = lines[index];
    const useType = lines[index + 1];
    const detail = lines[index + 2];
    if (!/^(esc\.?|escalera|bajo|planta|portal)/i.test(label)) continue;
    if (!/(vivienda|comercio|local|garaje|oficina)/i.test(useType)) continue;
    const surfaceM2 = parseSurface(detail);
    const cadastralRef = detail.match(/\b([0-9A-Z]{14,20})\b/)?.[1] || null;
    if (!surfaceM2 && !cadastralRef) continue;
    units.push({
      label,
      use_type: useType,
      surface_m2: surfaceM2,
      cadastral_ref: cadastralRef
    });
  }
  return units;
}

function parseBuilding(lines) {
  const joined = lines.join("\n");
  const qualityMatch = joined.match(/calidad de construcci[oó]n\s+([a-záéíóúñ ]{3,30})/i);
  return {
    plot_surface_m2: parseSurface(firstMatch(lines, /m²\s+de parcela/i)?.[0]),
    year_built: asNumber(firstMatch(lines, /construido en\s+(\d{4})/i)?.[1]),
    construction_quality: qualityMatch ? qualityMatch[1].trim().toLowerCase() : null,
    floors: asNumber(firstMatch(lines, /edificio de\s+(\d+)\s+plantas?/i)?.[1]),
    neighbours_per_floor: asNumber(firstMatch(lines, /(\d+)\s+vecinos?\s+por planta/i)?.[1]),
    has_lift: /\bsin ascensor\b/i.test(joined) ? false : /\bcon ascensor\b/i.test(joined) ? true : null,
    homes_count: asNumber(firstMatch(lines, /(\d+)\s+viviendas?/i)?.[1]),
    commercial_units_count: asNumber(firstMatch(lines, /(\d+)\s+comercios?/i)?.[1])
  };
}

function parseValuation(lines) {
  const joined = lines.join("\n");
  const rangeMatch = joined.match(/(?:entre|desde)\s+(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*€\s+(?:y|hasta)\s+(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*€/i);
  if (rangeMatch) {
    return {
      min_price: asNumber(rangeMatch[1]),
      max_price: asNumber(rangeMatch[2])
    };
  }

  const markerIndex = lines.findIndex((line) => /cu[aá]nto vale|casa m[aá]s barata/i.test(line));
  const prices = [];
  for (let index = Math.max(0, markerIndex); index < lines.length && prices.length < 2; index += 1) {
    const price = parseEuro(lines[index]);
    if (price) prices.push(price);
  }
  return {
    min_price: prices[0] || null,
    max_price: prices[1] || null
  };
}

function parseListingHistory(lines) {
  const joined = lines.join("\n");
  const count = asNumber(joined.match(/han estado publicados?\s+(\d+)\s+anuncios?/i)?.[1]);
  const detailed = joined.match(/(\d+)\s+pisos?.*?\(en\s+(\d{4})\)\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*€/i);
  return {
    count,
    average_price: detailed ? asNumber(detailed[3]) : null,
    year: detailed ? asNumber(detailed[2]) : null
  };
}

function parseNearbyServices(lines) {
  const joined = lines.join("\n");
  const distanceM = joined.match(/(?:transporte|parada|metro|tren|bus).*?(\d{1,4})\s*m/i)?.[1];
  const count = (regex) => asNumber(joined.match(regex)?.[1]) || 0;
  return {
    transport_count: count(/(\d+)\s+(?:transportes?|paradas?)/i),
    nearest_transport_distance_km: distanceM ? Math.round((asNumber(distanceM) / 1000) * 100) / 100 : null,
    bus_stop_count: count(/(\d+)\s+(?:paradas?\s+de\s+bus|autobuses?)/i),
    metro_train_count: count(/(\d+)\s+(?:metro|tren|tranv[ií]a)/i),
    supermarket_count: count(/(\d+)\s+supermercados?/i),
    school_count: count(/(\d+)\s+(?:colegios?|escuelas?)/i),
    health_count: count(/(\d+)\s+(?:centros?\s+de\s+salud|hospitales?)/i),
    pharmacy_count: count(/(\d+)\s+farmacias?/i)
  };
}

function calculateIntelConfidence(intel) {
  let confidence = 0.35;
  if (intel.address_full) confidence += 0.08;
  if (intel.building?.year_built) confidence += 0.08;
  if (intel.building?.has_lift !== null && intel.building?.has_lift !== undefined) confidence += 0.07;
  if (intel.units?.length) confidence += 0.08;
  if (intel.valuation?.min_price && intel.valuation?.max_price) confidence += 0.04;
  if (intel.cadastre_source) confidence += 0.06;
  return Math.round(Math.min(0.85, confidence) * 100) / 100;
}

function objectValue(source, path, fallback = null) {
  let value = source;
  for (const part of path) {
    if (value === null || value === undefined) return fallback;
    value = value[part];
  }
  return value === undefined ? fallback : value;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstDefined(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function catastroRefFromRc(rc = {}) {
  return [rc.pc1, rc.pc2, rc.car, rc.cc1, rc.cc2].filter(Boolean).join("") || null;
}

function addressFromCatastroBi(bi = {}, context = {}) {
  return firstDefined(
    bi.ldt,
    objectValue(bi, ["dt", "ldt"]),
    [
      context.street,
      context.street_number,
      context.postal_code,
      context.municipality,
      context.province
    ]
      .filter(Boolean)
      .join(", ")
  );
}

function parseCatastroPayload(payload, context = {}) {
  const consulta = payload?.consulta_dnp || payload;
  const bico = consulta?.bico || {};
  const bi = bico.bi || {};
  const rcdnpList = asArray(consulta?.lrcdnp?.rcdnp);
  const consList = asArray(bico?.lcons?.cons);
  const refs = [];
  const units = [];

  for (const item of rcdnpList) {
    const rc = item.rc || {};
    const ref = catastroRefFromRc(rc);
    if (ref) refs.push(ref);
    units.push({
      label: item.dt?.locs?.lous?.lourb?.loint?.pt || item.dt?.ldt || item.ldt || null,
      use_type: item.debi?.luso || item.debi?.dtip || null,
      surface_m2: asNumber(item.debi?.sfc),
      cadastral_ref: ref
    });
  }

  for (const item of consList) {
    units.push({
      label: [item.es, item.pt, item.pu].filter(Boolean).join(" ") || null,
      use_type: item.luso || item.dtip || null,
      surface_m2: asNumber(item.stl || item.sfc),
      cadastral_ref: catastroRefFromRc(bi.idbi?.rc || {})
    });
  }

  const mainRef = catastroRefFromRc(bi.idbi?.rc || {});
  if (mainRef) refs.push(mainRef);
  const buildingYear = asNumber(firstDefined(bi.debi?.ant, bi.debi?.anio));
  const surface = asNumber(firstDefined(bi.debi?.sfc, bi.debi?.sfs));
  const addressFull = addressFromCatastroBi(bi, context);

  const intel = {
    source: CATASTRO_SOURCE,
    source_url: context.source_url || null,
    address_full: addressFull,
    street: context.street || null,
    street_number: context.street_number || null,
    postal_code: context.postal_code || null,
    municipality: context.municipality || null,
    province: context.province || null,
    autonomous_community: context.autonomous_community || null,
    lat: context.lat || null,
    lng: context.lng || null,
    cadastre_source: "Dirección General de Catastro",
    building_refs: [...new Set(refs.filter(Boolean))],
    units: units.filter((unit) => unit.label || unit.use_type || unit.surface_m2 || unit.cadastral_ref),
    building: {
      plot_surface_m2: null,
      year_built: buildingYear,
      construction_quality: null,
      floors: null,
      neighbours_per_floor: null,
      has_lift: null,
      homes_count: null,
      commercial_units_count: null
    },
    valuation: {
      min_price: null,
      max_price: null
    },
    listing_history: {},
    nearby_services: {
      transport_count: 0,
      nearest_transport_distance_km: null,
      bus_stop_count: 0,
      metro_train_count: 0,
      supermarket_count: 0,
      school_count: 0,
      health_count: 0,
      pharmacy_count: 0
    },
    extracted_at: new Date().toISOString(),
    raw_payload: {
      parser: "catastro_dnp_loc_json_v1",
      source: "Dirección General de Catastro",
      main_surface_m2: surface,
      payload
    }
  };

  if (!intel.units.length && (surface || mainRef)) {
    intel.units.push({
      label: null,
      use_type: bi.debi?.luso || null,
      surface_m2: surface,
      cadastral_ref: mainRef
    });
  }

  const homeLike = intel.units.filter((unit) => /vivienda|residencial/i.test(String(unit.use_type || ""))).length;
  const commercialLike = intel.units.filter((unit) => /comerc|local/i.test(String(unit.use_type || ""))).length;
  intel.building.homes_count = homeLike || null;
  intel.building.commercial_units_count = commercialLike || null;
  intel.confidence_score = calculateIntelConfidence(intel);
  return intel;
}

function catastroErrors(payload = {}) {
  const errors = asArray(
    payload?.consulta_dnp?.lerr?.err ||
      payload?.consulta_callejero?.lerr?.err ||
      payload?.consulta_numerero?.lerr?.err ||
      payload?.lerr?.err
  );
  const control =
    payload?.consulta_dnp?.control ||
    payload?.consulta_callejero?.control ||
    payload?.consulta_numerero?.control ||
    payload?.control ||
    {};
  if (!errors.length && asNumber(control.cuerr) > 0) {
    return [{ cod: "unknown", des: "Catastro devolvió errores sin detalle" }];
  }
  return errors;
}

function hasUsefulCatastroIntel(intel = {}) {
  if (!intel || intel.source !== CATASTRO_SOURCE) return false;
  return hasUsefulAddressIntel(intel);
}

function hasUsefulAddressIntel(intel = {}) {
  if (!intel) return false;
  if ((intel.building_refs || []).length) return true;
  if ((intel.units || []).some((unit) => unit.cadastral_ref || unit.surface_m2 || unit.use_type)) return true;
  if (intel.building?.year_built) return true;
  if (intel.building?.has_lift !== null && intel.building?.has_lift !== undefined) return true;
  if (intel.building?.floors || intel.building?.homes_count || intel.building?.commercial_units_count) return true;
  if (intel.valuation?.min_price || intel.valuation?.max_price) return true;
  const nearby = intel.nearby_services || {};
  if (nearby.nearest_transport_distance_km !== null && nearby.nearest_transport_distance_km !== undefined) return true;
  return Object.values(nearby).some((value) => Number(value) > 0);
}

function parseIdealistaMapsHtml(html, context = {}) {
  const lines = htmlToLines(html);
  const address = parseAddress(lines, context);
  const building = parseBuilding(lines);
  const units = parseUnits(lines);
  const valuation = parseValuation(lines);
  const listingHistory = parseListingHistory(lines);
  const nearbyServices = parseNearbyServices(lines);
  const hasCadastre = lines.some((line) => /catastro/i.test(line));

  const intel = {
    source: IDEALISTA_MAPS_SOURCE,
    source_url: context.source_url || null,
    address_full: address.address_full,
    street: context.street || null,
    street_number: context.street_number || null,
    postal_code: address.postal_code,
    municipality: context.municipality || null,
    province: context.province || null,
    autonomous_community: context.autonomous_community || null,
    lat: context.lat || null,
    lng: context.lng || null,
    cadastre_source: hasCadastre ? "Dirección General de Catastro" : null,
    building_refs: units.map((unit) => unit.cadastral_ref).filter(Boolean),
    units,
    building,
    valuation,
    listing_history: listingHistory,
    nearby_services: nearbyServices,
    extracted_at: new Date().toISOString(),
    raw_payload: {
      parser: "idealista_maps_html_v1",
      line_count: lines.length,
      text_excerpt: lines.slice(0, 80).join("\n")
    }
  };
  intel.confidence_score = calculateIntelConfidence(intel);
  return intel;
}

function floorNumber(value) {
  const normalized = String(value || "").toLowerCase();
  if (/\b(bajo|bj|ground)\b/.test(normalized)) return 0;
  const match = normalized.match(/-?\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function compareAgainstValuation(listing = {}, addressIntel = {}) {
  const price = asNumber(listing.price_total || listing.listing_price_total);
  const surface = asNumber(listing.surface_m2 || listing.listing_area_m2);
  const minPrice = asNumber(addressIntel.valuation?.min_price);
  const maxPrice = asNumber(addressIntel.valuation?.max_price);
  if (!price || !minPrice || !maxPrice) return null;

  const comparableSurfaceFound = surface
    ? Boolean((addressIntel.units || []).some((unit) => {
        const unitSurface = asNumber(unit.surface_m2);
        if (!unitSurface) return false;
        return Math.abs(unitSurface - surface) / surface <= 0.18;
      }))
    : false;

  return {
    min_price: minPrice,
    max_price: maxPrice,
    relation: price < minPrice ? "below_range" : price > maxPrice ? "above_range" : "inside_range",
    comparable_surface_found: comparableSurfaceFound
  };
}

function calculateAddressPriceAdjustment(listing = {}, addressIntel = {}) {
  const caveats = [];
  const positive_signals = [];
  const warning_signals = [];
  const building = addressIntel.building || {};
  const nearby = addressIntel.nearby_services || {};
  const floor = floorNumber(listing.floor);

  if (building.has_lift === false && floor !== null && floor >= 3) {
    warning_signals.push("sin_ascensor_planta_alta");
    caveats.push("La finca figura sin ascensor y el anuncio parece estar en planta alta; conviene revisar si el precio lo compensa.");
  } else if (building.has_lift === false) {
    warning_signals.push("edificio_sin_ascensor");
    caveats.push("La finca figura sin ascensor.");
  }

  if (building.year_built && building.year_built < 1970) {
    warning_signals.push("edificio_antiguo");
    caveats.push("Edificio antiguo; revisa estado, instalaciones y posibles reformas.");
  }

  if (nearby.nearest_transport_distance_km !== null && nearby.nearest_transport_distance_km <= 0.2) {
    positive_signals.push("transporte_cercano");
  }
  if ((nearby.supermarket_count || 0) >= 3) {
    positive_signals.push("servicios_cercanos");
  }

  const valuationComparison = compareAgainstValuation(listing, addressIntel);
  if (valuationComparison?.relation === "above_range") {
    warning_signals.push("por_encima_rango_direccion");
    caveats.push("El precio queda por encima del rango orientativo detectado para la dirección; úsalo solo como contexto, no como tasación.");
  }
  if (valuationComparison?.relation === "below_range") {
    positive_signals.push("por_debajo_rango_direccion");
    caveats.push("El precio queda por debajo del rango orientativo detectado para la dirección, pero ese rango no sustituye una valoración profesional.");
  }
  if (valuationComparison && !valuationComparison.comparable_surface_found) {
    caveats.push("El rango de dirección puede corresponder a otras unidades del edificio, no necesariamente a esta vivienda concreta.");
  }

  return {
    caveats: [...new Set(caveats)],
    positive_signals,
    warning_signals,
    valuation_comparison: valuationComparison
  };
}

function publicIntelPayload(intel, cache = { hit: false }) {
  return {
    ok: true,
    ...intel,
    cache
  };
}

function rowToIntel(row) {
  if (!row) return null;
  return {
    source: row.source,
    source_url: row.source_url,
    normalized_address_key: row.normalized_address_key,
    address_full: row.address_full,
    street: row.street,
    street_number: row.street_number,
    postal_code: row.postal_code,
    municipality: row.municipality,
    province: row.province,
    autonomous_community: row.autonomous_community,
    lat: row.lat,
    lng: row.lng,
    cadastre_source: row.raw_payload?.cadastre_source || null,
    building_refs: row.raw_payload?.building_refs || [],
    units: row.units_json || [],
    building: {
      plot_surface_m2: row.plot_surface_m2,
      year_built: row.building_year,
      construction_quality: row.construction_quality,
      floors: row.floors,
      neighbours_per_floor: row.raw_payload?.building?.neighbours_per_floor ?? null,
      has_lift: row.has_lift,
      homes_count: row.homes_count,
      commercial_units_count: row.commercial_units_count
    },
    valuation: {
      min_price: row.valuation_min_price,
      max_price: row.valuation_max_price
    },
    listing_history: row.raw_payload?.listing_history || {},
    nearby_services: row.nearby_services_json || {},
    raw_payload: row.raw_payload,
    confidence_score: row.confidence_score,
    extracted_at: row.extracted_at
  };
}

function intelToRow(intel, key, expiresAt) {
  return {
    normalized_address_key: key,
    source: intel.source || IDEALISTA_MAPS_SOURCE,
    source_url: intel.source_url,
    address_full: intel.address_full,
    street: intel.street,
    street_number: intel.street_number,
    postal_code: intel.postal_code,
    municipality: intel.municipality,
    province: intel.province,
    autonomous_community: intel.autonomous_community,
    lat: intel.lat,
    lng: intel.lng,
    building_year: intel.building?.year_built,
    has_lift: intel.building?.has_lift,
    floors: intel.building?.floors,
    homes_count: intel.building?.homes_count,
    commercial_units_count: intel.building?.commercial_units_count,
    plot_surface_m2: intel.building?.plot_surface_m2,
    construction_quality: intel.building?.construction_quality,
    valuation_min_price: intel.valuation?.min_price,
    valuation_max_price: intel.valuation?.max_price,
    units_json: intel.units || [],
    nearby_services_json: intel.nearby_services || {},
    raw_payload: {
      ...(intel.raw_payload || {}),
      cadastre_source: intel.cadastre_source,
      building_refs: intel.building_refs,
      building: intel.building,
      listing_history: intel.listing_history
    },
    confidence_score: intel.confidence_score,
    extracted_at: intel.extracted_at,
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  };
}

function getMemoryCache(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (new Date(item.expires_at).getTime() <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  if (!hasUsefulAddressIntel(item.value)) {
    memoryCache.delete(key);
    return null;
  }
  return item.value;
}

function setMemoryCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  memoryCache.set(key, {
    value,
    expires_at: new Date(Date.now() + ttlMs).toISOString()
  });
}

async function getPersistentCache(key) {
  if (!hasSupabaseConfig()) return null;
  const params = new URLSearchParams({
    select: "*",
    normalized_address_key: `eq.${key}`,
    expires_at: `gt.${new Date().toISOString()}`,
    limit: "1"
  });
  const rows = await supabaseFetch(`address_intelligence_cache?${params.toString()}`);
  const intel = rowToIntel(Array.isArray(rows) ? rows[0] : null);
  return hasUsefulAddressIntel(intel) ? intel : null;
}

async function setPersistentCache(key, intel, ttlMs = DEFAULT_TTL_MS) {
  if (!hasSupabaseConfig()) return;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await supabaseFetch("address_intelligence_cache?on_conflict=normalized_address_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(intelToRow(intel, key, expiresAt))
  });
}

async function getCachedAddressIntel(key) {
  const memory = getMemoryCache(key);
  if (memory) return { value: memory, cache: { hit: true, layer: "memory" } };
  const persistent = await getPersistentCache(key).catch(() => null);
  if (persistent) {
    setMemoryCache(key, persistent);
    return { value: persistent, cache: { hit: true, layer: "supabase" } };
  }
  return null;
}

async function setCachedAddressIntel(key, intel, ttlMs = DEFAULT_TTL_MS) {
  setMemoryCache(key, intel, ttlMs);
  await setPersistentCache(key, intel, ttlMs).catch((error) => {
    console.warn("[address-intelligence] cache write failed", error.message);
  });
}

function clearAddressIntelCache() {
  memoryCache.clear();
  rateLimitBuckets.clear();
}

function checkAddressRateLimit(bucketKey, now = Date.now()) {
  const key = String(bucketKey || "anonymous");
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return {
    allowed: bucket.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - bucket.count),
    reset_at: new Date(bucket.resetAt).toISOString()
  };
}

function withTimeout(ms = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer)
  };
}

async function fetchIdealistaMapsHtml(sourceUrl, fetchImpl = fetch) {
  const timeout = withTimeout();
  try {
    const response = await fetchImpl(sourceUrl, {
      signal: timeout.signal,
      headers: {
        "user-agent": "InmoRadarAddressIntelligence/1.0 (+https://www.inmoradar.app)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "es-ES,es;q=0.9,en;q=0.8"
      }
    });
    if (response.status === 404) return { ok: false, reason: "maps_not_found", status: 404 };
    if (!response.ok) return { ok: false, reason: "maps_fetch_failed", status: response.status };
    return { ok: true, html: await response.text() };
  } catch (error) {
    return { ok: false, reason: error?.name === "AbortError" ? "maps_timeout" : "maps_fetch_failed" };
  } finally {
    timeout.done();
  }
}

function buildCatastroDnpLocUrl(input = {}) {
  const split = splitSpanishStreetType(input.street);
  const tipoVia = input.tipo_via || input.catastro_tipo_via || split.tipo_via;
  const nomVia = input.nom_via || input.catastro_nom_via || split.nom_via;
  const url = new URL(CATASTRO_DNPLOC_URL);
  url.searchParams.set("Provincia", input.province || "");
  url.searchParams.set("Municipio", input.municipality || "");
  url.searchParams.set("TipoVia", tipoVia);
  url.searchParams.set("NomVia", nomVia);
  url.searchParams.set("Numero", input.street_number || "");
  return url.toString();
}

function buildCatastroViaUrl(input = {}) {
  const split = splitSpanishStreetType(input.street);
  const url = new URL(CATASTRO_VIA_URL);
  url.searchParams.set("Provincia", input.province || "");
  url.searchParams.set("Municipio", input.municipality || "");
  url.searchParams.set("TipoVia", input.tipo_via || split.tipo_via);
  url.searchParams.set("NomVia", input.nom_via || split.nom_via);
  return url.toString();
}

function buildCatastroNumeroUrl(input = {}, via = {}) {
  const split = splitSpanishStreetType(input.street);
  const url = new URL(CATASTRO_NUMERO_URL);
  url.searchParams.set("Provincia", input.province || "");
  url.searchParams.set("Municipio", input.municipality || "");
  url.searchParams.set("TipoVia", via.tipo_via || input.tipo_via || split.tipo_via);
  url.searchParams.set("NomVia", via.nom_via || input.nom_via || split.nom_via);
  url.searchParams.set("Numero", input.street_number || "");
  return url.toString();
}

async function fetchCatastroJson(sourceUrl, fetchImpl = fetch) {
  const timeout = withTimeout();
  try {
    const response = await fetchImpl(sourceUrl, {
      signal: timeout.signal,
      headers: {
        "user-agent": "InmoRadarAddressIntelligence/1.0 (+https://www.inmoradar.app)",
        accept: "application/json,text/plain,*/*"
      }
    });
    if (!response.ok) {
      return { ok: false, reason: "catastro_fetch_failed", status: response.status, source_url: sourceUrl };
    }
    return { ok: true, payload: await response.json(), source_url: sourceUrl };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "catastro_timeout" : "catastro_fetch_failed",
      source_url: sourceUrl
    };
  } finally {
    timeout.done();
  }
}

function parseCatastroViaCandidates(payload = {}) {
  const calles = asArray(payload?.consulta_callejero?.callejero?.calle || payload?.callejero?.calle);
  return calles
    .map((calle) => ({
      tipo_via: calle?.dir?.tv || "",
      nom_via: calle?.dir?.nv || "",
      codigo_via: calle?.dir?.cv || "",
      raw: calle
    }))
    .filter((candidate) => candidate.nom_via)
    .slice(0, 8);
}

function parseCatastroNumeroCandidates(payload = {}) {
  const numeros = asArray(payload?.consulta_numerero?.numerero?.nump || payload?.numerero?.nump);
  return numeros
    .map((item) => {
      const number = [item?.num?.pnp, item?.num?.plp].filter(Boolean).join("");
      return {
        street_number: number || null,
        pc1: item?.pc?.pc1 || null,
        pc2: item?.pc?.pc2 || null,
        raw: item
      };
    })
    .filter((candidate) => candidate.street_number)
    .slice(0, 10);
}

function pickBestNumberCandidate(candidates, requestedNumber) {
  const requested = normalizeText(requestedNumber);
  return (
    candidates.find((candidate) => normalizeText(candidate.street_number) === requested) ||
    candidates.find((candidate) => normalizeText(candidate.street_number).startsWith(requested)) ||
    candidates[0] ||
    null
  );
}

async function fetchCatastroIntelDirect(input, sourceUrl, fetchImpl) {
  const fetched = await fetchCatastroJson(sourceUrl, fetchImpl);
  if (!fetched.ok) return fetched;
  const errors = catastroErrors(fetched.payload);
  if (errors.length) {
    return {
      ok: false,
      reason: "catastro_not_found",
      status: 404,
      source_url: sourceUrl,
      errors
    };
  }

  const intel = parseCatastroPayload(fetched.payload, { ...input, source_url: sourceUrl });
  if (!hasUsefulCatastroIntel(intel)) {
    return { ok: false, reason: "catastro_parse_empty", source_url: sourceUrl };
  }
  return { ok: true, intel };
}

async function fetchCatastroIntelWithCandidates(input = {}, fetchImpl = fetch) {
  const viaUrl = buildCatastroViaUrl(input);
  const viaResponse = await fetchCatastroJson(viaUrl, fetchImpl);
  if (!viaResponse.ok || catastroErrors(viaResponse.payload).length) {
    return {
      ok: false,
      reason: "catastro_via_not_found",
      source_url: viaUrl,
      errors: viaResponse.payload ? catastroErrors(viaResponse.payload) : []
    };
  }

  const vias = parseCatastroViaCandidates(viaResponse.payload);
  for (const via of vias) {
    const numeroUrl = buildCatastroNumeroUrl(input, via);
    const numeroResponse = await fetchCatastroJson(numeroUrl, fetchImpl);
    if (!numeroResponse.ok || catastroErrors(numeroResponse.payload).length) continue;

    const numbers = parseCatastroNumeroCandidates(numeroResponse.payload);
    const number = pickBestNumberCandidate(numbers, input.street_number);
    if (!number) continue;

    const dnpInput = {
      ...input,
      tipo_via: via.tipo_via,
      nom_via: via.nom_via,
      street_number: number.street_number || input.street_number
    };
    const dnpUrl = buildCatastroDnpLocUrl(dnpInput);
    const direct = await fetchCatastroIntelDirect(
      {
        ...dnpInput,
        street: [via.tipo_via, via.nom_via].filter(Boolean).join(" ")
      },
      dnpUrl,
      fetchImpl
    );
    if (direct.ok) {
      direct.intel.raw_payload = {
        ...(direct.intel.raw_payload || {}),
        catastro_candidate_flow: {
          via_url: viaUrl,
          numero_url: numeroUrl,
          dnp_url: dnpUrl,
          via,
          number
        }
      };
      return direct;
    }
  }

  return { ok: false, reason: "catastro_candidates_not_found", source_url: viaUrl };
}

async function fetchCatastroAddressIntel(input = {}, fetchImpl = fetch) {
  const sourceUrl = buildCatastroDnpLocUrl(input);
  const direct = await fetchCatastroIntelDirect(input, sourceUrl, fetchImpl);
  if (direct.ok) return direct;
  const candidate = await fetchCatastroIntelWithCandidates(input, fetchImpl);
  if (candidate.ok) return candidate;
  return {
    ...direct,
    candidate_reason: candidate.reason,
    candidate_source_url: candidate.source_url
  };
}

function normalizeInput(input = {}) {
  const split = splitStreetAndNumber(input.address);
  return {
    address: String(input.address || "").trim(),
    street: String(input.street || split.street || "").trim(),
    street_number: String(input.street_number || input.number || split.street_number || "").trim(),
    municipality: String(input.municipality || "").trim(),
    province: String(input.province || "").trim(),
    autonomous_community: String(input.autonomous_community || "").trim(),
    postal_code: String(input.postal_code || "").trim(),
    lat: input.lat || null,
    lng: input.lng || null
  };
}

function validateAddressInput(input) {
  if (!input.street || !input.street_number || !input.municipality || !input.province) {
    return {
      ok: false,
      reason: "insufficient_address_parts",
      message: "No se han detectado suficientes datos de dirección para consultar información del edificio."
    };
  }
  return { ok: true };
}

async function buildAddressIntelligenceResponse(rawInput = {}, options = {}) {
  const input = normalizeInput(rawInput);
  const validation = validateAddressInput(input);
  if (!validation.ok) {
    return { ok: false, ...validation, address_intelligence: null };
  }

  const key = normalizedAddressKey(input);
  const cached = options.skipCache ? null : await getCachedAddressIntel(key);
  if (cached) {
    return publicIntelPayload({ ...cached.value, normalized_address_key: key }, cached.cache);
  }

  const sourceUrl = options.sourceUrl || buildIdealistaMapsUrl(input);
  if (!sourceUrl) {
    return {
      ok: false,
      reason: "maps_url_not_buildable",
      message: "No se ha podido construir una URL probable de idealista/maps.",
      address_intelligence: null
    };
  }

  const fetched = options.html
    ? { ok: true, html: options.html }
    : await fetchIdealistaMapsHtml(sourceUrl, options.fetchImpl || fetch);
  if (!fetched.ok) {
    if (options.useCatastroFallback !== false) {
      const catastro = options.catastroPayload
        ? { ok: true, intel: parseCatastroPayload(options.catastroPayload, { ...input, source_url: "catastro:mock" }) }
        : await fetchCatastroAddressIntel(input, options.catastroFetchImpl || options.fetchImpl || fetch);

      if (catastro.ok) {
        catastro.intel.normalized_address_key = key;
        catastro.intel.raw_payload = {
          ...(catastro.intel.raw_payload || {}),
          idealista_maps_status: {
            reason: fetched.reason,
            status: fetched.status || null,
            source_url: sourceUrl
          }
        };
        await setCachedAddressIntel(key, catastro.intel, options.ttlMs || DEFAULT_TTL_MS);
        return publicIntelPayload(catastro.intel, { hit: false, layer: "catastro_fallback" });
      }
    }

    return {
      ok: false,
      reason: fetched.reason,
      status: fetched.status || null,
      message: "No se han podido obtener datos adicionales del edificio.",
      source_url: sourceUrl,
      address_intelligence: null
    };
  }

  const intel = parseIdealistaMapsHtml(fetched.html, { ...input, source_url: sourceUrl });
  if (!intel.address_full && !intel.units.length && !intel.building?.year_built) {
    return {
      ok: false,
      reason: "maps_parse_empty",
      message: "No se han podido interpretar datos útiles de idealista/maps.",
      source_url: sourceUrl,
      address_intelligence: null
    };
  }

  intel.normalized_address_key = key;
  await setCachedAddressIntel(key, intel, options.ttlMs || DEFAULT_TTL_MS);
  return publicIntelPayload(intel, { hit: false, layer: "network" });
}

module.exports = {
  DEFAULT_TTL_MS,
  buildAddressIntelligenceResponse,
  buildCatastroDnpLocUrl,
  buildCatastroNumeroUrl,
  buildCatastroViaUrl,
  buildIdealistaMapsUrl,
  calculateAddressPriceAdjustment,
  checkAddressRateLimit,
  clearAddressIntelCache,
  fetchCatastroAddressIntel,
  fetchIdealistaMapsHtml,
  getCachedAddressIntel,
  normalizedAddressKey,
  parseCatastroPayload,
  parseCatastroNumeroCandidates,
  parseCatastroViaCandidates,
  parseIdealistaMapsHtml,
  setCachedAddressIntel,
  hasUsefulAddressIntel,
  splitSpanishStreetType,
  slugifyIdealistaMapsPart
};
