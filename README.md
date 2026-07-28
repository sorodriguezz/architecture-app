# ArchFlow

Aplicación de escritorio que toma un problema de negocio y devuelve una **decisión de arquitectura
documentada**: un ADR con su matriz de trade-off ponderada, diagramas Mermaid, patrones aplicados,
riesgos y roadmap — todo en Markdown, versionado en tu repositorio de GitHub.

El análisis lo ejecuta **Claude Code en modo headless** como subproceso local. No hay claves de API
ni servidor propio: la app usa la sesión que ya tienes en la CLI.

- **Windows 11 (x86-64)** — instalador NSIS
- **macOS** — `.dmg` universal (Intel + Apple Silicon)

---

## Qué hace

1. **Capturas el contexto** en un asistente de cuatro pasos: problema de negocio, objetivos,
   estado actual, restricciones, escala, equipo, cumplimiento y presupuesto.
2. **Priorizas los drivers**: eliges atributos de calidad y les das un peso de 1 a 5. Ese peso es
   literalmente el que pondera la matriz — no es decorativo.
3. **ArchFlow analiza** con Claude Code, que puede leer tu repositorio para conocer el stack real
   antes de recomendar.
4. **Obtienes un documento completo** con seis vistas:

| Vista          | Qué muestra                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| **Documento**  | El ADR completo en Markdown, editable en la app                                   |
| **Trade-offs** | Matriz criterios × opciones con puntajes ponderados, y pros/contras por opción     |
| **Diagramas**  | Cada diagrama Mermaid renderizado, con zoom, código fuente y exportación a SVG     |
| **Patrones**   | Los patrones aplicados agrupados por familia, con el porqué y dónde vive cada uno  |
| **Riesgos**    | Registro ordenado por severidad, más los supuestos que hubo que hacer             |
| **Refinar**    | Conversación sobre la decisión, reanudando la sesión de la CLI                    |

5. **Se guarda y publica**: el `.md` va a `docs/architecture/ADR-NNN-<slug>.md` del proyecto, con
   commit y push desde la app.

Además trae un **catálogo de 100 patrones** consultable sin gastar una corrida de IA —
arquitectónicos, de diseño, resiliencia, concurrencia, datos, integración, seguridad y despliegue —
cada uno con el problema que resuelve y lo que cuesta usarlo.

---

## Requisitos

| | |
| --- | --- |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` y luego `claude` para iniciar sesión. ArchFlow lo busca en el `PATH` y en los directorios habituales de instalación. |
| **Node + npx** | Solo si vas a instalar skills desde [skills.sh](https://skills.sh). |
| **Git** | No hace falta: la app usa `libgit2` embebido. |

Para desarrollar: Node 22, pnpm 11 y la toolchain estable de Rust
([prerrequisitos de Tauri](https://tauri.app/start/prerequisites/)).

---

## Desarrollo

```bash
pnpm install
pnpm tauri dev        # app en caliente
pnpm typecheck        # tsc --noEmit
pnpm build            # bundle de producción del frontend
node scripts/ui_smoke.mjs   # recorre las vistas con el IPC simulado y toma capturas

cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test
```

### Compilar los instaladores

```bash
pnpm tauri build                                    # para la plataforma actual
pnpm tauri build --target universal-apple-darwin    # macOS universal
pnpm tauri build --target x86_64-pc-windows-msvc    # Windows 11 x86-64
```

---

## Estructura

```
src/                        Frontend — React 19 + Vite 7 + Tailwind 4 + zustand
  components/
    intake/                 Asistente de captura del brief
    decision/               Resultado: matriz, patrones, riesgos, refinamiento
    diagrams/               Render de Mermaid
    docs/                   Árbol y editor de .md, catálogo de patrones
    settings/               Motor de IA, prompts, skills, MCP, git, datos
  lib/
    catalog.ts              Catálogo de patrones y atributos de calidad
    parseDecision.ts        Parseo del contrato de salida del modelo
    mermaid.ts              Carga diferida y render de diagramas
    tauri/                  Envoltorios tipados de los comandos e eventos
  state/                    Stores de zustand

src-tauri/                  Backend — Rust + Tauri 2
  src/
    ai/
      mod.rs                Spawn, streaming, cancelación, resolución del binario
      claude.rs             Banderas de la CLI e interpretación de stream-json
      prompts.rs            Plantillas de arquitectura y contrato de salida
      runs.rs               Registro de corridas vivas
    commands/               Comandos expuestos al frontend
    db/                     SQLite con migraciones versionadas
    git.rs                  init / clone / status / commit / push / pull (libgit2)
    fsops.rs                Acceso a archivos confinado al proyecto
    paths.rs                Ubicación de los datos de la app
    secrets.rs              Credenciales en el llavero del sistema operativo

.github/workflows/
  ci.yml                    Typecheck, build, humo de UI, fmt/clippy/test en Windows y macOS
  release.yml               tauri-action → release de GitHub con instaladores firmados
```

### Dónde viven los datos

| Qué | Dónde |
| --- | --- |
| Base SQLite, skills, configuración MCP | `C:\ArchFlow` (Windows) · `~/ArchFlow` (macOS) |
| Documentos `.md` | `docs/architecture/` **dentro del repositorio de cada proyecto** |
| Token de git | Credential Manager / Llavero del sistema operativo |

El desinstalador de Windows pregunta si conservar o borrar `C:\ArchFlow`, así que reinstalar no
pierde nada.

---

## El contrato de salida

`ai/prompts.rs` le pide al modelo un documento con una forma concreta, y el frontend la parsea:

- Un bloque ` ```json archflow ` al inicio con criterios, opciones, puntajes, patrones, riesgos,
  supuestos y preguntas abiertas → alimenta las pestañas de trade-offs, patrones y riesgos.
- Cada diagrama en un fence ` ```mermaid ` bajo su propio encabezado `###` → el encabezado es el
  título del diagrama.
- El resto en Markdown con secciones fijas (`## Contexto`, `## Decisión`, `## Riesgos y
  mitigaciones`, …).

El parser tolera lo que un modelo se equivoca en la práctica: comas colgando, comentarios `//`, el
bloque sin la etiqueta `archflow`, o el documento envuelto en un fence. Si aun así el bloque no se
puede recuperar, se muestra el documento en prosa y un aviso — nunca una pantalla rota.

Puedes reescribir cualquier plantilla en **Ajustes → Prompts**. Si cambias la del análisis, respeta
esos marcadores o las vistas estructuradas dejarán de poblarse.

---

## Skills y MCP

- **Skills**: se instalan desde [skills.sh](https://skills.sh) con `npx skills add`, quedan en la
  carpeta de datos y se copian a `.claude/skills/` del proyecto justo antes de cada corrida (Claude
  Code solo descubre skills relativas a su directorio de trabajo). También puedes escribir una en
  la app — el caso típico es una skill con los criterios de arquitectura de tu organización, para
  que cada ADR salga alineado sin repetirlos en cada brief.
- **MCP**: se configuran por proyecto y se materializan en un JSON que se pasa con `--mcp-config`
  y `--strict-mcp-config`. Si no hay ninguno habilitado no se pasa la bandera, para no desactivar
  los MCP globales del usuario.

---

## Publicar una versión

1. Genera la llave del updater una sola vez:
   ```bash
   pnpm tauri signer generate -w ~/.tauri/archflow.key
   ```
2. Guarda el contenido de `~/.tauri/archflow.key` como el secreto de repositorio
   `TAURI_SIGNING_PRIVATE_KEY`, y pega la clave pública en `src-tauri/tauri.conf.json` →
   `plugins.updater.pubkey`.
3. Ajusta `plugins.updater.endpoints` y `productName`/`identifier` a tu repositorio.
4. Sube el número de versión en `package.json` y haz push a `main`. El workflow detecta la versión
   nueva, compila en Windows y macOS, y publica el release con los instaladores.

`src-tauri/tauri.conf.json` toma la versión desde `package.json`, así que solo se cambia en un
lugar.

---

## Licencia

MIT.
