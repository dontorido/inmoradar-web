# Runway en Social Video Studio

El modulo de Videos puede enviar el storyboard de InmoRadar a Runway para generar un clip base realista. InmoRadar conserva el control de marca, textos, musica y export final.

## Coste

Runway cobra por creditos. El backend estima el coste antes de enviar cualquier render:

- `gen4.5`: 12 creditos por segundo.
- `veo3.1_fast_no_audio`: 10 creditos por segundo.

El credito se estima a `0.01 USD`, asi que un clip de 5 segundos en `gen4.5` son 60 creditos, aproximadamente `0.60 USD`.

`gen4_turbo` queda registrado en la tabla de precios interna para una segunda fase con imagen semilla, pero no se ofrece como opcion directa de text-to-video porque puede requerir entrada visual.

## Variables

El render real esta desactivado por defecto.

```txt
RUNWAYML_API_SECRET=...
RUNWAY_RENDER_ENABLED=true
RUNWAY_DEFAULT_MODEL=gen4.5
RUNWAY_DEFAULT_DURATION_SECONDS=5
RUNWAY_DEFAULT_RATIO=1280:720
RUNWAY_MAX_COST_USD=0.75
RUNWAY_DAILY_BUDGET_USD=3
RUNWAY_DRY_RUN_ONLY=false
```

Nota: Gen-4.5 en modo texto puro se envia a Runway como `image_to_video` sin `promptImage`, tal como indica la API oficial. En ese modo usamos `1280:720` porque Runway puede rechazar `720:1280` sin imagen de entrada. InmoRadar reencuadra el clip en la composicion vertical final.

Para evitar rechazos de validacion del cuerpo, el prompt que se envia a Runway se normaliza a una linea corta en ASCII. Si Runway aun rechaza el prompt del storyboard, el backend reintenta una vez con un prompt minimo compatible antes de devolver error.

## Tabla Supabase

Ejecuta `database/social-video-jobs.sql` antes de activar renders reales. La tabla registra jobs, coste estimado, estado, respuesta de Runway y URL final.

## Flujo operativo

1. Genera el storyboard desde `Marketing > Videos`.
2. Pulsa `Estimar coste`.
3. Revisa creditos, coste y ratio API.
4. Marca la confirmacion de coste.
5. Pulsa `Generar clip Runway`.
6. Pulsa `Comprobar estado` hasta que Runway devuelva resultado.
7. Pulsa `Usar clip IA`.
8. Exporta la maqueta final con marca InmoRadar.

## Seguridad de coste

El backend bloquea renders si:

- `RUNWAY_RENDER_ENABLED` no es `true`.
- falta la API key.
- el coste estimado supera `RUNWAY_MAX_COST_USD`.
- el coste diario supera `RUNWAY_DAILY_BUDGET_USD`.
- el usuario no confirma el coste estimado desde el backoffice.

## Nota tecnica

El clip de Runway se descarga mediante el backend y se convierte en un `ObjectURL` local para que el canvas pueda usarlo como fondo sin problemas de CORS durante el export.
