import type { MermaidConfig } from "mermaid";

/**
 * Mermaid se carga de forma diferida.
 *
 * Con sus dependencias (cytoscape, dagre, katex) pesa varios MB: importarlo desde el arranque
 * retrasaría la primera pantalla aunque el usuario nunca abra un diagrama. Se importa la primera
 * vez que hay algo que dibujar y a partir de ahí queda en memoria.
 */
type MermaidApi = typeof import("mermaid").default;

let loader: Promise<MermaidApi> | null = null;
let currentTheme: "dark" | "light" | null = null;

function config(theme: "dark" | "light"): MermaidConfig {
  return {
    startOnLoad: false,
    theme: theme === "dark" ? "dark" : "default",
    // `securityLevel: "strict"` desactiva scripts y saneado de etiquetas dentro del diagrama —
    // el código Mermaid viene de un modelo, así que es entrada no confiable.
    securityLevel: "strict",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
    themeVariables:
      theme === "dark"
        ? {
            background: "#0b1020",
            primaryColor: "#312e81",
            primaryTextColor: "#e2e8f0",
            primaryBorderColor: "#6366f1",
            lineColor: "#94a3b8",
            secondaryColor: "#1e293b",
            tertiaryColor: "#0f172a",
          }
        : {
            background: "#ffffff",
            primaryColor: "#e0e7ff",
            primaryTextColor: "#1e293b",
            primaryBorderColor: "#6366f1",
            lineColor: "#64748b",
          },
    flowchart: { curve: "basis", htmlLabels: true, useMaxWidth: true },
    sequence: { useMaxWidth: true, showSequenceNumbers: false },
    er: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  };
}

async function api(theme: "dark" | "light"): Promise<MermaidApi> {
  if (!loader) {
    loader = import("mermaid").then((m) => m.default);
  }
  const mermaid = await loader;
  // Reinicializar solo cuando el tema cambió: `initialize` es caro y se llamaría en cada render.
  if (currentTheme !== theme) {
    mermaid.initialize(config(theme));
    currentTheme = theme;
  }
  return mermaid;
}

export interface RenderResult {
  svg: string | null;
  error: string | null;
}

/**
 * Contenedor **propio de cada render**, oculto pero dentro del documento.
 *
 * Tiene que estar en el árbol del documento porque los renderizadores de secuencia y de clases
 * miden el texto con `getBBox()`, que sobre un nodo desprendido devuelve cero.
 *
 * Y tiene que ser uno por render, no uno compartido: la pestaña de diagramas monta todos sus
 * componentes a la vez, así que hay varios `render()` en vuelo simultáneamente. Con un contenedor
 * común, el primero en terminar lo vaciaba y le arrancaba el nodo temporal al que seguía
 * dibujando — que fallaba con «Cannot read properties of null (reading 'firstChild')» sin ninguna
 * relación con su propio código.
 *
 * `visibility: hidden` en vez de `display: none` porque un elemento sin caja no se puede medir.
 */
function makeSandbox(): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("aria-hidden", "true");
  Object.assign(node.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "1200px",
    visibility: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(node);
  return node;
}

/**
 * Contador para los ids de render. Se usa en vez de `Date.now()` porque dos diagramas que se
 * dibujan en el mismo milisegundo —lo normal al abrir la pestaña— colisionarían, y Mermaid
 * reutilizaría el nodo del primero para el segundo.
 */
let renderSeq = 0;

/**
 * Renderiza un diagrama a SVG. Nunca lanza: un diagrama inválido es un resultado esperado
 * (el modelo se equivoca con la sintaxis), y la UI tiene que poder mostrar el error junto al
 * código fuente para que el usuario lo corrija a mano.
 */
export async function renderMermaid(id: string, code: string, theme: "dark" | "light"): Promise<RenderResult> {
  const host = makeSandbox();
  try {
    const mermaid = await api(theme);
    // `parse` da un mensaje de error mucho más claro que dejar fallar a `render`.
    await mermaid.parse(code);
    const { svg } = await mermaid.render(`mmd-${id}-${renderSeq++}`, code, host);
    return { svg, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { svg: null, error: message };
  } finally {
    host.remove();
  }
}

/** Descarga un SVG ya renderizado. */
export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}
