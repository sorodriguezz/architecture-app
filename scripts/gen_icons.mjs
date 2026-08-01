/**
 * Genera la marca de ArchFlow: `public/archflow.svg` y todo el set de iconos de escritorio
 * (PNG, .ico y .icns) desde una sola definición vectorial.
 *
 *   node scripts/gen_icons.mjs
 *
 * Se corre a mano cuando cambia la marca. El SVG de este archivo es la fuente de verdad: el
 * favicon, el logo de la barra de título y los iconos del instalador salen todos de aquí, así
 * que no hay forma de que se desincronicen.
 *
 * El rasterizado lo hace Chromium: cada tamaño se dibuja desde el vector a ese tamaño exacto
 * (en vez de reescalar un PNG grande), que es la única manera de que 16×16 no salga sucio.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const ICONS = join(ROOT, "src-tauri", "icons");
const PUBLIC = join(ROOT, "public");

// ---------------------------------------------------------------------------
// La marca
// ---------------------------------------------------------------------------
//
// Un lazo de tres nodos —la forma mínima de un grafo de arquitectura— recorrido por un flujo
// de color continuo, con una chispa de IA en el centro. Los nodos se apoyan justo en los
// vértices porque ahí es donde chocan los extremos de dos degradados: el círculo blanco tapa
// el corte y de paso es lo que hace legible la figura a 16 px.
//
// La marca va sobre fondo transparente, sin placa: en la barra de tareas el icono se recorta
// contra el escritorio en vez de flotar dentro de un cuadrado negro. Eso obliga a dos cosas:
// nada de desenfoques (se ven como una mancha sobre fondo claro) y un borde en las piezas
// blancas, que si no desaparecen sobre blanco.

const V = [
  [512, 260], // vértice superior
  [730.24, 638], // inferior derecho
  [293.76, 638], // inferior izquierdo
];
const ARC_R = 340; // radio del arco entre vértices: mayor = lados más rectos
const STROKE = 78;
const NODE_R = 54;
const RIM = 12; // borde de nodos y chispa: es lo único que las sostiene sobre un fondo claro
const RIM_COLOR = "#8B5CF6";

// Encuadre. El lazo se dibuja en su geometría natural y se escala y recentra recién al final,
// así los números de arriba siguen siendo legibles. `MARK_CY` no es 512: los arcos bajan más
// de lo que sube el vértice superior, y el centro real de la figura queda por encima del
// centro del triángulo.
const MARK_CY = 475;
const SCALE = 1.55;

/** Degradados del flujo, uno por lado: ámbar → rosa → violeta → cian. */
const EDGE_COLORS = [
  ["#FDBA3B", "#F43F8E"],
  ["#F43F8E", "#8B5CF6"],
  ["#8B5CF6", "#22D3EE"],
];

const edges = EDGE_COLORS.map((colors, i) => {
  const from = V[i];
  const to = V[(i + 1) % 3];
  return {
    id: `af-edge-${i}`,
    d: `M ${from[0]} ${from[1]} A ${ARC_R} ${ARC_R} 0 0 1 ${to[0]} ${to[1]}`,
    from,
    to,
    colors,
  };
});

/** Chispa de cuatro puntas centrada: el signo de que detrás de esto hay un modelo. */
const SPARK =
  "M 512 396 C 522 462 562 502 628 512 C 562 522 522 562 512 628 " +
  "C 502 562 462 522 396 512 C 462 502 502 462 512 396 Z";

function markSvg(size) {
  const flow = edges
    .map((e) => `<path d="${e.d}" stroke="url(#${e.id})" stroke-width="${STROKE}" stroke-linecap="round" fill="none"/>`)
    .join("");

  // El radio del `fill` incluye medio borde para que el blanco visible siga siendo `NODE_R`:
  // el anillo crece hacia afuera y no se come el nodo.
  const nodes = V.map(
    ([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="${NODE_R + RIM / 2}" fill="#F4F7FF" stroke="${RIM_COLOR}" stroke-width="${RIM}"/>`,
  ).join("");

  const gradients = edges
    .map(
      (e) => `<linearGradient id="${e.id}" gradientUnits="userSpaceOnUse"
        x1="${e.from[0]}" y1="${e.from[1]}" x2="${e.to[0]}" y2="${e.to[1]}">
        <stop offset="0" stop-color="${e.colors[0]}"/><stop offset="1" stop-color="${e.colors[1]}"/>
      </linearGradient>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024" role="img" aria-label="ArchFlow">
  <defs>
    ${gradients}
  </defs>
  <g transform="translate(512 512) scale(${SCALE}) translate(-512 -${MARK_CY})">
    ${flow}
    ${nodes}
    <path d="${SPARK}" fill="#FFFFFF" stroke="${RIM_COLOR}" stroke-width="${RIM}" stroke-linejoin="round"/>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Empaquetado de contenedores
// ---------------------------------------------------------------------------

/** Contenedor ICO: cabecera + una entrada por tamaño + los PNG concatenados. */
function buildIco(pngs) {
  const entries = [...pngs.entries()];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach(([size, data], i) => {
    const at = i * 16;
    // 256 se codifica como 0: el campo es de un byte.
    dir.writeUInt8(size >= 256 ? 0 : size, at);
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
    dir.writeUInt8(0, at + 2); // colores de paleta
    dir.writeUInt8(0, at + 3); // reservado
    dir.writeUInt16LE(1, at + 4); // planos
    dir.writeUInt16LE(32, at + 6); // bits por pixel
    dir.writeUInt32LE(data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, dir, ...entries.map(([, data]) => data)]);
}

/** Contenedor ICNS con entradas PNG (soportadas desde macOS 10.7). */
function buildIcns(pngs) {
  const TYPES = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
  const chunks = [];
  for (const [size, ostype] of Object.entries(TYPES)) {
    const data = pngs.get(Number(size));
    if (!data) continue;
    const head = Buffer.alloc(8);
    head.write(ostype, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    chunks.push(head, data);
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// ---------------------------------------------------------------------------

/**
 * Chromium para rasterizar. Se prefiere el que administra Playwright, pero si no está
 * descargado se cae a un Chrome/Edge del sistema: generar iconos no debería obligar a bajar
 * 150 MB de navegador.
 */
function systemBrowser() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  return candidates.find((p) => existsSync(p));
}

async function launch() {
  try {
    return await chromium.launch({ args: ["--no-sandbox"] });
  } catch (err) {
    const executablePath = systemBrowser();
    if (!executablePath) throw err;
    return chromium.launch({ executablePath, args: ["--no-sandbox"] });
  }
}

// Los tamaños "sueltos" (20, 24, 40, 96) no los usa ningún archivo: van dentro del .ico para que
// el escritorio tenga un mapa de bits exacto en cada escalado de Windows (125% pide 20 y 40,
// 150% pide 24 y 48) y no tenga que estirar el que le quede más cerca.
const PNG_SIZES = [
  16, 20, 24, 30, 32, 40, 44, 48, 50, 64, 71, 89, 96, 107, 128, 142, 150, 256, 284, 310, 512, 1024,
];

const browser = await launch();
const page = await browser.newPage();
await page.setContent("<style>html,body{margin:0;background:transparent}</style>");

/** Rasteriza el vector al tamaño pedido — sin reescalar, dibujando el SVG a esa medida. */
const rasterize = async (size) => {
  const dataUrl = await page.evaluate(
    async ([svg, px]) => {
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      const img = new Image();
      img.width = px;
      img.height = px;
      await new Promise((ok, fail) => {
        img.onload = ok;
        img.onerror = fail;
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, px, px);
      return canvas.toDataURL("image/png");
    },
    [markSvg(size), size],
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
};

await mkdir(ICONS, { recursive: true });
await mkdir(PUBLIC, { recursive: true });

const png = new Map();
for (const size of PNG_SIZES) png.set(size, await rasterize(size));

await browser.close();

await writeFile(join(ICONS, "32x32.png"), png.get(32));
await writeFile(join(ICONS, "128x128.png"), png.get(128));
await writeFile(join(ICONS, "128x128@2x.png"), png.get(256));
await writeFile(join(ICONS, "icon.png"), png.get(512));
await writeFile(join(ICONS, "StoreLogo.png"), png.get(50));
for (const size of [30, 44, 71, 89, 107, 142, 150, 284, 310]) {
  await writeFile(join(ICONS, `Square${size}x${size}Logo.png`), png.get(size));
}

// El 64 va primero a propósito, y el resto de mayor a menor. `generate_context!` de Tauri se queda
// con `entries()[0]` del .ico y ese único mapa de bits termina siendo el icono de la ventana: tao
// crea un HICON de ese tamaño exacto y el escritorio lo reescala con `CopyImage`, que muestrea
// pobre. Con el 16×16 adelante la barra de tareas estiraba un 16 a 32 y se veía pixelado; con el
// 256 adelante el problema es al revés y sale escalonado. 64 baja limpio a 32 (2:1 exacto) y a 48,
// y es exacto al 200% de escalado. Al resto del escritorio el orden le da igual: elige por tamaño.
const ICO_SIZES = [64, 256, 128, 96, 48, 40, 32, 24, 20, 16];
await writeFile(join(ICONS, "icon.ico"), buildIco(new Map(ICO_SIZES.map((s) => [s, png.get(s)]))));
await writeFile(join(ICONS, "icon.icns"), buildIcns(png));

// El SVG público queda sin `width`/`height` para que escale con la caja que lo contenga.
await writeFile(join(PUBLIC, "archflow.svg"), markSvg(1024).replace(/ width="1024" height="1024"/, ""), "utf-8");

console.log(`iconos generados en ${ICONS} y public/archflow.svg`);
// El build script de Tauri no vigila `icons/`: sin este empujón, `cargo build` recompila y deja
// el icono anterior embebido en el .exe, sin ningún aviso.
console.log("para que el ejecutable tome el icono: `touch src-tauri/build.rs` y recompilar");
