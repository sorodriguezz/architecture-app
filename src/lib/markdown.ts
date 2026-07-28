import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Markdown → HTML seguro.
 *
 * El markdown viene de un modelo, así que es contenido no confiable: sin sanitizar, un
 * `<img onerror=…>` en la respuesta correría con los privilegios del webview, que en Tauri
 * incluyen `invoke`. DOMPurify va después de `marked` por eso, y no es opcional.
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown ?? "", { async: false, gfm: true, breaks: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** Los fences de mermaid se renderizan aparte; en el documento se muestran como referencia. */
export function stripMermaidBlocks(markdown: string): string {
  return markdown.replace(/```[ \t]*mermaid[ \t]*\n[\s\S]*?\n[ \t]*```/gi, "");
}

/** Primer párrafo no vacío — el resumen de una tarjeta. */
export function firstParagraph(markdown: string, maxLength = 220): string {
  const plain = (markdown ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_`>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trimEnd()}…` : plain;
}
