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

## Convenciones

- Comentarios en el código solo cuando explican **por qué**, no **qué**. Los comentarios existentes
  documentan decisiones no obvias (por qué stdout se parsea antes que el exit status, por qué el
  reset ocurre en el siguiente arranque); consérvalos al refactorizar.
- Errores de cara al usuario en español y accionables.
- Sin `any` en TypeScript. `strict`, `noUnusedLocals` y `noUnusedParameters` están activos.
- Los estilos usan las variables CSS del tema (`var(--accent)`, `text-ink`, `text-muted`), nunca
  colores literales — si no, el tema claro se rompe.
