# Comprobación de inferencia real — 2026-10-16

Solicitud: activar inferencia real en la aplicación local. Se usó la clave NVIDIA ya configurada
en `.env`; no se imprimió, copió a documentación ni incluyó en comandos como valor literal.
Todos los textos enviados para esta comprobación son sintéticos.

## Resultados observados

| Prueba | Resultado |
|---|---|
| Catálogo NVIDIA | Respondió; listar un modelo no garantiza que su inferencia funcione |
| DeepSeek V4.1 Flash, JSON mode | Timeout con 10 s/reintentos y con 60 s sin reintentos |
| DeepSeek V4.1 Flash, sin JSON mode | Timeout a 30 s |
| Kimi K2.6 listado por el catálogo | NotFoundError / HTTP 404 al solicitar inferencia |
| GPT-OSS-20B, contrato completo con JSON mode | Timeout a 30 s |
| GPT-OSS-20B, mensaje mínimo sin JSON mode | Respuesta en 1.47 s |
| GPT-OSS-20B, mismo contrato de ingesta sin JSON mode | Respuesta validada en 3.62 s |

Se retiró `response_format={type: json_object}` del adaptador. La instrucción contiene el esquema
JSON completo y Pydantic sigue rechazando salidas inválidas. Las pruebas de contrato y error se
mantienen; suite offline tras el cambio: **53 passed en 16.79 s**, Ruff aprobado.
Estos resultados son observaciones locales, no una garantía de disponibilidad futura ni benchmark.

## Flujo real de la aplicación

- Proveedor persistido: `nvidia:openai/gpt-oss-20b`; `is_simulated=false`.
- Ejecución: `f27c37a6-0fcb-4b01-85e8-f5ef2a4d3b08`.
- POST devolvió 202 QUEUED; luego RUNNING y WAITING_APPROVAL con propuesta persistida y sin error.
- Trazas verificadas de ingestion, verification y coordination. Revisión humana dejada pendiente.
- API y proxy del frontend devuelven health con `provider=nvidia`, `is_simulated=false`.
- Configuración local: timeout 30 s, negocio `data/runtime/aguaia-nvidia.db`, checkpoints
  `data/runtime/checkpoints-nvidia.db`. Los archivos de la demo mock se conservaron sin borrar.

La UI debe mostrar MODO NVIDIA después de recargar. La puntuación permanece determinística por
arquitectura; los sectores y sus cifras siguen siendo sintéticos. No hay despacho real de agua.
No se ejecutaron las 22 evals contra el modelo real ni se verificó facturación. No se afirma que
DeepSeek/Kimi estén validados; GPT-OSS-20B se seleccionó explícitamente por configuración, sin fallback
automático. No se cambiaron dependencias, grafo, contratos públicos ni reglas de prioridad.

## Comprobación con clave nueva — 2026-10-17

Clave leída del `.env` de la raíz, sin imprimirla. Timeout de 30 s por intento con 2 reintentos del
cliente (≈92 s en total). Textos: 3 reportes de `data/demo_scenario.json` (corte, hospital, fuga).

| Modelo | `extract_report` (3 textos) | Resultado |
|---|---|---|
| `openai/gpt-oss-20b` | 3.8 s, 7.3 s, 3.8 s | Contrato válido; tipo, horas y criticidad correctos |
| `nvidia/nemotron-3-super-120b-a12b` | 14.0 s, 7.4 s, 6.5 s | Contrato válido; alternativa más lenta |
| `deepseek-ai/deepseek-v4.1-flash` | 3 × ≈92 s | APITimeoutError |
| `google/gemma-4-31b-it` | ≈92 s, 60 s, ≈92 s | Timeout y una salida inválida |
| `nvidia/nemotron-3.5-lightning-30b-a3b`, `z-ai/glm-5.3-flash` | 3 × ≈92 s | APITimeoutError |
| `openai/gpt-oss-120b`, `meta/llama-3.3-70b-instruct`, `mistralai/mistral-large-2-instruct` | < 0.5 s | No disponibles en esta cuenta (APIStatusError / NotFoundError) |

Con `gpt-oss-20b`: `evaluate_duplicate` 8.5 s y 6.2 s (coincidencia correcta), y
`explain_priority_proposal` 2.3 s ×2. **Defecto:** la explicación dijo «26 horas» para un reporte de
24 h: confunde los 26 puntos del factor de duración con horas. Se corrige en F4.

Decisión D-04: modo real con `openai/gpt-oss-20b` y timeout de 30 s (`.env.example`, `config.py`,
README). Un reporte completo tarda unos 15–20 s en las tres llamadas.
