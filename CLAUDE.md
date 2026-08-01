# ArchFlow — contexto para agentes

App de escritorio (Tauri 2 + React 19) que produce decisiones de arquitectura documentadas usando
Claude Code en modo headless. Todo el texto de la interfaz, los comentarios y los prompts están en
**español**.

## Comandos

```bash
pnpm install
pnpm typecheck                                   # tsc --noEmit
pnpm build                                       # bundle del frontend
node scripts/ui_smoke.mjs                        # recorre las vistas con el IPC simulado
node scripts/gen_icons.mjs                       # regenera la marca (SVG + iconos)
pnpm tauri dev                                   # app completa en caliente

cd src-tauri && cargo fmt --all --check
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test
```

Antes de dar por terminado un cambio: `pnpm typecheck`, `pnpm build` y, si tocaste Rust,
`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`.

## Invariantes que no se pueden romper en silencio

1. **El contrato de salida.** `src-tauri/src/ai/prompts.rs` le pide al modelo un bloque
   ` ```json archflow `, fences ` ```mermaid ` bajo encabezados `###`, y secciones `##` fijas.
   `src/lib/parseDecision.ts` parsea exactamente eso. Cambiar uno sin el otro no produce ningún
   error: las pestañas de trade-offs, patrones, riesgos y diagramas simplemente quedan vacías.

2. **`src/types/domain.ts` refleja `src-tauri/src/db/models.rs`.** Rust serializa en camelCase con
   `#[serde(rename_all = "camelCase")]`. Un campo agregado en un lado y no en el otro compila en
   ambos y falla en runtime.

3. **`src/lib/tauri/commands.ts` refleja el `invoke_handler` de `src-tauri/src/lib.rs`.** Los
   nombres de parámetro también: Tauri hace el mapeo camelCase → snake_case, pero un parámetro mal
   escrito solo se ve como un error en tiempo de ejecución.

4. **Las claves de configuración están duplicadas a propósito** en
   `src-tauri/src/commands/settings_cmd.rs` (constantes `KEY_*`) y en `SettingKey` de
   `src/lib/tauri/commands.ts`. Si cambias una, cambia la otra.

5. **El `MutexGuard` de la base no cruza un `.await`.** Es un `std::sync::Mutex`; los comandos
   async resuelven todo lo que necesitan de la base en un bloque, sueltan el guard y recién ahí
   invocan la CLI. `prepare()` en `decision_cmd.rs` es el patrón a seguir.

6. **`fsops::safe_join` es obligatorio** para cualquier ruta que venga del frontend o del modelo.
   Rechaza `..` y rutas absolutas; sin él, un nombre de archivo generado por el modelo podría
   escribir fuera del proyecto.

7. **Cada render de Mermaid usa su propio contenedor** (`makeSandbox` en `src/lib/mermaid.ts`).
   Compartir uno hace que el primer diagrama en terminar le arranque el nodo temporal al que sigue
   dibujando, y el segundo falla con un error que no tiene relación con su código.

8. **Las utilidades CSS no deben colisionar con las clases de Mermaid.** Mermaid marca sus
   etiquetas de nodo con `class="label"`; por eso la clase del proyecto se llama `.field-label`.

9. **La lista de familias de patrones vive en cinco lugares.** `PATTERN_FAMILIES` en
   `src/lib/catalog.ts`, el enum del bloque JSON y la lista con viñetas de
   `src-tauri/src/ai/prompts.rs`, `PatternFamily` en `src/types/domain.ts`, `FAMILY_LABEL` en
   `src/lib/parseDecision.ts` y `FAMILY_ORDER` en `PatternsPanel.tsx`. Agregar una familia sin
   tocar las cinco no rompe nada visiblemente: los patrones de esa familia caen al final,
   agrupados bajo su id crudo.

10. **Los `drivers` y `costs` de cada patrón son ids de `QUALITY_ATTRIBUTES`**, no texto libre.
    Un id mal escrito no falla: el patrón simplemente deja de aparecer al filtrar por ese driver
    y desaparece del cálculo de tensiones.

11. **Los defaults del simulador son estimaciones, el `limit` es información.** En
    `src/lib/simulation/components.ts` los números (`serviceMs`, `concurrency`, …) son órdenes de
    magnitud editables y la UI lo dice explícitamente; el campo `limit` describe la restricción
    real que manda en cada servicio y es lo que hace útil al catálogo. No conviertas los defaults
    en afirmaciones ("Lambda hace X req/s") ni borres los `limit` al ajustar valores.

12. **El motor de simulación es determinista por semilla.** `simulate()` no usa `Math.random`
    directamente: todo el azar sale de `mulberry32(seed)`. Meter una llamada a `Math.random` hace
    que dos corridas de la misma topología den distinto y que comparar arquitecturas deje de tener
    sentido.

13. **El contrato del modelo del sistema es un segundo contrato de salida.** `MODEL_CONTRACT` en
    `src-tauri/src/ai/prompts.rs` pide un bloque ` ```json archflow-model `; `src/lib/parseModel.ts`
    parsea exactamente eso. Falla igual de callado que el contrato de decisión: el escaneo del
    repositorio y la extracción desde un ADR corren, se ven exitosos, y el diálogo de revisión
    llega vacío. El contrato se concatena al prompt en `model_cmd.rs` y **no** dentro del prompt
    editable, justamente para que personalizarlo desde Ajustes no pueda romperlo.

14. **Las cinco clases y los cuatro estados del modelo viven en tres lugares.** Los valores de
    `kind` y `status` están en los comentarios de `ModelElement` (`db/models.rs`), en
    `MODEL_CONTRACT` de `prompts.rs`, y en `MODEL_KINDS` / `MODEL_STATUSES` de `src/lib/model.ts`.
    Una clase que Rust acepte y el frontend no conozca se guarda sin error y no aparece en ninguna
    pestaña; `parseModel.ts` descarta las que no reconoce.

15. **`prepare()` inyecta el modelo del sistema en cada corrida.** `decision_cmd::prepare` resuelve
    los elementos y los renderiza con `prompts::render_model`, y `build_brief_payload` los antepone
    al problema. Es lo que hace que la decisión número siete sepa qué existe. Si un comando nuevo
    invoca la CLI sin pasar por `prepare`, ese análisis pierde la memoria del proyecto y no hay
    forma de notarlo salvo por lo que recomienda.

16. **La marca es generada.** `public/archflow.svg` y todo `src-tauri/icons/` los escribe
    `scripts/gen_icons.mjs` desde el SVG que vive dentro de ese script. Editar el SVG público a
    mano se pierde en la siguiente corrida; el logo de la app lo referencia por URL justamente
    para que no puedan divergir.

    Regenerar los iconos **no** alcanza para que cambie el de la ventana y la barra de tareas:
    `tauri_build::build()` embebe `icons/icon.ico` en el ejecutable y su build script solo se
    vuelve a correr si cambia `tauri.conf.json` o `build.rs`, no si cambia `icons/`. Un `cargo
    build` normal recompila el crate y deja el icono viejo adentro, sin ningún aviso. Después de
    `node scripts/gen_icons.mjs` hay que tocar `src-tauri/build.rs` (o `cargo clean -p archflow`)
    y recompilar.

    Y el **orden de las entradas del `.ico` importa**: `generate_context!` se queda con
    `entries()[0]` y ese único mapa de bits es el icono de la ventana (tao crea un `HICON` de ese
    tamaño exacto y el escritorio lo reescala). Por eso `ICO_SIZES` empieza en 64 y no en 16 ni en
    256. Reordenarlo no rompe nada visible en el escritorio —elige por tamaño— pero deja el icono
    de la barra de tareas borroso o escalonado.

## Convenciones

- Comentarios en el código solo cuando explican **por qué**, no **qué**. Los comentarios existentes
  documentan decisiones no obvias (por qué stdout se parsea antes que el exit status, por qué el
  reset ocurre en el siguiente arranque); consérvalos al refactorizar.
- Errores de cara al usuario en español y accionables.
- Sin `any` en TypeScript. `strict`, `noUnusedLocals` y `noUnusedParameters` están activos.
- Los estilos usan las variables CSS del tema (`var(--accent)`, `text-ink`, `text-muted`), nunca
  colores literales — si no, el tema claro se rompe.
