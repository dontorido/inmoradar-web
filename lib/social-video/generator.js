const crypto = require("node:crypto");
const { getVideoBrandingConfig } = require("./branding");

const FORMAT = Object.freeze({
  width: 1080,
  height: 1920,
  aspect_ratio: "9:16",
  fps: 30
});

const TOPICS = Object.freeze({
  random: {
    label: "Aleatorio controlado",
    hooks: [
      "Antes de escribir por un piso, mira esto.",
      "Un anuncio puede parecer bueno y aun asi esconder costes.",
      "La diferencia entre buen precio y mala decision suele estar en los datos."
    ]
  },
  precio_m2: {
    label: "Precio por metro cuadrado",
    hooks: [
      "El precio total no basta para comparar viviendas.",
      "Dos pisos pueden costar parecido y no valer lo mismo.",
      "El euro por metro cuadrado es el primer filtro antes de contactar."
    ]
  },
  alquiler: {
    label: "Alquiler",
    hooks: [
      "Antes de visitar un alquiler, calcula el precio por metro cuadrado.",
      "El alquiler mensual dice menos que el alquiler por metro cuadrado.",
      "Un alquiler barato puede no serlo si la superficie no acompana."
    ]
  },
  compra: {
    label: "Compra",
    hooks: [
      "Comprar vivienda sin comparar datos es entrar casi a ciegas.",
      "Antes de negociar, necesitas saber que estas comparando.",
      "Una buena compra empieza antes de llamar al anuncio."
    ]
  },
  zona: {
    label: "Zona y entorno",
    hooks: [
      "La vivienda no termina en la puerta del edificio.",
      "Una zona puede cambiar por completo la lectura de un anuncio.",
      "Precio, transporte, ruido y aparcamiento deberian mirarse juntos."
    ]
  },
  parking: {
    label: "Aparcamiento",
    hooks: [
      "Si tienes coche, aparcar puede cambiar el valor real de un piso.",
      "Una calle bonita no siempre es una calle facil para aparcar.",
      "El garaje y la presion de aparcamiento importan mas de lo que parece."
    ]
  },
  errores: {
    label: "Errores frecuentes",
    hooks: [
      "Tres errores antes de contactar por un piso.",
      "No contactes por un anuncio sin revisar estas senales.",
      "El error no es enamorarse de un piso. Es no medirlo."
    ]
  }
});

const CTA_COPY = Object.freeze({
  install: "Instala InmoRadar y analiza anuncios antes de contactar.",
  premium: "Prueba dos inmuebles gratis. Premium semanal sin permanencia.",
  news: "Consulta guias y datos inmobiliarios en Inmoradar.app.",
  soft: "Guarda el anuncio y comparalo con datos antes de decidir."
});

const TONE_COPY = Object.freeze({
  directo: {
    label: "Directo",
    style: "frases cortas, utiles y sin adornos",
    caption: "Dato, contexto y decision antes de contactar."
  },
  experto: {
    label: "Experto",
    style: "tono analitico, claro y con criterio inmobiliario",
    caption: "Compara precio, zona y senales del anuncio con mas contexto."
  },
  premium: {
    label: "Premium",
    style: "editorial, sobrio y aspiracional sin exagerar",
    caption: "Analisis inmobiliario rapido para decidir con mas calma."
  }
});

const AUDIENCE_COPY = Object.freeze({
  comprador: "personas que quieren comprar vivienda",
  inquilino: "personas que buscan alquiler",
  inversor: "usuarios que comparan oportunidades inmobiliarias",
  general: "cualquier persona que compara anuncios inmobiliarios"
});

const VISUAL_BACKDROPS = Object.freeze({
  hogar_cotidiano: {
    label: "Hogar cotidiano",
    prompt:
      "personas reales de fondo en una casa luminosa, salon y cocina, vida diaria natural, alguien revisando un movil o portatil, ambiente calido y creible"
  },
  familia_casa: {
    label: "Familia en casa",
    prompt:
      "familia en una vivienda real, conversando en el salon, escena cotidiana y tranquila, ropa casual, luz natural, sin posar de forma publicitaria"
  },
  amigos_piso: {
    label: "Amigos en piso",
    prompt:
      "grupo pequeno de amigos visitando o comentando un piso, ambiente de confianza, sofa, mesa, movil con anuncio, gestos naturales y no exagerados"
  },
  pareja_visita: {
    label: "Pareja visitando vivienda",
    prompt:
      "pareja adulta revisando una vivienda, mirando el movil y tomando notas, fondo de salon realista, escena de decision inmobiliaria cotidiana"
  }
});

const MUSIC_STYLES = Object.freeze({
  warm_house: {
    label: "House suave",
    direction: "base house suave, calida y optimista, 95-105 BPM, volumen bajo para no tapar la voz"
  },
  calm_pop: {
    label: "Pop tranquilo",
    direction: "pop instrumental ligero, piano sintetico suave, ritmo amable, 80-92 BPM"
  },
  urban_soft: {
    label: "Urbano suave",
    direction: "beat urbano elegante y discreto, percusion suave, bajo redondo, 86-96 BPM"
  },
  editorial_ambient: {
    label: "Ambient editorial",
    direction: "capa ambient minimalista, pulso sutil, tono premium y calmado, sin dramatismo"
  }
});

function pick(items) {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

function normalizeTopic(topic) {
  const key = String(topic || "random").trim().toLowerCase();
  if (key !== "random" && TOPICS[key]) return key;
  const keys = Object.keys(TOPICS).filter((item) => item !== "random");
  return pick(keys);
}

function normalizeDuration(value) {
  const duration = Number.parseInt(String(value || 24), 10);
  if (!Number.isFinite(duration)) return 24;
  return Math.max(12, Math.min(45, duration));
}

function normalizeVisualStyle(value) {
  const key = String(value || "hogar_cotidiano").trim().toLowerCase();
  return VISUAL_BACKDROPS[key] ? key : "hogar_cotidiano";
}

function normalizeMusicStyle(value) {
  const key = String(value || "warm_house").trim().toLowerCase();
  return MUSIC_STYLES[key] ? key : "warm_house";
}

function sceneTiming(sceneCount, durationSeconds) {
  const segmentMs = Math.round((durationSeconds * 1000) / sceneCount);
  return Array.from({ length: sceneCount }, (_, index) => {
    const startMs = index * segmentMs;
    const endMs = index === sceneCount - 1 ? durationSeconds * 1000 : (index + 1) * segmentMs;
    return { start_ms: startMs, end_ms: endMs };
  });
}

function buildScenes({ topic, topicConfig, city, durationSeconds, tone, audience, cta, visualStyle }) {
  const cityLabel = city ? ` en ${city}` : "";
  const hook = pick(topicConfig.hooks);
  const timing = sceneTiming(5, durationSeconds);
  const ctaText = CTA_COPY[cta] || CTA_COPY.install;
  const audienceText = AUDIENCE_COPY[audience] || AUDIENCE_COPY.general;
  const toneConfig = TONE_COPY[tone] || TONE_COPY.directo;
  const backdrop = VISUAL_BACKDROPS[visualStyle] || VISUAL_BACKDROPS.hogar_cotidiano;

  const commonVisual = city
    ? `video vertical de una busqueda inmobiliaria en ${city}, estetica InmoRadar, interfaz moderna, vivienda, mapa y datos, ${backdrop.prompt}`
    : `video vertical de una busqueda inmobiliaria en Espana, estetica InmoRadar, interfaz moderna, vivienda, mapa y datos, ${backdrop.prompt}`;

  const topicLines = {
    precio_m2: [
      "Calcula el precio por m2.",
      "Comparalo con una referencia de mercado.",
      "Mira si el anuncio esta por encima, en mercado o por debajo."
    ],
    alquiler: [
      "No mires solo la cuota mensual.",
      "Divide alquiler entre metros cuadrados.",
      "Compara la referencia de la zona antes de contactar."
    ],
    compra: [
      "Precio, metros y zona deben leerse juntos.",
      "El dato municipal no es una tasacion exacta.",
      "La comparacion te da una primera senal para negociar."
    ],
    zona: [
      "Revisa transporte cercano.",
      "Valora ruido, servicios y presion urbana.",
      "La zona puede explicar parte del precio."
    ],
    parking: [
      "Aparcar tambien forma parte del coste real.",
      "Mira garaje, zona regulada y presion de calle.",
      "La dificultad cambia si eres visitante o residente."
    ],
    errores: [
      "No compares solo por precio total.",
      "No ignores metros, planta, garaje o zona.",
      "No contactes sin contexto de mercado."
    ]
  };
  const lines = topicLines[topic] || topicLines.precio_m2;

  return [
    {
      id: "scene-01-hook",
      ...timing[0],
      role: "hook",
      headline: hook,
      body: city ? `Aplica a anuncios de ${city} y otras ciudades.` : "Aplica a anuncios de compra y alquiler.",
      voiceover: hook,
      on_screen_text: hook,
      visual_prompt: `${commonVisual}. Primer plano de movil con anuncio inmobiliario; al fondo se ve una escena diaria en casa con personas conversando de forma natural. Fondo desenfocado, alto contraste, sin texto pequeno.`,
      motion: "zoom lento hacia el movil, entrada suave del titular",
      ai_instruction: `Genera una escena de apertura para ${audienceText}; estilo ${toneConfig.style}. Las personas son ambiente de fondo, no protagonistas, y no deben tapar el texto.`
    },
    {
      id: "scene-02-data",
      ...timing[1],
      role: "data",
      headline: lines[0],
      body: "La primera lectura debe convertir el anuncio en una cifra comparable.",
      voiceover: `${lines[0]} La primera lectura debe convertir el anuncio en una cifra comparable.`,
      on_screen_text: lines[0],
      visual_prompt: `${commonVisual}. Tarjeta de datos con precio, metros cuadrados y calculo por m2 sobre una escena domestica: familia o amigos revisando un anuncio en un sofa. Sin marcas de portales.`,
      motion: "contador numerico y tarjetas deslizandose desde abajo",
      ai_instruction: "Representa datos inmobiliarios claros, sin cifras inventadas ni logos de terceros."
    },
    {
      id: "scene-03-context",
      ...timing[2],
      role: "context",
      headline: lines[1],
      body: "La referencia orientativa ayuda a detectar senales, no sustituye una tasacion.",
      voiceover: `${lines[1]} Es una referencia orientativa, no una tasacion profesional.`,
      on_screen_text: lines[1],
      visual_prompt: `${commonVisual}. Mapa abstracto y senales de entorno integradas sobre una escena de cocina o salon con personas hablando de la zona. Estilo editorial sobrio.`,
      motion: "barrido lateral con pequenos marcadores de ubicacion",
      ai_instruction: "Evita promesas absolutas: debe sentirse orientativo y basado en datos."
    },
    {
      id: "scene-04-decision",
      ...timing[3],
      role: "decision",
      headline: lines[2],
      body: "El objetivo es decidir mejor antes de llamar, visitar o negociar.",
      voiceover: `${lines[2]} Asi decides mejor antes de llamar o visitar.`,
      on_screen_text: lines[2],
      visual_prompt: `${commonVisual}. Comparativa visual entre anuncio, referencia y semaforo de decision; al fondo, amigos o pareja comentan un piso en una mesa de salon.`,
      motion: "split screen con tres bloques que se ordenan y resaltan el dato clave",
      ai_instruction: "Muestra decision asistida por datos, sin saturar la escena."
    },
    {
      id: "scene-05-cta",
      ...timing[4],
      role: "cta",
      headline: "Analiza antes de contactar.",
      body: ctaText,
      voiceover: ctaText,
      on_screen_text: "Analiza antes de contactar.",
      visual_prompt: `${commonVisual}. Cierre limpio con interfaz de InmoRadar; personas al fondo en una casa real, ambiente positivo y cotidiano, boton de accion y firma de marca.`,
      motion: "entrada del CTA y cierre con marca estable",
      ai_instruction: "Cierra con accion clara. Mantener espacio libre para logo arriba derecha y web abajo derecha."
    }
  ];
}

function buildGlobalAiPrompt(project) {
  const branding = project.branding;
  const sceneLines = project.scenes
    .map((scene, index) => `${index + 1}. ${scene.headline} | Visual: ${scene.visual_prompt}`)
    .join("\n");

  return [
    `Crea un video vertical ${project.format.width}x${project.format.height}, ${project.format.aspect_ratio}, ${project.duration_seconds}s.`,
    `Tema: ${project.topic_label}. Audiencia: ${project.audience_label}. Tono: ${project.tone_label}.`,
    `Estilo visual: InmoRadar, moderno, inmobiliario, claro, premium, sin ruido visual. Fondo humano obligatorio: ${project.visual_backdrop}.`,
    "Las escenas deben tener gente realista de fondo en una casa: familia, amigos, pareja o personas comentando un anuncio. No usar celebridades ni rostros identificables como protagonistas.",
    `Musica obligatoria: ${project.music_direction}. Debe sonar de fondo y no tapar la voz.`,
    "No inventes cifras concretas si no aparecen en el guion. Evita promesas absolutas.",
    `Branding obligatorio durante TODO el video: logo de InmoRadar arriba a la derecha, tamano ${branding.logoSizePx}px, margen superior ${branding.logoMarginTopPx}px y margen derecho ${branding.logoMarginRightPx}px.`,
    `Branding obligatorio durante TODO el video: texto exacto "${branding.websiteText}" abajo a la derecha, tamano ${branding.websiteFontSizePx}px, margen inferior ${branding.websiteMarginBottomPx}px y margen derecho ${branding.websiteMarginRightPx}px.`,
    "No tapes el contenido central. Mantener zona segura en bordes.",
    "Escenas:",
    sceneLines
  ].join("\n");
}

function buildCaption({ city, topicConfig, tone, cta }) {
  const cityPart = city ? ` en ${city}` : "";
  const toneConfig = TONE_COPY[tone] || TONE_COPY.directo;
  const ctaText = CTA_COPY[cta] || CTA_COPY.install;
  return `${topicConfig.label}${cityPart}: ${toneConfig.caption} ${ctaText}`;
}

function generateSocialVideoProject(input = {}) {
  const topic = normalizeTopic(input.topic);
  const topicConfig = TOPICS[topic] || TOPICS.precio_m2;
  const city = String(input.city || "").trim().slice(0, 80);
  const durationSeconds = normalizeDuration(input.duration_seconds || input.durationSeconds);
  const tone = TONE_COPY[input.tone] ? input.tone : "directo";
  const audience = AUDIENCE_COPY[input.audience] ? input.audience : "general";
  const cta = CTA_COPY[input.cta] ? input.cta : "install";
  const visualStyle = normalizeVisualStyle(input.visual_style || input.visualStyle);
  const musicStyle = normalizeMusicStyle(input.music_style || input.musicStyle);
  const visualConfig = VISUAL_BACKDROPS[visualStyle] || VISUAL_BACKDROPS.hogar_cotidiano;
  const musicConfig = MUSIC_STYLES[musicStyle] || MUSIC_STYLES.warm_house;
  const branding = getVideoBrandingConfig(input.branding);
  const scenes = buildScenes({ topic, topicConfig, city, durationSeconds, tone, audience, cta, visualStyle });
  const now = new Date().toISOString();
  const id = `sv_${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(10).toString("hex")}`;
  const project = {
    ok: true,
    id,
    generated_at: now,
    engine: "controlled_ai_storyboard",
    status: "storyboard_ready",
    topic,
    topic_label: topicConfig.label,
    title: `${topicConfig.label}${city ? ` en ${city}` : ""} | InmoRadar`,
    city: city || null,
    duration_seconds: durationSeconds,
    format: FORMAT,
    tone,
    tone_label: (TONE_COPY[tone] || TONE_COPY.directo).label,
    audience,
    audience_label: AUDIENCE_COPY[audience] || AUDIENCE_COPY.general,
    visual_style: visualStyle,
    visual_style_label: visualConfig.label,
    visual_backdrop: visualConfig.prompt,
    music_style: musicStyle,
    music_label: musicConfig.label,
    cta,
    cta_text: CTA_COPY[cta] || CTA_COPY.install,
    branding,
    scenes,
    caption: buildCaption({ city, topicConfig, tone, cta }),
    hashtags: ["#InmoRadar", "#Vivienda", "#ComprarCasa", "#Alquiler", "#Inmobiliario"].slice(0, 5),
    music_direction: musicConfig.direction,
    music_prompt: `Crear musica instrumental para video vertical inmobiliario: ${musicConfig.direction}. Duracion ${durationSeconds}s. Sin voces, sin samples reconocibles, loop limpio y discreto.`,
    render_contract: {
      preview_html: true,
      storyboard: true,
      thumbnail: true,
      mp4_final: "browser_media_recorder_when_supported",
      webm_fallback: true,
      audio_track: true,
      mandatory_overlay: true,
      safe_zone_px: branding.safeZonePx
    },
    quality_checks: [
      "logo_top_right_present",
      "website_bottom_right_present",
      "branding_visible_all_scenes",
      "people_background_present",
      "music_track_present",
      "central_content_not_covered",
      "no_absolute_claims",
      "no_fake_price_data"
    ]
  };
  project.global_ai_prompt = buildGlobalAiPrompt(project);
  return project;
}

module.exports = {
  FORMAT,
  TOPICS,
  VISUAL_BACKDROPS,
  MUSIC_STYLES,
  generateSocialVideoProject
};
