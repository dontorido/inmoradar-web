const KPI_SCHEMA_VERSION = 1;

const KPI_SETTINGS_SCHEMA = [
  {
    key: "model",
    label: "Modelo y confianza",
    description: "Reglas generales para mostrar, capar o esconder KPIs cuando los datos son incompletos.",
    fields: [
      {
        path: "model.mode",
        label: "Modo de scoring",
        type: "select",
        defaultValue: "balanced",
        options: [
          { value: "conservative", label: "Conservador" },
          { value: "balanced", label: "Equilibrado" },
          { value: "aggressive", label: "Agresivo" }
        ],
        description: "Controla como de estrictos son los umbrales cuando hay senales mixtas."
      },
      {
        path: "model.show_confidence",
        label: "Mostrar confianza",
        type: "boolean",
        defaultValue: true,
        description: "Muestra si el KPI se basa en dato exacto, municipal, estimado o fallback."
      },
      {
        path: "model.low_confidence_policy",
        label: "Politica baja confianza",
        type: "select",
        defaultValue: "cap_score",
        options: [
          { value: "cap_score", label: "Capar score" },
          { value: "hide", label: "Ocultar KPI" },
          { value: "show_warning", label: "Mostrar aviso" }
        ],
        description: "Que hacer cuando faltan datos suficientes para medir con seguridad."
      }
    ]
  },
  {
    key: "property_score",
    label: "Score inmueble",
    description: "Ponderacion del 0 al 10 del bloque Inmueble.",
    fields: [
      {
        path: "property_score.enabled",
        label: "Activar score inmueble",
        type: "boolean",
        defaultValue: true,
        description: "Permite desactivar el KPI completo sin tocar los calculos internos."
      },
      {
        path: "property_score.base_score",
        label: "Score base",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 5,
        description: "Punto de partida antes de sumar o restar senales."
      },
      {
        path: "property_score.max_without_market",
        label: "Maximo sin mercado",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 6.5,
        description: "Techo del score cuando no hay referencia de precio suficiente."
      },
      {
        path: "property_score.weights.price",
        label: "Peso precio",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 35,
        description: "Importancia del precio frente a mercado dentro del score del inmueble."
      },
      {
        path: "property_score.weights.features",
        label: "Peso atributos",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 20,
        description: "Terraza, garaje, ascensor, eficiencia y extras detectados."
      },
      {
        path: "property_score.weights.building",
        label: "Peso edificio",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 15,
        description: "Antiguedad, planta, ascensor y senales basicas de edificio."
      },
      {
        path: "property_score.weights.costs",
        label: "Peso costes",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 15,
        description: "Impacto de hipoteca, IBI, comunidad y gastos recurrentes."
      },
      {
        path: "property_score.weights.risk",
        label: "Peso riesgo",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 15,
        description: "Penalizacion por datos ausentes, descripcion pobre o inconsistencias."
      }
    ]
  },
  {
    key: "geo_caps",
    label: "Caps por precision geografica",
    description: "Techo maximo del score segun la granularidad del dato de mercado.",
    fields: [
      {
        path: "property_score.geo_caps.neighbourhood",
        label: "Zona o barrio",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 9.2,
        description: "Maximo cuando el precio es referencia de zona/barrio."
      },
      {
        path: "property_score.geo_caps.district",
        label: "Distrito",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 8.4,
        description: "Maximo cuando solo hay dato de distrito."
      },
      {
        path: "property_score.geo_caps.municipality",
        label: "Municipio",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 7.8,
        description: "Maximo cuando el dato es referencia municipal."
      },
      {
        path: "property_score.geo_caps.province",
        label: "Provincia",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 7,
        description: "Maximo cuando solo hay dato provincial."
      },
      {
        path: "property_score.geo_caps.unknown",
        label: "Sin zona",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 6.5,
        description: "Maximo si no se detecta municipio o zona fiable."
      }
    ]
  },
  {
    key: "zone_score",
    label: "Score zona",
    description: "Ponderacion del 0 al 10 del bloque Zona.",
    fields: [
      {
        path: "zone_score.enabled",
        label: "Activar score zona",
        type: "boolean",
        defaultValue: true,
        description: "Permite ocultar el KPI de zona si aun no hay senales suficientes."
      },
      {
        path: "zone_score.fallback_policy",
        label: "Politica fallback zona",
        type: "select",
        defaultValue: "hide",
        options: [
          { value: "hide", label: "Ocultar" },
          { value: "show_neutral", label: "Mostrar neutral" },
          { value: "show_warning", label: "Mostrar aviso" }
        ],
        description: "Evita mostrar un 6,8/10 fijo cuando no hay dato real."
      },
      {
        path: "zone_score.fallback_score",
        label: "Score fallback zona",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 6.8,
        description: "Valor neutral si se decide mostrar fallback."
      },
      {
        path: "zone_score.minimum_confidence_to_show",
        label: "Confianza minima zona",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.45,
        description: "Por debajo de este nivel se aplica la politica fallback."
      },
      {
        path: "zone_score.weights.transport",
        label: "Peso transporte",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 25,
        description: "Cercania a metro, tren, bus o nodos de movilidad."
      },
      {
        path: "zone_score.weights.services",
        label: "Peso servicios",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 20,
        description: "Servicios proximos y senales urbanas utiles."
      },
      {
        path: "zone_score.weights.parking",
        label: "Peso aparcamiento",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 20,
        description: "Dificultad estimada para aparcar cerca del inmueble."
      },
      {
        path: "zone_score.weights.noise",
        label: "Peso ruido",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 15,
        description: "Riesgo por vias principales, ocio nocturno, tren o baja altura."
      },
      {
        path: "zone_score.weights.restrictions",
        label: "Peso restricciones",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 10,
        description: "Zonas reguladas, restricciones o fricciones de uso."
      },
      {
        path: "zone_score.weights.liquidity",
        label: "Peso liquidez",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 10,
        description: "Demanda y facilidad estimada de salida futura."
      }
    ]
  },
  {
    key: "market",
    label: "Precio y mercado",
    description: "Umbrales para interpretar si un anuncio esta barato, en mercado o caro.",
    fields: [
      {
        path: "market.sale_thresholds.very_good_pct",
        label: "Venta muy buen precio",
        type: "number",
        min: -60,
        max: 0,
        step: 1,
        suffix: "%",
        defaultValue: -15,
        description: "Diferencia maxima frente a mercado para marcar muy buen precio."
      },
      {
        path: "market.sale_thresholds.good_pct",
        label: "Venta buen precio",
        type: "number",
        min: -60,
        max: 0,
        step: 1,
        suffix: "%",
        defaultValue: -5,
        description: "Diferencia maxima para marcar buen precio."
      },
      {
        path: "market.sale_thresholds.market_pct",
        label: "Venta en mercado",
        type: "number",
        min: 0,
        max: 40,
        step: 1,
        suffix: "%",
        defaultValue: 5,
        description: "Hasta este exceso se considera precio razonable."
      },
      {
        path: "market.sale_thresholds.expensive_pct",
        label: "Venta caro",
        type: "number",
        min: 0,
        max: 80,
        step: 1,
        suffix: "%",
        defaultValue: 15,
        description: "Por encima de este umbral se marca como caro."
      },
      {
        path: "market.rent_thresholds.very_good_pct",
        label: "Alquiler muy buen precio",
        type: "number",
        min: -60,
        max: 0,
        step: 1,
        suffix: "%",
        defaultValue: -10,
        description: "Umbral de alquiler claramente por debajo del mercado."
      },
      {
        path: "market.rent_thresholds.expensive_pct",
        label: "Alquiler caro",
        type: "number",
        min: 0,
        max: 80,
        step: 1,
        suffix: "%",
        defaultValue: 12,
        description: "Umbral de alquiler por encima de mercado."
      },
      {
        path: "market.stale_months_penalty_after",
        label: "Dato obsoleto desde",
        type: "number",
        min: 1,
        max: 60,
        step: 1,
        suffix: "meses",
        defaultValue: 18,
        description: "A partir de aqui se rebaja confianza del dato."
      },
      {
        path: "market.show_range",
        label: "Mostrar rango",
        type: "boolean",
        defaultValue: true,
        description: "Muestra horquilla orientativa cuando el dato es amplio."
      }
    ]
  },
  {
    key: "price_score",
    label: "Score precio",
    description: "Formula que convierte la diferencia frente a mercado en una puntuacion de precio.",
    fields: [
      {
        path: "price_score.baseline",
        label: "Base score precio",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 6.4,
        description: "Punto de partida antes de premiar descuento o penalizar sobreprecio."
      },
      {
        path: "price_score.sale_affordable_cap_pct",
        label: "Cap descuento venta",
        type: "number",
        min: 0,
        max: 80,
        step: 1,
        suffix: "%",
        defaultValue: 25,
        description: "Maximo descuento que suma puntos en venta."
      },
      {
        path: "price_score.rent_affordable_cap_pct",
        label: "Cap descuento alquiler",
        type: "number",
        min: 0,
        max: 80,
        step: 1,
        suffix: "%",
        defaultValue: 18,
        description: "Maximo descuento que suma puntos en alquiler."
      },
      {
        path: "price_score.sale_expensive_cap_pct",
        label: "Cap sobreprecio venta",
        type: "number",
        min: 0,
        max: 80,
        step: 1,
        suffix: "%",
        defaultValue: 25,
        description: "Maximo sobreprecio que penaliza el score en venta."
      },
      {
        path: "price_score.rent_expensive_cap_pct",
        label: "Cap sobreprecio alquiler",
        type: "number",
        min: 0,
        max: 80,
        step: 1,
        suffix: "%",
        defaultValue: 18,
        description: "Maximo sobreprecio que penaliza el score en alquiler."
      },
      {
        path: "price_score.affordable_multiplier",
        label: "Multiplicador descuento",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.14,
        description: "Cuanto suma cada punto porcentual barato, ajustado por confianza."
      },
      {
        path: "price_score.expensive_multiplier",
        label: "Multiplicador sobreprecio",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.16,
        description: "Cuanto resta cada punto porcentual caro."
      }
    ]
  },
  {
    key: "costs",
    label: "Costes",
    description: "Supuestos para hipoteca, IBI, comunidad y coste total mensual.",
    fields: [
      {
        path: "costs.mortgage_ltv",
        label: "LTV hipoteca",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 80,
        description: "Porcentaje financiado por defecto."
      },
      {
        path: "costs.mortgage_years",
        label: "Anos hipoteca",
        type: "number",
        min: 1,
        max: 40,
        step: 1,
        defaultValue: 30,
        description: "Plazo usado para estimar cuota mensual."
      },
      {
        path: "costs.mortgage_tin",
        label: "TIN estimado",
        type: "number",
        min: 0,
        max: 12,
        step: 0.05,
        suffix: "%",
        defaultValue: 3.2,
        description: "Tipo de interes anual orientativo."
      },
      {
        path: "costs.community_base_min",
        label: "Comunidad min",
        type: "number",
        min: 0,
        max: 1000,
        step: 5,
        suffix: "EUR/mes",
        defaultValue: 60,
        description: "Estimacion baja de comunidad sin extras."
      },
      {
        path: "costs.community_base_max",
        label: "Comunidad max",
        type: "number",
        min: 0,
        max: 1000,
        step: 5,
        suffix: "EUR/mes",
        defaultValue: 120,
        description: "Estimacion alta de comunidad sin extras."
      },
      {
        path: "costs.community_pool_max",
        label: "Comunidad con piscina max",
        type: "number",
        min: 0,
        max: 1500,
        step: 5,
        suffix: "EUR/mes",
        defaultValue: 260,
        description: "Techo orientativo cuando hay piscina, zonas comunes o urbanizacion."
      },
      {
        path: "costs.ibi_min_rate",
        label: "IBI tipo minimo",
        type: "number",
        min: 0,
        max: 0.02,
        step: 0.0001,
        defaultValue: 0.001035,
        description: "Ratio minimo sobre valor estimado."
      },
      {
        path: "costs.ibi_max_rate",
        label: "IBI tipo maximo",
        type: "number",
        min: 0,
        max: 0.02,
        step: 0.0001,
        defaultValue: 0.001862,
        description: "Ratio maximo sobre valor estimado."
      }
    ]
  },
  {
    key: "condition",
    label: "Estado y reforma",
    description: "Palabras clave para detectar estado del inmueble sin analisis de fotos.",
    fields: [
      {
        path: "condition.enabled",
        label: "Activar estado",
        type: "boolean",
        defaultValue: true,
        description: "Usa descripcion y atributos del anuncio para estimar reforma."
      },
      {
        path: "condition.unknown_policy",
        label: "Si no hay senal",
        type: "select",
        defaultValue: "show_unknown",
        options: [
          { value: "show_unknown", label: "Mostrar desconocido" },
          { value: "hide", label: "Ocultar" },
          { value: "neutral", label: "Neutral" }
        ],
        description: "Evita inventar estado cuando la descripcion no aporta datos."
      },
      {
        path: "condition.renovated_keywords",
        label: "Keywords reformado",
        type: "textarea",
        defaultValue: "reformado, a estrenar, obra nueva, renovado, rehabilitado",
        description: "Separadas por coma. Suman confianza positiva."
      },
      {
        path: "condition.update_keywords",
        label: "Keywords a reformar",
        type: "textarea",
        defaultValue: "actualizar, origen, para reformar, a reformar, reforma integral",
        description: "Separadas por coma. Penalizan estado o suben riesgo."
      }
    ]
  },
  {
    key: "environment",
    label: "Entorno",
    description: "Umbrales para transporte, ruido y senales urbanas.",
    fields: [
      {
        path: "environment.transport_excellent_m",
        label: "Transporte excelente",
        type: "number",
        min: 0,
        max: 3000,
        step: 25,
        suffix: "m",
        defaultValue: 200,
        description: "Distancia maxima para transporte excelente."
      },
      {
        path: "environment.transport_good_m",
        label: "Transporte bueno",
        type: "number",
        min: 0,
        max: 3000,
        step: 25,
        suffix: "m",
        defaultValue: 500,
        description: "Distancia maxima para transporte bueno."
      },
      {
        path: "environment.transport_medium_m",
        label: "Transporte medio",
        type: "number",
        min: 0,
        max: 3000,
        step: 25,
        suffix: "m",
        defaultValue: 900,
        description: "Distancia maxima para transporte aceptable."
      },
      {
        path: "environment.noise_enabled",
        label: "Activar ruido",
        type: "boolean",
        defaultValue: true,
        description: "Calcula riesgo de ruido por senales de zona y anuncio."
      },
      {
        path: "environment.noise_main_road_impact",
        label: "Impacto via principal",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 2,
        description: "Penalizacion estimada si hay via principal cercana."
      },
      {
        path: "environment.noise_nightlife_impact",
        label: "Impacto ocio nocturno",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 2,
        description: "Penalizacion estimada si hay ocio nocturno o hosteleria intensa."
      },
      {
        path: "environment.floor_low_noise_penalty",
        label: "Penalizacion planta baja",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 0.8,
        description: "Ajuste si el inmueble esta en planta baja o primera."
      }
    ]
  },
  {
    key: "parking",
    label: "Aparcamiento",
    description: "Reglas para dificultad de aparcamiento y confianza minima.",
    fields: [
      {
        path: "parking.enabled",
        label: "Activar parking",
        type: "boolean",
        defaultValue: true,
        description: "Usa senales de garaje, zona regulada y cache de aparcamiento."
      },
      {
        path: "parking.radius_m",
        label: "Radio parking",
        type: "number",
        min: 100,
        max: 2000,
        step: 50,
        suffix: "m",
        defaultValue: 500,
        description: "Radio de busqueda para senales de aparcamiento."
      },
      {
        path: "parking.base_score",
        label: "Dificultad base",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 3,
        description: "Punto de partida antes de senales de zona."
      },
      {
        path: "parking.medium_difficulty_threshold",
        label: "Dificultad media",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 5,
        description: "Desde aqui se etiqueta como aparcamiento medio."
      },
      {
        path: "parking.high_difficulty_threshold",
        label: "Dificultad alta",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 8,
        description: "Desde aqui se etiqueta como dificil aparcar."
      },
      {
        path: "parking.confidence_minimum_to_show",
        label: "Confianza minima parking",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        description: "Por debajo se oculta o se muestra como estimacion debil."
      }
    ]
  },
  {
    key: "pros_cons",
    label: "Lo bueno / Lo malo",
    description: "Motor de senales para ventajas, riesgos, confianza y prioridades visibles en la extension.",
    fields: [
      {
        path: "pros_cons.enabled",
        label: "Activar analisis",
        type: "boolean",
        defaultValue: true,
        description: "Genera Lo bueno / Lo malo con reglas ponderadas en lugar de textos fijos."
      },
      {
        path: "pros_cons.max_good",
        label: "Maximo ventajas",
        type: "number",
        min: 1,
        max: 8,
        step: 1,
        defaultValue: 5,
        description: "Numero maximo de senales positivas que se muestran."
      },
      {
        path: "pros_cons.max_bad",
        label: "Maximo riesgos",
        type: "number",
        min: 1,
        max: 8,
        step: 1,
        defaultValue: 5,
        description: "Numero maximo de senales negativas que se muestran."
      },
      {
        path: "pros_cons.minimum_confidence",
        label: "Confianza minima",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        description: "Por debajo se descartan senales debiles o puramente decorativas."
      },
      {
        path: "pros_cons.fallback_policy",
        label: "Si no hay senales",
        type: "select",
        defaultValue: "neutral",
        options: [
          { value: "neutral", label: "Mostrar neutral" },
          { value: "hide", label: "Ocultar columna" },
          { value: "legacy", label: "Fallback antiguo" }
        ],
        description: "Evita inventar ventajas o riesgos cuando el anuncio no aporta datos."
      },
      {
        path: "pros_cons.show_details",
        label: "Mostrar explicacion",
        type: "boolean",
        defaultValue: true,
        description: "Incluye debajo de cada senal el motivo y el nivel de confianza."
      },
      {
        path: "pros_cons.weights.price",
        label: "Prioridad precio",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.5,
        description: "Multiplicador de senales de precio frente a mercado."
      },
      {
        path: "pros_cons.weights.features",
        label: "Prioridad atributos",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1,
        description: "Multiplicador de terraza, ascensor, garaje, piscina y extras."
      },
      {
        path: "pros_cons.weights.risk",
        label: "Prioridad riesgos",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.4,
        description: "Multiplicador de planta, reforma, datos pobres o fricciones legales."
      },
      {
        path: "pros_cons.weights.environment",
        label: "Prioridad entorno",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.1,
        description: "Multiplicador de transporte, parking y senales urbanas."
      },
      {
        path: "pros_cons.market.very_good_pct",
        label: "Precio muy bueno",
        type: "number",
        min: -60,
        max: 0,
        step: 1,
        suffix: "%",
        defaultValue: -15,
        description: "Diferencia frente a mercado para marcar una ventaja fuerte."
      },
      {
        path: "pros_cons.market.good_pct",
        label: "Precio bueno",
        type: "number",
        min: -60,
        max: 0,
        step: 1,
        suffix: "%",
        defaultValue: -5,
        description: "Diferencia frente a mercado para marcar precio competitivo."
      },
      {
        path: "pros_cons.market.expensive_pct",
        label: "Precio caro",
        type: "number",
        min: 0,
        max: 80,
        step: 1,
        suffix: "%",
        defaultValue: 8,
        description: "Diferencia desde la que el precio aparece como riesgo."
      },
      {
        path: "pros_cons.market.very_expensive_pct",
        label: "Precio muy caro",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
        defaultValue: 18,
        description: "Diferencia para priorizar sobreprecio como riesgo principal."
      },
      {
        path: "pros_cons.market.low_confidence_threshold",
        label: "Mercado baja confianza",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.45,
        description: "Por debajo se muestra aviso de referencia poco precisa."
      },
      {
        path: "pros_cons.floor.high_without_lift",
        label: "Planta alta sin ascensor",
        type: "number",
        min: 1,
        max: 10,
        step: 1,
        defaultValue: 3,
        description: "Desde esta planta, si no hay ascensor detectado, aparece como riesgo."
      },
      {
        path: "pros_cons.floor.low_floor_max",
        label: "Planta baja sensible",
        type: "number",
        min: 0,
        max: 3,
        step: 1,
        defaultValue: 0,
        description: "Planta maxima considerada baja para privacidad, ruido o luz."
      },
      {
        path: "pros_cons.size.small_m2",
        label: "Superficie pequena",
        type: "number",
        min: 10,
        max: 120,
        step: 1,
        suffix: "m2",
        defaultValue: 45,
        description: "Por debajo aparece advertencia de superficie ajustada."
      },
      {
        path: "pros_cons.size.large_m2",
        label: "Superficie amplia",
        type: "number",
        min: 40,
        max: 250,
        step: 1,
        suffix: "m2",
        defaultValue: 95,
        description: "Desde aqui se considera una ventaja de amplitud."
      },
      {
        path: "pros_cons.size.tight_m2_per_room",
        label: "m2/habitacion ajustado",
        type: "number",
        min: 8,
        max: 45,
        step: 1,
        defaultValue: 18,
        description: "Umbral para detectar distribucion apretada."
      },
      {
        path: "pros_cons.size.spacious_m2_per_room",
        label: "m2/habitacion amplio",
        type: "number",
        min: 12,
        max: 60,
        step: 1,
        defaultValue: 28,
        description: "Umbral para detectar buena relacion superficie/habitaciones."
      },
      {
        path: "pros_cons.description.short_chars",
        label: "Descripcion escueta",
        type: "number",
        min: 50,
        max: 1200,
        step: 25,
        suffix: "chars",
        defaultValue: 260,
        description: "Por debajo se avisa de poca informacion en el anuncio."
      },
      {
        path: "pros_cons.environment.transport_good_m",
        label: "Transporte bueno",
        type: "number",
        min: 50,
        max: 2000,
        step: 50,
        suffix: "m",
        defaultValue: 500,
        description: "Distancia maxima para marcar buena conexion de transporte."
      },
      {
        path: "pros_cons.environment.parking_hard_threshold",
        label: "Parking dificil",
        type: "number",
        min: 1,
        max: 10,
        step: 0.5,
        defaultValue: 7,
        description: "Score desde el que aparcar aparece como riesgo."
      },
      {
        path: "pros_cons.keywords.positive",
        label: "Keywords positivas",
        type: "textarea",
        defaultValue: "reformado:Buen estado aparente, a estrenar:Listo para entrar, obra nueva:Obra nueva, exterior:Exterior, luminoso:Buena luminosidad, terraza:Terraza, balcon:Balcon, garaje:Garaje, ascensor:Ascensor, aire acondicionado:Climatizacion",
        description: "Formato palabra:etiqueta, separadas por coma. Sirve para adaptar copy sin tocar codigo."
      },
      {
        path: "pros_cons.keywords.negative",
        label: "Keywords negativas",
        type: "textarea",
        defaultValue: "a reformar:Necesita reforma, para reformar:Necesita reforma, origen:Estado antiguo, interior:Interior, bajo:Planta baja, sin ascensor:Sin ascensor, ocupado:Riesgo de ocupacion, nuda propiedad:Nuda propiedad, subasta:Subasta, sin posesion:Sin posesion",
        description: "Formato palabra:etiqueta, separadas por coma. Se usan como riesgos o puntos a revisar."
      }
    ]
  },
  {
    key: "visibility",
    label: "Visibilidad en extension",
    description: "Interruptores para evitar KPIs decorativos o estaticos.",
    fields: [
      {
        path: "visibility.show_demo_commute",
        label: "Mostrar commute demo",
        type: "boolean",
        defaultValue: false,
        description: "Mantener apagado si no hay trayecto real del usuario."
      },
      {
        path: "visibility.show_static_noise",
        label: "Mostrar ruido estatico",
        type: "boolean",
        defaultValue: false,
        description: "Evita mostrar ruido si no hay senales reales."
      },
      {
        path: "visibility.show_static_rotation",
        label: "Mostrar rotacion estatica",
        type: "boolean",
        defaultValue: false,
        description: "Evita mostrar liquidez/rotacion sin fuente."
      },
      {
        path: "visibility.show_static_zone_score",
        label: "Mostrar zona estatica",
        type: "boolean",
        defaultValue: false,
        description: "Apaga el score de zona fijo cuando no hay datos suficientes."
      },
      {
        path: "visibility.show_static_community",
        label: "Mostrar comunidad estatica",
        type: "boolean",
        defaultValue: false,
        description: "Evita mostrar cuotas inventadas como si fueran dato real."
      },
      {
        path: "visibility.show_photo_analysis",
        label: "Mostrar fotos",
        type: "boolean",
        defaultValue: false,
        description: "Debe seguir apagado tras retirar el analisis visual."
      }
    ]
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPath(source, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), source);
}

function setPath(target, path, value) {
  const keys = String(path).split(".");
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

function allFields() {
  return KPI_SETTINGS_SCHEMA.flatMap((group) => group.fields.map((field) => ({ ...field, group: group.key })));
}

function defaultKpiSettings() {
  const settings = {
    model: {
      version: KPI_SCHEMA_VERSION
    }
  };

  allFields().forEach((field) => {
    setPath(settings, field.path, clone(field.defaultValue));
  });

  return settings;
}

function coerceBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "si", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function coerceField(field, value) {
  if (field.type === "boolean") {
    return coerceBoolean(value, field.defaultValue);
  }

  if (field.type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return field.defaultValue;
    const min = typeof field.min === "number" ? field.min : parsed;
    const max = typeof field.max === "number" ? field.max : parsed;
    return Math.max(min, Math.min(max, parsed));
  }

  if (field.type === "select") {
    const allowed = new Set((field.options || []).map((option) => option.value));
    const stringValue = String(value ?? "").trim();
    return allowed.has(stringValue) ? stringValue : field.defaultValue;
  }

  if (field.type === "textarea" || field.type === "text") {
    return String(value ?? field.defaultValue ?? "").trim().slice(0, field.maxLength || 2000);
  }

  return value ?? field.defaultValue;
}

function coerceKpiSettings(input = {}) {
  const settings = defaultKpiSettings();

  allFields().forEach((field) => {
    const incoming = getPath(input, field.path);
    setPath(settings, field.path, coerceField(field, incoming === undefined ? field.defaultValue : incoming));
  });

  settings.model.version = KPI_SCHEMA_VERSION;
  return settings;
}

module.exports = {
  KPI_SCHEMA_VERSION,
  KPI_SETTINGS_SCHEMA,
  coerceKpiSettings,
  defaultKpiSettings
};
