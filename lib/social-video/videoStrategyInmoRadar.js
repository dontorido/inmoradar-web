const crypto = require("node:crypto");

const DATA_FALLBACKS = Object.freeze({
  missing: "dato no disponible",
  unclear: "no aparece claro en el anuncio",
  check: "conviene comprobarlo antes de contactar"
});

const ALLOWED_VERDICTS = Object.freeze([
  "Yo lo guardaria, pero no lo pondria como primera visita.",
  "Yo pediria mas informacion antes de visitar.",
  "Yo lo compararia con opciones cercanas.",
  "Yo lo descartaria si el presupuesto es ajustado.",
  "Yo si lo visitaria si la zona encaja.",
  "No parece un chollo, pero tampoco una mala opcion.",
  "Interesante, pero con senales a revisar.",
  "Buena pinta, aunque conviene validar costes.",
  "Parece competitivo para la zona, con matices.",
  "No llamaria todavia sin comparar dos o tres opciones mas."
]);

const DISCLAIMERS = Object.freeze([
  "Estimaciones orientativas.",
  "No es una tasacion.",
  "Comprueba siempre la informacion.",
  "Datos sujetos a disponibilidad.",
  "Usalo como filtro, no como decision final."
]);

const CTA_LIBRARY = Object.freeze({
  comments: [
    "¿Lo visitarias?",
    "Comenta SI o NO.",
    "¿A o B?",
    "¿Chollo o humo?",
    "¿Que mirarias tu?",
    "Mandame un piso y lo analizo."
  ],
  saves: [
    "Guardalo si estas buscando vivienda.",
    "Guarda este checklist.",
    "Te servira antes de llamar.",
    "Guardalo para tu proxima visita."
  ],
  conversion: [
    "Pasalo por InmoRadar antes de contactar.",
    "Analiza tu proximo anuncio gratis.",
    "Link en bio para probarlo.",
    "Busca donde ya buscas, pero con mas criterio.",
    "Instala InmoRadar y analiza tu primer piso."
  ],
  share: [
    "Envialo a alguien que este buscando piso.",
    "Mandaselo a tu pareja si estais mirando vivienda.",
    "Compartelo con quien este a punto de visitar un piso."
  ]
});

const CAPTION_LIBRARY = Object.freeze([
  "No todo piso barato es buena compra. Mira el contexto.",
  "Antes de contactar, mira precio, entrada, cuota y zona.",
  "El anuncio ensena fotos. Los numeros cuentan otra historia.",
  "Buscar piso no deberia ser una investigacion con 15 pestanas.",
  "Menos pestanas. Mas criterio.",
  "¿Lo visitarias o lo descartarias?",
  "El barato no siempre es el mejor.",
  "Antes de enamorarte de un piso, mira los numeros.",
  "Pasa tu proximo anuncio por InmoRadar antes de llamar.",
  "Una vivienda puede parecer buena hasta que comparas."
]);

const HASHTAGS = Object.freeze({
  product: ["#InmoRadar", "#AntesDeContactar", "#AntesDeLlamar", "#CholloOHumo"],
  search: ["#BuscarPiso", "#ComprarPiso", "#ComprarCasa", "#Vivienda", "#PisoEnVenta", "#MercadoInmobiliario"],
  finance: ["#Hipoteca", "#FinanzasPersonales", "#Ahorro", "#InversionInmobiliaria"],
  format: ["#PisoAvsPisoB", "#AnalizandoPisos", "#ErroresInmobiliarios", "#ChecklistVivienda"],
  location: {
    madrid: "#Madrid",
    barcelona: "#Barcelona",
    valencia: "#Valencia",
    malaga: "#Malaga",
    sevilla: "#Sevilla",
    bilbao: "#Bilbao",
    zaragoza: "#Zaragoza",
    alicante: "#Alicante"
  }
});

const HOOK_BANKS = Object.freeze({
  curiosidad: [
    "Este piso parece bueno, pero hay un detalle.",
    "Hay algo raro en este anuncio.",
    "No llamaria sin mirar esto antes.",
    "Este piso divide opiniones.",
    "A simple vista parece bien, pero..."
  ],
  polemica: [
    "No todo piso barato es una oportunidad.",
    "El precio no te cuenta toda la historia.",
    "Este anuncio vende una cosa, los numeros otra.",
    "La foto enamora, pero los datos mandan.",
    "Yo no visitaria este piso sin comparar."
  ],
  educativa: [
    "Antes de contactar, mira estas 5 cosas.",
    "Como saber si un piso esta caro.",
    "Que revisar antes de visitar una vivienda.",
    "Como comparar pisos sin volverte loco.",
    "El checklist rapido antes de llamar."
  ],
  interaccion: [
    "¿Lo visitarias si o no?",
    "Piso A o Piso B.",
    "¿Chollo o humo?",
    "¿Llamarias por este anuncio?",
    "¿Que nota le pondrias a este piso?"
  ],
  build: [
    "Estoy creando una herramienta para buscar piso con mas criterio.",
    "He creado una capa de analisis para Idealista y Fotocasa.",
    "Estoy probando una funcion nueva de InmoRadar.",
    "Asi analiza InmoRadar un anuncio.",
    "Necesito gente que este buscando piso para probar esto."
  ]
});

const seriesConfig = Object.freeze({
  chollo_o_humo: {
    id: "chollo_o_humo",
    name: "¿Chollo o humo?",
    objective: "Analizar un anuncio que parece bueno pero puede tener matices.",
    durationRange: [15, 35],
    hookTemplates: [
      "Este piso parece un chollo... pero espera.",
      "El anuncio dice oportunidad. Los numeros dicen otra cosa.",
      "Este precio parece bueno, hasta que miras el coste real.",
      "¿Chollo o humo? Vamos a mirarlo bien.",
      "Este piso me hizo dudar. Mira por que."
    ],
    scriptTemplates: ["precio", "metros", "precio_m2", "entrada_estimada", "cuota_estimada", "transporte", "aparcamiento", "score", "veredicto"],
    visualTemplates: [
      "Anuncio inmobiliario anonimizado con precio grande.",
      "Zoom a precio y metros, sin mostrar direccion exacta.",
      "Tarjeta de precio por metro cuadrado.",
      "Bloque de entrada estimada y cuota orientativa.",
      "Mapa abstracto de zona, transporte y aparcamiento.",
      "Ficha InmoRadar con score y veredicto prudente."
    ],
    ctaOptions: ["¿Lo visitarias?", "Comenta SI o NO.", "Mandame un piso y lo analizo."],
    requiredVariables: ["precio", "metros"],
    optionalVariables: ["precio_m2", "entrada_estimada", "cuota_estimada", "transporte", "aparcamiento", "score", "veredicto"],
    riskLevel: "medium",
    bestForPlatform: ["tiktok", "reels", "shorts"]
  },
  antes_de_llamar: {
    id: "antes_de_llamar",
    name: "Antes de llamar",
    objective: "Educar sobre los puntos que conviene revisar antes de contactar.",
    durationRange: [20, 35],
    hookTemplates: [
      "Antes de llamar por un piso, mira esto.",
      "No contactes con un anuncio sin revisar estas 5 cosas.",
      "Si estas buscando piso, guarda este checklist.",
      "Antes de enamorarte de un piso, mira los numeros.",
      "El error es llamar antes de entender el coste real."
    ],
    scriptTemplates: ["precio_m2", "entrada_estimada", "cuota_estimada", "transporte", "zona", "aparcamiento"],
    visualTemplates: [
      "Checklist rapido sobre fondo de anuncio anonimizado.",
      "Cinco tarjetas numeradas con datos clave.",
      "Mockup de ficha InmoRadar sobre un portal inmobiliario.",
      "Cierre guardable con checklist en pantalla."
    ],
    ctaOptions: ["Guardalo si estas buscando vivienda.", "Te servira antes de llamar.", "Pasalo por InmoRadar antes de contactar."],
    requiredVariables: [],
    optionalVariables: ["precio_m2", "entrada_estimada", "cuota_estimada", "transporte", "senal_zona", "aparcamiento"],
    riskLevel: "low",
    bestForPlatform: ["tiktok", "reels", "shorts", "linkedin"]
  },
  piso_a_vs_piso_b: {
    id: "piso_a_vs_piso_b",
    name: "Piso A vs Piso B",
    objective: "Provocar comentarios comparando dos opciones con el mismo presupuesto.",
    durationRange: [20, 40],
    hookTemplates: [
      "Dos pisos por el mismo precio. Uno merece mas la visita.",
      "Piso A o Piso B: ¿cual elegirias?",
      "El barato no siempre es el mejor.",
      "Mismo precio, decisiones muy distintas.",
      "Uno tiene mejor pinta. El otro tiene mejores numeros."
    ],
    scriptTemplates: ["precio_base", "metros_a", "precio_m2_a", "score_a", "metros_b", "precio_m2_b", "score_b", "ventaja_a", "ventaja_b"],
    visualTemplates: [
      "Split screen con Piso A y Piso B anonimizados.",
      "Comparativa de metros y precio por metro.",
      "Tarjetas de entrada, cuota, transporte y score.",
      "Veredicto final con pregunta binaria."
    ],
    ctaOptions: ["¿A o B?", "¿Tu cual visitarias primero?", "Comenta A o B."],
    requiredVariables: ["precio_base"],
    optionalVariables: ["metros_a", "metros_b", "precio_m2_a", "precio_m2_b", "score_a", "score_b", "ventaja_a", "ventaja_b", "veredicto"],
    riskLevel: "medium",
    bestForPlatform: ["tiktok", "reels", "shorts"]
  },
  pisos_seguidores: {
    id: "pisos_seguidores",
    name: "Analizando pisos de seguidores",
    objective: "Crear loop de comentarios y UGC con pisos enviados por la audiencia.",
    durationRange: [20, 40],
    hookTemplates: [
      "Me habeis mandado este piso. Vamos a analizarlo.",
      "Analizo el piso que me ha pasado un seguidor.",
      "¿Merece la pena este piso? Vamos a verlo.",
      "Me mandaron este anuncio y hay una cosa interesante.",
      "Hoy analizamos un piso real que me habeis enviado."
    ],
    scriptTemplates: ["precio", "metros", "precio_m2", "entrada_estimada", "cuota_estimada", "zona_resumen", "score", "accion_recomendada", "razon_principal"],
    visualTemplates: [
      "Anuncio recibido por mensaje, direccion tapada.",
      "Datos principales en tarjetas grandes.",
      "Mockup de analisis InmoRadar con datos sensibles ocultos.",
      "Cierre pidiendo el siguiente piso."
    ],
    ctaOptions: ["Mandame otro piso y lo analizo.", "¿Lo visitarias?", "Comenta que revisarias tu."],
    requiredVariables: ["precio", "metros"],
    optionalVariables: ["precio_m2", "entrada_estimada", "cuota_estimada", "zona_resumen", "score", "accion_recomendada", "razon_principal"],
    riskLevel: "high",
    bestForPlatform: ["tiktok", "reels", "shorts"]
  },
  errores_buscar_piso: {
    id: "errores_buscar_piso",
    name: "Errores buscando piso",
    objective: "Crear piezas educativas, guardables y compartibles.",
    durationRange: [20, 40],
    hookTemplates: [
      "Error tipico al buscar piso: mirar solo el precio.",
      "El precio no es lo importante. Mira esto.",
      "Si estas buscando vivienda, no cometas este error.",
      "Mucha gente compara pisos mal.",
      "Este error te hace perder visitas."
    ],
    scriptTemplates: ["error", "ejemplo", "consecuencia", "solucion"],
    visualTemplates: [
      "Texto grande de error sobre anuncio anonimizado.",
      "Comparativa simple de dos precios aparentes.",
      "Tarjetas de coste real: metros, entrada, cuota y zona.",
      "Ficha InmoRadar como resumen, no como anuncio."
    ],
    ctaOptions: ["Guardalo si estas buscando vivienda.", "Guarda este checklist.", "Envialo a alguien que este buscando piso."],
    requiredVariables: [],
    optionalVariables: ["precio", "precio_alt", "metros", "transporte", "entrada_estimada", "senal_zona"],
    riskLevel: "low",
    bestForPlatform: ["tiktok", "reels", "shorts", "linkedin"]
  },
  parecen_baratos: {
    id: "parecen_baratos",
    name: "Pisos que parecen baratos",
    objective: "Usar contraste entre percepcion inicial y lectura de contexto.",
    durationRange: [15, 30],
    hookTemplates: [
      "Este piso parece barato, pero quiza no lo es.",
      "Precio bajo no siempre significa buena compra.",
      "Este piso cuesta menos, pero mira el contexto.",
      "Cuando un piso parece ganga, mira esto.",
      "Lo barato tambien puede salir caro."
    ],
    scriptTemplates: ["precio", "metros", "precio_m2", "entrada_estimada", "cuota_estimada", "senal_zona", "veredicto"],
    visualTemplates: [
      "Precio bajo destacado con signo de duda.",
      "Zoom a metros y precio por metro.",
      "Coste inicial y cuota orientativa.",
      "Senal de zona o transporte con veredicto."
    ],
    ctaOptions: ["¿Te parece barato o no?", "¿Lo visitarias?", "Comenta SI o NO."],
    requiredVariables: ["precio"],
    optionalVariables: ["metros", "precio_m2", "entrada_estimada", "cuota_estimada", "senal_zona", "veredicto"],
    riskLevel: "medium",
    bestForPlatform: ["tiktok", "reels", "shorts"]
  },
  lo_visitarias: {
    id: "lo_visitarias",
    name: "¿Lo visitarias?",
    objective: "Generar debate y comentarios con decision binaria.",
    durationRange: [15, 25],
    hookTemplates: [
      "¿Visitarias este piso si o no?",
      "Tienes 10 segundos para decidir si llamarias.",
      "Yo tengo dudas con este piso.",
      "Este anuncio divide opiniones.",
      "¿Lo descartarias o pedirias visita?"
    ],
    scriptTemplates: ["precio", "metros", "entrada_estimada", "pros", "contras", "score", "veredicto_corto"],
    visualTemplates: [
      "Datos clave con temporizador visual.",
      "Tres pros en columna izquierda.",
      "Tres contras en columna derecha.",
      "Pregunta final grande: SI o NO."
    ],
    ctaOptions: ["Comenta SI o NO.", "¿Lo visitarias?", "¿Que nota le pondrias?"],
    requiredVariables: ["precio", "metros"],
    optionalVariables: ["entrada_estimada", "pros", "contras", "score", "veredicto_corto"],
    riskLevel: "medium",
    bestForPlatform: ["tiktok", "reels", "shorts"]
  },
  mitos_inmobiliarios: {
    id: "mitos_inmobiliarios",
    name: "Mitos inmobiliarios",
    objective: "Romper creencias comunes con ejemplos responsables.",
    durationRange: [20, 40],
    hookTemplates: [
      "Mito: el piso mas barato es el mejor.",
      "Mito: si esta cerca del metro siempre compensa.",
      "Mito: el precio del anuncio es el coste real.",
      "Mito: todos los pisos caros estan inflados.",
      "Mito: con ver fotos ya sabes si merece la pena."
    ],
    scriptTemplates: ["mito", "realidad", "percepcion", "senal_clave"],
    visualTemplates: [
      "Pantalla Mito vs Realidad.",
      "Ejemplo de anuncio anonimizado.",
      "Dato que cambia la lectura.",
      "Cierre con pregunta educativa."
    ],
    ctaOptions: ["¿Conocias este error?", "Guardalo para tu proxima busqueda.", "¿Que mito inmobiliario te han contado?"],
    requiredVariables: [],
    optionalVariables: ["mito", "realidad", "percepcion", "senal_clave"],
    riskLevel: "low",
    bestForPlatform: ["tiktok", "reels", "shorts", "linkedin"]
  },
  mini_tutoriales: {
    id: "mini_tutoriales",
    name: "Mini tutoriales",
    objective: "Crear contenido evergreen para usuarios en busqueda activa.",
    durationRange: [20, 45],
    hookTemplates: [
      "Como saber si un piso esta caro en 20 segundos.",
      "Como comparar dos pisos rapido.",
      "Como estimar la entrada de una vivienda.",
      "Que mirar antes de visitar un piso.",
      "Como evitar perder tiempo con anuncios flojos."
    ],
    scriptTemplates: ["paso_1", "paso_2", "paso_3", "ejemplo", "cierre"],
    visualTemplates: [
      "Titulo tutorial con promesa concreta.",
      "Paso 1 con numero destacado.",
      "Paso 2 con comparativa visual.",
      "Paso 3 con ficha de decision.",
      "Cierre guardable con CTA suave."
    ],
    ctaOptions: ["Guarda este checklist.", "Te servira antes de llamar.", "Analiza tu proximo anuncio gratis."],
    requiredVariables: [],
    optionalVariables: ["precio_m2", "entrada_estimada", "cuota_estimada", "senal_zona"],
    riskLevel: "low",
    bestForPlatform: ["tiktok", "reels", "shorts", "linkedin"]
  },
  build_in_public: {
    id: "build_in_public",
    name: "Build in public",
    objective: "Humanizar el producto y atraer early adopters.",
    durationRange: [20, 45],
    hookTemplates: [
      "Estoy creando una herramienta para no buscar piso a ciegas.",
      "El problema de buscar piso es que todo esta repartido.",
      "He creado esto porque buscar vivienda es un caos.",
      "Estoy probando una funcion nueva de InmoRadar.",
      "Necesito beta testers que esten buscando piso."
    ],
    scriptTemplates: ["problema", "solucion", "demo", "peticion"],
    visualTemplates: [
      "Pantalla personal de problema real buscando piso.",
      "Demo corta de analisis sobre anuncio anonimizado.",
      "Ficha InmoRadar con precio, entrada, cuota y zona.",
      "Peticion concreta a beta testers."
    ],
    ctaOptions: ["Si estas buscando piso, pruebalo y dime que mejorarias.", "Necesito beta testers.", "Link en bio para probarlo."],
    requiredVariables: [],
    optionalVariables: ["portal", "navegador", "url_landing"],
    riskLevel: "low",
    bestForPlatform: ["linkedin", "tiktok", "reels", "shorts"]
  }
});

function hash(input) {
  return crypto.createHash("sha1").update(String(input || "")).digest("hex").slice(0, 8);
}

function pick(items, seed = "") {
  const list = Array.isArray(items) && items.length ? items : [""];
  const index = Number.parseInt(hash(seed).slice(0, 6), 16) % list.length;
  return list[index] || list[0];
}

function normalizeSeriesId(value) {
  const key = String(value || "chollo_o_humo").trim().toLowerCase();
  return seriesConfig[key] ? key : "chollo_o_humo";
}

function normalizePlatform(value) {
  const key = String(value || "tiktok").trim().toLowerCase();
  return ["tiktok", "reels", "shorts", "linkedin"].includes(key) ? key : "tiktok";
}

function normalizeDuration(value, series) {
  const [min, max] = series.durationRange || [15, 45];
  const duration = Number.parseInt(String(value || Math.min(Math.max(28, min), max)), 10);
  if (!Number.isFinite(duration)) return Math.min(Math.max(28, min), max);
  return Math.max(min, Math.min(max, duration));
}

function parsePropertyData(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "email oculto")
    .replace(/\b(?:\+34\s?)?[6789](?:[\s.-]?\d){8}\b/g, "telefono oculto")
    .replace(/\b(?:calle|c\/|avenida|av\.|paseo|plaza|camino|carretera)\s+[^,.]{3,80}?\s+\d+[a-zºª]?\b/gi, "direccion anonimizada");
}

function value(data, key, fallback = DATA_FALLBACKS.missing) {
  const raw = data && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (Array.isArray(raw)) return raw.map((item) => redactSensitiveText(item)).filter(Boolean).join(", ") || fallback;
  return redactSensitiveText(String(raw)).trim().slice(0, 180) || fallback;
}

function listValue(data, key, fallback = DATA_FALLBACKS.missing) {
  const raw = data ? data[key] : undefined;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[;|]/).map((item) => item.trim())
      : [];
  const cleaned = list.map((item) => redactSensitiveText(item)).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : fallback;
}

function locationText(data) {
  const city = value(data, "ciudad", "");
  const barrio = value(data, "barrio", "");
  if (city && barrio) return `${barrio}, ${city}`;
  return city || barrio || "zona no especificada";
}

function safeVerdict(data, seed) {
  const supplied = redactSensitiveText(String(data.veredicto || data.veredicto_corto || "")).trim();
  if (supplied && !containsProhibitedClaims(supplied)) return supplied.endsWith(".") ? supplied : `${supplied}.`;
  return pick(ALLOWED_VERDICTS, seed);
}

function monthlyPaymentText(data) {
  const payment = value(data, "cuota_estimada", DATA_FALLBACKS.unclear);
  return /mes|mensual/i.test(payment) ? payment : `${payment} al mes`;
}

function pickDisclaimer(script) {
  const needsEstimation = /entrada|cuota|aprox|estimad|score|\/m|hipoteca|coste/i.test(script || "");
  return needsEstimation ? `${DISCLAIMERS[0]} ${DISCLAIMERS[1]}` : pick(DISCLAIMERS, script);
}

function ctaFor({ series, objective, inputCta, seed }) {
  if (inputCta) return redactSensitiveText(inputCta);
  const objectiveKey = String(objective || "").toLowerCase();
  if (objectiveKey.includes("install") || objectiveKey.includes("conversion")) {
    return pick(CTA_LIBRARY.conversion, seed);
  }
  if (objectiveKey.includes("save") || objectiveKey.includes("guard")) {
    return pick(CTA_LIBRARY.saves, seed);
  }
  if (series.ctaOptions?.length) return pick(series.ctaOptions, seed);
  return pick(CTA_LIBRARY.comments, seed);
}

function containsProhibitedClaims(text) {
  return /\b(compralo|no lo compres|garantizad[oa]|segur[oa]|vas a ahorrar|inversion segura|tasacion precisa|chollo garantizado|sobrevalorado seguro)\b/i.test(
    text || ""
  );
}

function scriptPartsFor(seriesId, data, hook, cta) {
  const loc = locationText(data);
  const verdict = safeVerdict(data, `${seriesId}:${loc}:${hook}`);
  const score = value(data, "score", DATA_FALLBACKS.unclear);
  const transport = value(data, "transporte", DATA_FALLBACKS.unclear);
  const parking = value(data, "aparcamiento", DATA_FALLBACKS.unclear);
  const areaSignal = value(data, "senal_zona", value(data, "zona_resumen", DATA_FALLBACKS.unclear));

  if (seriesId === "antes_de_llamar") {
    return [
      hook,
      "Uno: precio por metro cuadrado.",
      "Dos: entrada estimada.",
      "Tres: cuota aproximada.",
      "Cuatro: transporte y zona.",
      "Cinco: senales de aparcamiento o entorno.",
      "InmoRadar te lo resume directamente sobre el anuncio.",
      "Menos pestanas. Mas criterio.",
      cta
    ];
  }

  if (seriesId === "piso_a_vs_piso_b") {
    return [
      hook,
      `Dos pisos por ${value(data, "precio_base")}.`,
      `Piso A: ${value(data, "metros_a")} metros, ${value(data, "precio_m2_a")} y score ${value(data, "score_a", DATA_FALLBACKS.unclear)}.`,
      `Piso B: ${value(data, "metros_b")} metros, ${value(data, "precio_m2_b")} y score ${value(data, "score_b", DATA_FALLBACKS.unclear)}.`,
      `El A gana en ${value(data, "ventaja_a", DATA_FALLBACKS.unclear)}.`,
      `El B gana en ${value(data, "ventaja_b", DATA_FALLBACKS.unclear)}.`,
      `Mi veredicto: ${safeVerdict(data, "piso_a_vs_piso_b")}`,
      cta
    ];
  }

  if (seriesId === "pisos_seguidores") {
    return [
      hook,
      "Oculto la direccion por privacidad.",
      `Precio: ${value(data, "precio")}.`,
      `Metros: ${value(data, "metros")}.`,
      `Precio por metro: ${value(data, "precio_m2", DATA_FALLBACKS.unclear)}.`,
      `Entrada estimada: ${value(data, "entrada_estimada", DATA_FALLBACKS.unclear)}.`,
      `Cuota aproximada: ${value(data, "cuota_estimada", DATA_FALLBACKS.unclear)}.`,
      `Zona: ${value(data, "zona_resumen", loc)}.`,
      `Score InmoRadar: ${score}.`,
      `Yo ${value(data, "accion_recomendada", "pediria mas informacion")} porque ${value(data, "razon_principal", DATA_FALLBACKS.check)}.`,
      cta
    ];
  }

  if (seriesId === "errores_buscar_piso") {
    return [
      hook,
      `Un piso de ${value(data, "precio", "240.000 euros")} puede parecer mejor que otro de ${value(data, "precio_alt", "260.000 euros")}.`,
      "Pero si tiene menos metros, peor transporte o una entrada parecida, quiza no compensa.",
      "Antes de contactar, mira precio por metro, entrada, cuota y zona.",
      "InmoRadar te lo pone en una ficha sobre el anuncio.",
      cta
    ];
  }

  if (seriesId === "parecen_baratos") {
    return [
      hook,
      `Cuesta ${value(data, "precio")}.`,
      `Tiene ${value(data, "metros", DATA_FALLBACKS.unclear)}, asi que sale a ${value(data, "precio_m2", DATA_FALLBACKS.unclear)}.`,
      `La entrada estimada seria ${value(data, "entrada_estimada", DATA_FALLBACKS.unclear)}.`,
      `La cuota aproximada: ${value(data, "cuota_estimada", DATA_FALLBACKS.unclear)}.`,
      `Y la zona tiene esta senal: ${areaSignal}.`,
      `Mi conclusion: ${verdict}`,
      cta
    ];
  }

  if (seriesId === "lo_visitarias") {
    return [
      hook,
      `Precio: ${value(data, "precio")}.`,
      `Metros: ${value(data, "metros")}.`,
      `Entrada estimada: ${value(data, "entrada_estimada", DATA_FALLBACKS.unclear)}.`,
      `Pros: ${listValue(data, "pros", DATA_FALLBACKS.unclear)}.`,
      `Contras: ${listValue(data, "contras", DATA_FALLBACKS.unclear)}.`,
      `Score InmoRadar: ${score}.`,
      `Yo ${value(data, "veredicto_corto", verdict.replace(/\.$/, ""))}.`,
      cta
    ];
  }

  if (seriesId === "mitos_inmobiliarios") {
    const myth = value(data, "mito", "el piso mas barato es el mejor");
    return [
      `Mito: ${myth}.`,
      `Realidad: ${value(data, "realidad", "el precio sin contexto puede enganar")}.`,
      `Ejemplo: este piso parece ${value(data, "percepcion", "buena opcion")}, pero cuando miras ${value(data, "senal_clave", "el coste real")}, cambia la lectura.`,
      "Por eso InmoRadar analiza precio, coste, zona y senales antes de contactar.",
      cta
    ];
  }

  if (seriesId === "mini_tutoriales") {
    return [
      hook,
      `Paso uno: ${value(data, "paso_1", "mira el precio por metro cuadrado")}.`,
      `Paso dos: ${value(data, "paso_2", "comparalo con la zona")}.`,
      `Paso tres: ${value(data, "paso_3", "revisa si el entorno compensa")}.`,
      `Si ${value(data, "ejemplo", "el precio es alto, la zona no destaca y el coste inicial se dispara")}, quiza no merece visita.`,
      "InmoRadar hace este resumen directamente sobre el anuncio.",
      cta
    ];
  }

  if (seriesId === "build_in_public") {
    return [
      hook,
      "Buscar piso se ha vuelto una investigacion con mil pestanas.",
      "Por eso estoy creando InmoRadar.",
      "Abres un anuncio y te resume precio, entrada, cuota, zona, transporte y senales clave.",
      "No decide por ti, pero te ayuda a llamar con mas criterio.",
      cta
    ];
  }

  return [
    hook,
    `Precio: ${value(data, "precio")}.`,
    `Metros: ${value(data, "metros")}.`,
    `Eso son ${value(data, "precio_m2", DATA_FALLBACKS.unclear)}.`,
    `Entrada estimada: ${value(data, "entrada_estimada", DATA_FALLBACKS.unclear)}.`,
    `Cuota aproximada: ${monthlyPaymentText(data)}.`,
    `Transporte: ${transport}.`,
    `Aparcamiento: ${parking}.`,
    `Score InmoRadar: ${score}.`,
    `Veredicto: ${verdict}`,
    cta
  ];
}

function defaultFinalQuestion(seriesId) {
  const questions = {
    piso_a_vs_piso_b: "¿Tu cual visitarias primero?",
    lo_visitarias: "¿Lo visitarias si o no?",
    mitos_inmobiliarios: "¿Conocias este error?",
    build_in_public: "¿Que mejorarias tu?",
    errores_buscar_piso: "¿Te ha pasado buscando piso?",
    mini_tutoriales: "¿Lo usarias antes de llamar?"
  };
  return questions[seriesId] || "¿Tu lo visitarias?";
}

function ensureFinalQuestion(parts, seriesId) {
  const list = Array.isArray(parts) ? parts.filter(Boolean) : [];
  const finalWindow = list.slice(-3).join(" ");
  if (/[¿?]/.test(finalWindow)) return list;
  if (!list.length) return [defaultFinalQuestion(seriesId)];
  const last = list.pop();
  list.push(defaultFinalQuestion(seriesId));
  list.push(last);
  return list;
}

function shortenOverlay(text) {
  const cleaned = redactSensitiveText(String(text || "Dato clave").replace(/\s+/g, " ").trim());
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 7) return cleaned;
  return words.slice(0, 7).join(" ");
}

function generateOverlayTexts({ seriesId, propertyData = {}, hook, cta }) {
  const data = parsePropertyData(propertyData);
  const overlays = {
    chollo_o_humo: [
      "¿CHOLLO O HUMO?",
      `${value(data, "precio")} · ${value(data, "metros")}`,
      value(data, "precio_m2", "€/m² no claro"),
      `Entrada: ${value(data, "entrada_estimada", DATA_FALLBACKS.unclear)}`,
      value(data, "transporte", "Transporte: revisar"),
      `Score: ${value(data, "score", DATA_FALLBACKS.unclear)}`,
      "¿Lo visitarias?"
    ],
    antes_de_llamar: ["Antes de llamar", "Mira €/m²", "Mira entrada", "Mira cuota", "Mira zona", "Mira parking", "Guarda esto"],
    piso_a_vs_piso_b: ["A vs B", "Mismo precio", `A: ${value(data, "score_a", "score no claro")}`, `B: ${value(data, "score_b", "score no claro")}`, `A gana: ${value(data, "ventaja_a", "dato")}`, `B gana: ${value(data, "ventaja_b", "dato")}`, "¿A o B?"],
    pisos_seguidores: ["Piso de seguidor", "Direccion oculta", `${value(data, "precio")} · ${value(data, "metros")}`, value(data, "precio_m2", "€/m² no claro"), `Score: ${value(data, "score", DATA_FALLBACKS.unclear)}`, "¿Lo analizamos?"],
    errores_buscar_piso: ["Error tipico", "Mirar solo precio", "Mira €/m²", "Mira entrada", "Mira cuota", "Mira zona", "Guarda esto"],
    parecen_baratos: ["Parece barato", `${value(data, "precio")}`, value(data, "precio_m2", "€/m² no claro"), `Entrada: ${value(data, "entrada_estimada", DATA_FALLBACKS.unclear)}`, "Mira el contexto", "¿Barato o no?"],
    lo_visitarias: ["¿Lo visitarias?", `${value(data, "precio")} · ${value(data, "metros")}`, `Pros: ${listValue(data, "pros", "revisar")}`, `Contras: ${listValue(data, "contras", "revisar")}`, `Score: ${value(data, "score", DATA_FALLBACKS.unclear)}`, "SI o NO"],
    mitos_inmobiliarios: ["Mito inmobiliario", "Realidad: depende", "Mira el contexto", "Los datos mandan", "¿Lo sabias?"],
    mini_tutoriales: ["Tutorial rapido", "Paso 1", "Paso 2", "Paso 3", "Ficha InmoRadar", "Guarda esto"],
    build_in_public: ["Build in public", "Buscar piso es caos", "Nueva capa de analisis", "Demo InmoRadar", "Beta testers"]
  };
  return (overlays[normalizeSeriesId(seriesId)] || [hook, cta]).map(shortenOverlay).filter(Boolean);
}

function splitScript(script) {
  return String(script || "")
    .split(/\n+|(?<=[.?!])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function timeLabel(start, end) {
  const fmt = (value) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, "");
  };
  return `${fmt(start)}-${fmt(end)}s`;
}

function generateSceneByScene(script, duration, options = {}) {
  const seconds = Math.max(15, Math.min(45, Number(duration) || 28));
  const lines = Array.isArray(options.lines) && options.lines.length ? options.lines : splitScript(script);
  const overlays = Array.isArray(options.overlays) ? options.overlays : [];
  const visuals = Array.isArray(options.visualTemplates) && options.visualTemplates.length ? options.visualTemplates : [];
  const count = Math.max(lines.length, overlays.length, Math.ceil((seconds - 2) / 3.5) + 1, 5);
  const firstEnd = Math.min(2, seconds);
  const restDuration = count > 1 ? (seconds - firstEnd) / (count - 1) : seconds;
  let start = 0;

  return Array.from({ length: count }, (_, index) => {
    const end = index === count - 1 ? seconds : index === 0 ? firstEnd : Math.min(seconds, start + restDuration);
    const voiceover = lines[index] || lines[lines.length - 1] || options.cta || "";
    const overlay = shortenOverlay(overlays[index] || voiceover);
    const visual =
      visuals[index % visuals.length] ||
      (index === 0
        ? "Anuncio inmobiliario anonimizado con precio destacado."
        : index === count - 1
          ? "Cierre con pregunta, CTA suave y marca InmoRadar."
          : "Mockup de analisis InmoRadar con datos claros y sensibles ocultos.");
    const scene = {
      time: timeLabel(start, end),
      visual,
      voiceover: redactSensitiveText(voiceover),
      overlay
    };
    start = end;
    return scene;
  });
}

function generateHashtags({ seriesId, platform, propertyData = {} }) {
  const data = parsePropertyData(propertyData);
  const cityKey = String(data.ciudad || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const product = ["#InmoRadar", seriesId === "chollo_o_humo" ? "#CholloOHumo" : "#AntesDeLlamar"];
  const intent = platform === "linkedin"
    ? ["#MercadoInmobiliario", "#Vivienda", "#Hipoteca"]
    : ["#BuscarPiso", "#ComprarPiso", "#Vivienda"];
  const location = HASHTAGS.location[cityKey] ? [HASHTAGS.location[cityKey], `#PisoEn${cityKey.charAt(0).toUpperCase()}${cityKey.slice(1)}`] : [];
  const viral = seriesId === "piso_a_vs_piso_b"
    ? ["#PisoAvsPisoB", "#AnalizandoPisos"]
    : seriesId === "errores_buscar_piso"
      ? ["#ErroresInmobiliarios", "#ChecklistVivienda"]
      : ["#AnalizandoPisos", "#AntesDeLlamar"];
  return Array.from(new Set([...product, ...intent, ...location, ...viral])).slice(0, 10);
}

function generateCaption({ hook, cta, hashtags, platform, seed }) {
  const base = platform === "linkedin" ? "Una forma mas clara de filtrar antes de contactar." : pick(CAPTION_LIBRARY, seed);
  const question = /\?/.test(cta || "") ? cta : "¿Lo visitarias?";
  return `${hook} ${base} ${question} ${hashtags.join(" ")}`.replace(/\s+/g, " ").trim();
}

function generateABVariants({ series, propertyData, seed }) {
  const city = value(parsePropertyData(propertyData), "ciudad", "");
  return {
    hooks: Array.from(new Set([pick(series.hookTemplates, `${seed}:h1`), pick(HOOK_BANKS.curiosidad, `${seed}:h2`), pick(HOOK_BANKS.polemica, `${seed}:h3`)])).slice(0, 3),
    ctas: Array.from(new Set([pick(series.ctaOptions || CTA_LIBRARY.comments, `${seed}:c1`), pick(CTA_LIBRARY.comments, `${seed}:c2`)])).slice(0, 2),
    captions: Array.from(new Set([pick(CAPTION_LIBRARY, `${seed}:cap1`), pick(CAPTION_LIBRARY, `${seed}:cap2`)])).slice(0, 2),
    titles: Array.from(
      new Set([
        `${series.name}${city ? ` en ${city}` : ""}`,
        `${pick(series.hookTemplates, `${seed}:title`).replace(/\.$/, "")} | InmoRadar`
      ])
    ).slice(0, 2)
  };
}

function qualityCheck(brief) {
  const script = brief.script || "";
  const caption = brief.caption || "";
  const text = `${brief.hook || ""}\n${script}\n${caption}`;
  const firstScene = brief.scene_by_scene?.[0] || {};
  const firstEnd = Number(String(firstScene.time || "0-3s").split("-")[1]?.replace("s", "")) || 3;
  const mentionsEstimates = /entrada|cuota|aprox|estimad|score|\/m|hipoteca|coste/i.test(text);
  const finalText = `${brief.cta || ""} ${script.split(/\n+/).slice(-2).join(" ")}`;
  const firstVoiceover = String(firstScene.voiceover || brief.hook || "").toLowerCase();
  return {
    hook_under_3_seconds: firstEnd <= 3,
    has_final_question: /[¿?]/.test(finalText),
    has_disclaimer: mentionsEstimates ? Boolean(brief.disclaimer) : true,
    no_absolute_claims: !containsProhibitedClaims(text),
    no_sensitive_data: !/(telefono oculto|email oculto|direccion anonimizada)/i.test(text) && !/\b\d{9,}\b/.test(text),
    cta_is_soft: !/\b(compra ahora|obligatorio|garantizado|ultimo dia)\b/i.test(brief.cta || ""),
    app_not_ad_from_second_0: !/\b(instala|premium|link en bio|gratis)\b/i.test(firstVoiceover),
    duration_estimate_ok: Number(brief.duration || 0) >= 15 && Number(brief.duration || 0) <= 45,
    overlays_legible: (brief.overlays || []).every((overlay) => String(overlay).split(/\s+/).filter(Boolean).length <= 7)
  };
}

function generateEditingNotes({ platform, series }) {
  const cadence = platform === "linkedin" ? "cambios visuales cada 3-4 segundos" : "cambios visuales cada 2-3 segundos";
  return [
    "Formato vertical 9:16 con subtitulos grandes.",
    cadence,
    "Ocultar direccion exacta, telefonos, nombres de anunciantes y datos personales.",
    "La app aparece como herramienta dentro del analisis, no como anuncio desde el segundo 0.",
    "Usar numeros grandes y mockups anonimizados del analisis.",
    `Riesgo editorial: ${series.riskLevel}. Revisar claims antes de publicar.`
  ];
}

function generateVideoBrief(input = {}) {
  const propertyData = parsePropertyData(input.propertyData || input.property_data);
  const seriesId = normalizeSeriesId(input.seriesId || input.series_id);
  const series = seriesConfig[seriesId];
  const platform = normalizePlatform(input.platform);
  const duration = normalizeDuration(input.duration || input.duration_seconds, series);
  const seed = `${seriesId}:${platform}:${duration}:${JSON.stringify(propertyData)}:${input.variant || ""}`;
  const hook = redactSensitiveText(input.hook || pick(series.hookTemplates, seed));
  const cta = ctaFor({ series, objective: input.objective, inputCta: input.cta || propertyData.cta, seed });
  const parts = ensureFinalQuestion(scriptPartsFor(seriesId, propertyData, hook, cta), seriesId).map(redactSensitiveText);
  const script = parts.join("\n");
  const disclaimer = pickDisclaimer(script);
  const overlays = generateOverlayTexts({ seriesId, propertyData, hook, cta });
  const sceneByScene = generateSceneByScene(script, duration, {
    lines: parts,
    overlays,
    visualTemplates: series.visualTemplates,
    cta
  });
  const hashtags = generateHashtags({ seriesId, platform, propertyData });
  const title = `${series.name}${locationText(propertyData) !== "zona no especificada" ? ` | ${locationText(propertyData)}` : ""}`;
  const caption = generateCaption({ hook, cta, hashtags, platform, seed });
  const brief = {
    video_id: `${seriesId}_${hash(seed)}`,
    series: series.name,
    series_id: seriesId,
    platform,
    duration,
    objective: input.objective || series.objective,
    title,
    hook,
    script,
    scene_by_scene: sceneByScene,
    overlays,
    overlay_texts: overlays,
    caption,
    hashtags,
    cta,
    disclaimer,
    editing_notes: generateEditingNotes({ platform, series }),
    ab_variants: generateABVariants({ series, propertyData, seed })
  };
  brief.quality_check = qualityCheck(brief);
  return brief;
}

function scoreNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function analyzePerformance(videoMetrics = {}) {
  const views = Math.max(1, scoreNumber(videoMetrics.views));
  const retentionRate = scoreNumber(videoMetrics.retention_rate);
  const avgWatchTime = scoreNumber(videoMetrics.avg_watch_time);
  const completionRate = scoreNumber(videoMetrics.completion_rate);
  const comments = scoreNumber(videoMetrics.comments);
  const shares = scoreNumber(videoMetrics.shares);
  const saves = scoreNumber(videoMetrics.saves);
  const likes = scoreNumber(videoMetrics.likes);
  const linkClicks = scoreNumber(videoMetrics.link_clicks);
  const installs = scoreNumber(videoMetrics.installs);
  const firstAnalysis = scoreNumber(videoMetrics.first_analysis);
  const premiumStart = scoreNumber(videoMetrics.premium_start);
  const engagementRate = (likes + comments + shares + saves) / views;
  const conversionSignals = linkClicks + installs + firstAnalysis + premiumStart;

  let classification = "average";
  let action = "Cambiar hook y reforzar contraste visual.";

  if (retentionRate >= 0.4 && (engagementRate >= 0.05 || comments >= 5 || shares + saves >= 8 || conversionSignals > 0)) {
    classification = "winner";
    action = "Generar 10 variantes del mismo formato.";
  } else if (retentionRate >= 0.35 || comments >= 5) {
    classification = "promising";
    action = "Mantener formato y probar otro CTA.";
  } else if ((avgWatchTime && avgWatchTime < 3) || retentionRate < 0.2 || (comments === 0 && linkClicks === 0)) {
    classification = "weak";
    action = "Descartar o reescribir desde cero.";
  }

  return {
    classification,
    action,
    metrics: {
      views,
      engagement_rate: Number(engagementRate.toFixed(4)),
      retention_rate: retentionRate,
      completion_rate: completionRate,
      conversion_signals: conversionSignals
    }
  };
}

module.exports = {
  ALLOWED_VERDICTS,
  CTA_LIBRARY,
  DISCLAIMERS,
  HASHTAGS,
  seriesConfig,
  analyzePerformance,
  generateABVariants,
  generateCaption,
  generateHashtags,
  generateOverlayTexts,
  generateSceneByScene,
  generateVideoBrief,
  qualityCheck
};
