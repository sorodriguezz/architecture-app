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
    { "name": "Circuit breaker", "family": "resiliencia", "why": "Corta la llamada al proveedor externo cuando se degrada.", "where": "Adaptador de pagos" }
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

const RESPONSES = {
  list_projects: [PROJECT],
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

const MOCK = `
window.__TAURI_INTERNALS__ = {
  invoke: (cmd) => Promise.resolve(${JSON.stringify(RESPONSES)}[cmd] ?? null),
  transformCallback: (cb) => { const id = Math.random(); window['_' + id] = cb; return id; },
  convertFileSrc: (p) => p,
};
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => Promise.resolve() };
`;

const SHOTS = [
  { name: "01-proyectos", nav: "Proyectos" },
  { name: "02-nueva-decision", nav: "Nueva decisión" },
  { name: "03-documentos", nav: "Documentos" },
  { name: "04-patrones", nav: "Patrones" },
  { name: "05-ajustes", nav: "Ajustes" },
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

for (const shot of SHOTS) {
  const button = page.locator("aside button", { hasText: shot.nav }).first();
  if (await button.count()) {
    await button.click();
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
}

// La decisión de ejemplo, con sus cuatro pestañas de resultado.
await page.locator("aside").getByText("Desacoplar pagos e inventario").first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, "06-decision-documento.png") });

for (const [i, tab] of ["Trade-offs", "Diagramas", "Patrones", "Riesgos"].entries()) {
  await page.locator("nav button", { hasText: tab }).last().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `0${7 + i}-decision-${tab.toLowerCase()}.png`) });
}

// Tema claro, para verificar que los tokens CSS se aplican en ambos.
await page.locator('button[aria-label="Cambiar tema"]').click();
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, "11-tema-claro.png") });

await browser.close();
server.close();

if (errors.length) {
  console.error("ERRORES EN CONSOLA:\\n" + [...new Set(errors)].join("\\n"));
  process.exit(1);
}
console.log("humo de UI OK — capturas en", OUT);
