/**
 * Humo de UI: sirve `dist/`, simula el puente IPC de Tauri y recorre las vistas tomando
 * capturas.
 *
 * Existe porque `pnpm build` solo prueba que el TypeScript compila — no que la aplicación
 * *renderice*. Un componente que revienta al montar (una prop indefinida, un icono inexistente)
 * pasa el typecheck y falla en pantalla. Esto lo detecta sin necesidad de compilar Tauri.
 *
 *   node scripts/ui_smoke.mjs [carpeta-de-salida]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const OUT = resolve(process.argv[2] ?? join(ROOT, ".ui-smoke"));
const PORT = 4173;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    // SPA: cualquier ruta desconocida cae al index.
    res.writeHead(200, { "content-type": "text/html" });
    res.end(await readFile(join(DIST, "index.html")));
  }
});

/** Respuestas falsas para cada comando Tauri, con datos suficientes para poblar las vistas. */
const NOW = "2026-07-20T15:00:00Z";
const PROJECT = {
  id: "p1",
  name: "Plataforma de pagos",
  path: "C:/ArchFlow/projects/plataforma-de-pagos",
  color: "#6366f1",
  context: "Todo corre en Azure. Equipo de 6 personas, fuerte en .NET.",
  createdAt: NOW,
  updatedAt: NOW,
};

const DECISION_MD = `\`\`\`json archflow
{
  "schemaVersion": 1,
  "title": "Desacoplar pagos e inventario con mensajería asíncrona",
  "decision": "Introducir una cola con patrón outbox transaccional entre pagos e inventario.",
  "confidence": 78,
  "criteria": [
    { "id": "resiliencia", "label": "Resiliencia", "weight": 5 },
    { "id": "consistencia", "label": "Consistencia", "weight": 4 },
    { "id": "ttm", "label": "Time to market", "weight": 3 },
    { "id": "costo", "label": "Costo de operación", "weight": 3 }
  ],
  "options": [
    { "id": "outbox", "name": "Cola + outbox", "summary": "Publicación transaccional con consumidor idempotente.",
      "recommended": true, "scores": { "resiliencia": 5, "consistencia": 5, "ttm": 3, "costo": 3 },
      "pros": ["No pierde eventos ante caída del broker", "Permite reintentos seguros"],
      "cons": ["Suma un proceso relay que operar"], "costLevel": "medio", "opsComplexity": "media", "timeToMarket": "medio" },
    { "id": "sincronico", "name": "Llamada sincrónica con reintentos", "summary": "Mantener HTTP directo agregando circuit breaker.",
      "recommended": false, "scores": { "resiliencia": 2, "consistencia": 4, "ttm": 5, "costo": 5 },
      "pros": ["Cambio mínimo", "Sin infraestructura nueva"], "cons": ["El acoplamiento temporal sigue ahí"],
      "costLevel": "bajo", "opsComplexity": "baja", "timeToMarket": "corto" },
    { "id": "2pc", "name": "Transacción distribuida (2PC)", "summary": "Coordinador transaccional entre ambos servicios.",
      "recommended": false, "scores": { "resiliencia": 2, "consistencia": 5, "ttm": 1, "costo": 2 },
      "pros": ["Consistencia fuerte"], "cons": ["Bloquea recursos", "Muy poco soporte en el stack actual"],
      "costLevel": "alto", "opsComplexity": "alta", "timeToMarket": "largo" }
  ],
  "patterns": [
    { "name": "Outbox transaccional", "family": "resiliencia", "why": "Evita la escritura dual entre la base y el broker.", "where": "Servicio de pagos" },
    { "name": "Idempotent consumer", "family": "concurrencia", "why": "Hace seguros los reintentos del broker.", "where": "Servicio de inventario" },
    { "name": "Publish-subscribe", "family": "integracion", "why": "Desacopla productor de consumidores futuros.", "where": "Bus de eventos" },
    { "name": "Circuit breaker", "family": "resiliencia", "why": "Corta la llamada al proveedor externo cuando se degrada.", "where": "Adaptador de pagos" },
    { "name": "Trazas distribuidas", "family": "observabilidad", "why": "Sin esto, un evento perdido entre pagos e inventario no se puede reconstruir.", "where": "Todo el flujo de checkout" }
  ],
  "risks": [
    { "id": "R-01", "title": "El equipo no tiene experiencia operando un broker", "impact": "alto", "probability": "alta", "mitigation": "Usar el servicio gestionado del proveedor y capacitar antes del corte." },
    { "id": "R-02", "title": "Mensajes duplicados generan doble cargo", "impact": "alto", "probability": "media", "mitigation": "Clave de idempotencia por orden y verificación previa al cobro." },
    { "id": "R-03", "title": "La DLQ se llena sin que nadie la mire", "impact": "medio", "probability": "media", "mitigation": "Alerta y runbook de reproceso desde el día uno." }
  ],
  "assumptions": ["El volumen no supera 500 eventos/s en el horizonte de 12 meses."],
  "openQuestions": ["¿El proveedor de pagos garantiza idempotencia por clave de cliente?"]
}
\`\`\`

## Contexto

El sistema actual encadena una llamada sincrónica desde pagos hacia inventario. Cuando el
proveedor externo se degrada, la orden queda escrita en pagos pero nunca reservada en
inventario, y soporte lo repara a mano.

## Decisión

Se introduce una cola con patrón outbox transaccional.

## Arquitectura propuesta

### Diagrama de contexto (C4 nivel 1)

\`\`\`mermaid
flowchart LR
  Cliente["Cliente web"] --> BFF["BFF de checkout"]
  BFF --> Pagos["Servicio de pagos"]
  Pagos --> Bus[("Bus de eventos")]
  Bus --> Inventario["Servicio de inventario"]
  Pagos --> Externo["Proveedor de pagos"]
\`\`\`

### Diagrama de secuencia — cobro y reserva

\`\`\`mermaid
sequenceDiagram
  participant C as Cliente
  participant P as Pagos
  participant O as Outbox
  participant B as Bus
  participant I as Inventario
  C->>P: confirmar orden
  P->>O: registrar evento en la misma transaccion
  P-->>C: 202 aceptado
  O->>B: publicar OrdenPagada
  B->>I: entregar OrdenPagada
  I-->>B: ack
\`\`\`

## Consecuencias

### Positivas
- Una caída del broker deja de perder eventos.

### Negativas
- Aparece consistencia eventual visible para el usuario.
`;

const DECISION = {
  id: "d1",
  projectId: "p1",
  title: "Desacoplar pagos e inventario",
  status: "done",
  briefJson: "{}",
  resultMd: DECISION_MD,
  docPath: "docs/architecture/ADR-001-desacoplar-pagos-e-inventario.md",
  model: "claude-opus-4-6",
  sessionId: "s-1",
  error: null,
  createdAt: NOW,
  updatedAt: NOW,
};

/** Un modelo del sistema chico pero con las cinco clases de pieza y con flechas entre ellas. */
const el = (id, kind, name, extra = {}) => ({
  id,
  projectId: "p1",
  kind,
  name,
  summary: "",
  status: "produccion",
  tech: "",
  owner: "",
  parentId: null,
  source: "manual",
  decisionId: null,
  dependsOn: "",
  location: "",
  notes: "",
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});

const MODEL_ELEMENTS = [
  el("m1", "component", "API de checkout", {
    summary: "Recibe la orden del front, cobra y confirma.",
    tech: "ASP.NET Core 8",
    owner: "Equipo Pagos",
    dependsOn: "m2\nm4",
    location: "src/Checkout",
  }),
  el("m2", "component", "Base transaccional", { tech: "SQL Server 2022", location: "infra/sql" }),
  el("m3", "component", "Servicio de inventario", {
    summary: "Reserva y libera stock.",
    tech: "ASP.NET Core 8",
    status: "construccion",
    dependsOn: "m2",
  }),
  el("m4", "integration", "Pasarela de pago", {
    summary: "Cobro con tarjeta.",
    tech: "REST/JSON",
    notes: "Sin SLA contractual. Si se cae, la orden queda pagada y no reservada.",
  }),
  el("m5", "endpoint", "POST /api/ordenes", { parentId: "m1", location: "src/Checkout/OrdenesController.cs" }),
  el("m6", "endpoint", "GET /api/ordenes/{id}", { parentId: "m1" }),
  el("m7", "entity", "Orden", { parentId: "m1", summary: "El pedido con su estado de pago." }),
  el("m8", "debt", "Sin reintentos en el cobro", {
    parentId: "m1",
    status: "propuesto",
    summary: "Un timeout de la pasarela pierde la orden.",
  }),
];

/** Lo que devuelve el escaneo: el contrato ```json archflow-model de `ai/prompts.rs`. */
const SCAN_RESULT = `\`\`\`json archflow-model
{
  "schemaVersion": 1,
  "elements": [
    { "kind": "component", "name": "Worker de notificaciones", "summary": "Manda correos de confirmación.",
      "status": "produccion", "tech": "Node 22", "owner": "", "parent": null, "dependsOn": ["Base transaccional"],
      "location": "src/Notificaciones", "notes": "" },
    { "kind": "integration", "name": "Proveedor de correo", "summary": "Envío transaccional.",
      "status": "produccion", "tech": "SMTP", "owner": "", "parent": null, "dependsOn": [],
      "location": "", "notes": "Cuota de 50k correos al mes." },
    { "kind": "endpoint", "name": "POST /api/notificaciones/reenviar", "summary": "Reenvía la confirmación.",
      "status": "produccion", "tech": "", "owner": "", "parent": "Worker de notificaciones", "dependsOn": [],
      "location": "src/Notificaciones/Api.ts", "notes": "" }
  ]
}
\`\`\``;

const RESPONSES = {
  list_projects: [PROJECT],
  list_model_elements: MODEL_ELEMENTS,
  scan_repository: SCAN_RESULT,
  extract_model_from_decision: SCAN_RESULT,
  get_project: PROJECT,
  git_status: { isRepo: true, branch: "main", remoteUrl: "https://github.com/u/repo.git", changed: ["docs/architecture/ADR-001.md"], ahead: 1, behind: 0 },
  list_decisions: [{ id: "d1", projectId: "p1", title: "Desacoplar pagos e inventario", status: "done", docPath: DECISION.docPath, model: DECISION.model, createdAt: NOW, updatedAt: NOW }],
  get_decision: DECISION,
  list_models: [
    { id: "opus", description: "Opus — el más capaz" },
    { id: "sonnet", description: "Sonnet — equilibrio" },
    { id: "haiku", description: "Haiku — rápido" },
  ],
  check_engine: { available: true, detail: "C:/Users/dev/.local/bin/claude.exe", version: "2.1.0" },
  get_setting: null,
  set_setting: null,
  data_dir: "C:/ArchFlow",
  has_git_credentials: true,
  list_skills: [{ id: "s1", projectId: "p1", skillName: "revisor-arquitectura", sourceRepo: "custom", enabled: true, createdAt: NOW }],
  list_mcp_servers: [{ id: "m1", projectId: "p1", name: "postgres", transport: "stdio", command: "npx", args: "-y\n@modelcontextprotocol/server-postgres", env: "", enabled: true, createdAt: NOW }],
  list_docs: [
    { path: "docs/architecture/ADR-001-desacoplar-pagos-e-inventario.md", name: "ADR-001-desacoplar-pagos-e-inventario.md", isDir: false, size: 4210, modified: NOW },
    { path: "docs/architecture/ADR-002-motor-de-persistencia.md", name: "ADR-002-motor-de-persistencia.md", isDir: false, size: 3120, modified: NOW },
  ],
  read_doc: DECISION_MD,
  default_prompt: "Prompt de fábrica de ejemplo…",
};

/** Un puñado de eventos como los que emite `--output-format stream-json`, para ver la corrida. */
const STREAM_LINES = [
  '{"type":"system","subtype":"init","session_id":"s-1","model":"claude-opus-4-6"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Glob","input":{"pattern":"**/*.csproj"}}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:/proj/src/Pagos/Program.cs"}}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{"pattern":"HttpClient"}}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:/proj/src/Inventario/Reserva.cs"}}]}}',
];

const MOCK = `
window.__evt = {};
window.__TAURI_INTERNALS__ = {
  invoke: (cmd, args) => {
    // El puente de eventos: 'listen' entrega el id que devolvió transformCallback, así que
    // guardarlo por nombre de evento es lo que permite emitir líneas falsas más abajo.
    if (cmd === 'plugin:event|listen') {
      window.__evt[args.event] = window['_' + args.handler];
      return Promise.resolve(0);
    }
    if (cmd === 'run_decision') {
      ${JSON.stringify(STREAM_LINES)}.forEach((line, i) => setTimeout(() => {
        const fn = window.__evt['ai:line'];
        if (fn) fn({ payload: { runId: args.runId, stream: 'stdout', line } });
      }, 150 + i * 220));
      return new Promise((ok) => setTimeout(() => ok(${JSON.stringify(DECISION)}), 4000));
    }
    return Promise.resolve(${JSON.stringify(RESPONSES)}[cmd] ?? null);
  },
  transformCallback: (cb) => { const id = Math.random(); window['_' + id] = cb; return id; },
  convertFileSrc: (p) => p,
};
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => Promise.resolve() };
`;

/** Vistas que quedan fuera del recorrido principal; igual se montan, que es lo que detecta un
 *  componente roto. */
const REMAINING = [
  { name: "19-documentos", nav: "Documentos" },
  { name: "20-ajustes", nav: "Ajustes" },
];

await new Promise((r) => server.listen(PORT, r));
// `CHROMIUM_PATH` permite apuntar a un Chromium ya instalado (entornos sin red donde no se puede
// correr `playwright install`). Sin esa variable se usa el que Playwright administra, que es lo
// que ocurre en CI.
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

await page.addInitScript(MOCK);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);

// La app arranca en Proyectos.
await page.screenshot({ path: join(OUT, "01-proyectos.png") });

// El asistente paso a paso: una plantilla llena el brief y deja ver los pasos con contenido.
await page.locator("aside button", { hasText: "Nueva decisión" }).first().click();
await page.waitForTimeout(400);
await page.locator("main button", { hasText: "Monolito vs. microservicios" }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "02-nueva-decision.png") });

for (const [i, label] of ["Drivers", "Revisar"].entries()) {
  await page.locator("main nav button", { hasText: label }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `0${3 + i}-wizard-${label.toLowerCase()}.png`) });
}

// La corrida en vivo: se dispara el análisis y se captura mientras el stream falso llega.
await page.locator("main button", { hasText: "Analizar" }).last().click();
await page.waitForTimeout(1400);
await page.screenshot({ path: join(OUT, "05-corrida-en-vivo.png") });

// El log crudo se abre y se cierra: monta `RunLogPanel`, que si no nunca se ejercitaría.
await page.locator("main button", { hasText: "Ver el log crudo" }).click();
await page.waitForTimeout(400);
await page.locator('button[aria-label="Cerrar log"]').click();
await page.waitForTimeout(2800); // deja que la corrida falsa termine y navegue al resultado

// La decisión de ejemplo, con sus cuatro pestañas de resultado.
await page.locator("aside").getByText("Desacoplar pagos e inventario").first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, "06-decision-documento.png") });

for (const [i, tab] of ["Trade-offs", "Diagramas", "Patrones", "Riesgos"].entries()) {
  await page.locator("main nav button", { hasText: tab }).last().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `${String(7 + i).padStart(2, "0")}-decision-${tab.toLowerCase()}.png`) });
}

// El modelo del sistema: el mapa generado del inventario, una pestaña de detalle y la revisión
// de una propuesta del escaneo (que es donde se decide qué entra a la base).
await page.locator("aside button", { hasText: "Modelo del sistema" }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, "11-modelo-mapa.png") });
await page.locator("main nav button", { hasText: "Componentes" }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "12-modelo-componentes.png") });
await page.locator("main button", { hasText: "Escanear el repositorio" }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, "13-modelo-propuesta.png") });
await page.locator('[role="dialog"] button', { hasText: "Descartar" }).click();
await page.waitForTimeout(300);

// El catálogo, y después filtrado por driver: el camino que abre el paso de Drivers.
await page.locator("aside button", { hasText: "Patrones" }).first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, "14-patrones.png") });
await page.locator('select[aria-label="Filtrar por atributo de calidad"]').selectOption("Resiliencia");
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, "15-patrones-por-driver.png") });

// Los simuladores entran por un selector que explica qué responde cada uno.
await page.locator("aside button", { hasText: "Simuladores" }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, "16-simuladores-inicio.png") });

// El de carga corre solo al montar, así que hay que darle tiempo.
await page.locator("main article", { hasText: "¿Aguanta el tráfico?" }).getByRole("button", { name: "Abrir" }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, "17-simulador-carga.png") });

// Se vuelve al selector para entrar al otro: ejercita el botón de retroceso de la cabecera.
await page.locator("main").getByRole("button", { name: "Simuladores" }).click();
await page.waitForTimeout(400);
await page.locator("main article", { hasText: "¿Aguanta el crecimiento?" }).getByRole("button", { name: "Abrir" }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, "18-simulador-estructura.png") });

for (const shot of REMAINING) {
  await page.locator("aside button", { hasText: shot.nav }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
}

// Tema claro, para verificar que los tokens CSS se aplican en ambos.
await page.locator('button[aria-label="Cambiar tema"]').click();
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, "21-tema-claro.png") });

await browser.close();
server.close();

if (errors.length) {
  console.error("ERRORES EN CONSOLA:\\n" + [...new Set(errors)].join("\\n"));
  process.exit(1);
}
console.log("humo de UI OK — capturas en", OUT);
