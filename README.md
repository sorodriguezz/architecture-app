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

1. **Capturas el contexto** en un asistente de cinco pasos: problema de negocio, objetivos,
   estado actual, restricciones, escala, equipo, cumplimiento y presupuesto. El borrador se
   guarda solo, así que se puede ir a consultar el catálogo a mitad de camino sin perderlo.
2. **Priorizas los drivers**: eliges atributos de calidad y les das un peso de 1 a 5. Ese peso es
   literalmente el que pondera la matriz — no es decorativo. La app te muestra qué patrones
   empuja cada driver y **dónde vas a tener que ceder**: los pares que tiran en direcciones
   opuestas, medidos sobre el catálogo.
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

Antes de ejecutar, el paso de **Revisar** muestra qué se va a enviar y qué va a tener que suponer
el análisis por cada campo que dejaste vacío — con la consecuencia concreta, no un asterisco rojo.
Mientras corre, la vista muestra la etapa estimada y la actividad real de la CLI (qué archivos está
leyendo, cuánto lleva escrito) en vez del volcado JSON.

### Simuladores

Dos simuladores que responden la misma pregunta —si la arquitectura aguanta— en dos escalas
distintas, y que corren enteros en la app sin gastar una corrida de IA:

- **Carga.** Simulación por eventos discretos sobre la topología que armes: peticiones
  individuales que compiten por servidores, hacen cola, se agotan por timeout y se reintentan. Con
  un catálogo de ~40 componentes —RabbitMQ, Kafka, NATS, Redis Streams, PostgreSQL y los
  gestionados de **AWS, Azure y GCP**— cada uno con el límite que en la práctica termina mandando
  (particiones de Kafka, concurrencia de cuenta de Lambda, RU/s de Cosmos, shards de Kinesis…).
  Devuelve latencia p50/p95/p99 separando la respuesta al llamador de la de extremo a extremo,
  utilización por etapa, backlog en el tiempo y un diagnóstico de dónde está el cuello. Con la
  misma semilla, la misma configuración da siempre el mismo resultado.
- **Estructura de directorios.** Proyecta cómo envejece una organización de carpetas —por capas,
  hexagonal, vertical slices, monolito modular, repositorio por servicio o monorepo— a medida que
  el proyecto suma módulos y equipos. Muestra el árbol resultante en el mes que elijas y las tres
  cosas que se sienten al trabajar: cuántos archivos se acumulan en el peor directorio, cuántas
  carpetas hay que tocar para un cambio, y qué fracción del código vive en carpetas sin dueño
  único.

Los valores por defecto de ambos son órdenes de magnitud editables, no mediciones de tu sistema.

Además trae un **catálogo de 124 patrones** consultable sin gastar una corrida de IA —
arquitectónicos, de diseño, resiliencia, concurrencia, datos, integración, observabilidad,
seguridad y despliegue — cada uno con el problema que resuelve, lo que cuesta usarlo y **qué
atributos de calidad mueve en cada dirección**, para poder entrar por "necesito resiliencia" y
salir con los patrones que la dan.

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
node scripts/gen_icons.mjs  # regenera la marca: public/archflow.svg + src-tauri/icons/*

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
    simulator/              Simuladores de carga y de estructura de directorios
    docs/                   Árbol y editor de .md, catálogo de patrones
    settings/               Motor de IA, prompts, skills, MCP, git, datos
  lib/
    catalog.ts              Patrones, atributos de calidad y la relación entre ambos
    briefStatus.ts          Completitud del brief y qué implica cada hueco
    runProgress.ts          Reduce el stream de la CLI a etapa y actividad
    simulation/
      components.ts         Catálogo de componentes (OSS, AWS, Azure, GCP) y sus límites
      engine.ts             Motor de eventos discretos: colas, timeouts, reintentos
      presets.ts            Topologías de arranque
      structure.ts          Crecimiento de la estructura de directorios
    parseDecision.ts        Parseo del contrato de salida del modelo
    mermaid.ts              Carga diferida y render de diagramas
    tauri/                  Envoltorios tipados de los comandos e eventos
  state/                    Stores de zustand

scripts/
  gen_icons.mjs             Fuente de la marca: SVG → public/ + iconos del instalador
  ui_smoke.mjs              Humo de UI con el IPC de Tauri simulado

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
