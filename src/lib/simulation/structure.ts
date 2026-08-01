/**
 * Simulador de estructura de directorios.
 *
 * La pregunta que responde no es "qué carpetas creo hoy" sino "qué le pasa a esta estructura
 * cuando el proyecto tenga sesenta módulos y cinco equipos". Todas las organizaciones se ven bien
 * con tres features; lo que las distingue aparece al crecer, y para entonces cambiarla cuesta
 * meses.
 *
 * El modelo es explícito y por eso discutible: cada organización declara cómo reparte los
 * archivos de una feature entre sus carpetas. De ahí salen las tres métricas que de verdad se
 * sienten al trabajar — cuántos archivos se acumulan en el peor directorio, cuántas carpetas hay
 * que tocar para un cambio, y cuánto código comparten todos los equipos.
 */

export interface TreeNode {
  name: string;
  /** Archivos directamente en este directorio. */
  files: number;
  /**
   * Directorio sin dueño único: más de un equipo escribe adentro. Es distinto de "código
   * compartido" — en una organización por capas cada archivo tiene su autor, pero conviven en la
   * misma carpeta, y eso es lo que rompe CODEOWNERS, enruta mal las revisiones y convierte
   * cualquier archivo de registro o índice en un punto de conflicto permanente.
   */
  shared?: boolean;
  children: TreeNode[];
}

export interface GrowthParams {
  /** Módulos de negocio al arrancar. */
  startFeatures: number;
  /** Módulos que se agregan por trimestre. */
  featuresPerQuarter: number;
  /** Archivos que aporta cada módulo, repartidos según la organización. */
  filesPerFeature: number;
  /** Equipos que trabajan en paralelo sobre el repositorio. */
  teams: number;
  /** Horizonte en meses. */
  months: number;
}

export interface Snapshot {
  features: number;
  services: number;
}

export interface LayoutMetrics {
  files: number;
  dirs: number;
  maxDepth: number;
  /** Directorio con más archivos: el que cuesta navegar. */
  hottestDir: { path: string; files: number };
  /** Directorio con más subdirectorios: el otro lado del mismo problema. */
  widestDir: { path: string; children: number };
  /** Carpetas distintas que hay que tocar para un cambio típico de una feature. */
  scatter: number;
  /** Archivos que viven en directorios donde escribe más de un equipo. */
  sharedFiles: number;
  /** Fracción del código que vive en un directorio con dueño único, 0-1. */
  ownership: number;
}

export interface LayoutDef {
  id: string;
  label: string;
  blurb: string;
  /** Carpetas distintas que toca un cambio de feature en esta organización. */
  scatter: number;
  /** Cuándo esta organización es la correcta. */
  fits: string;
  /** Qué la rompe. */
  breaks: string;
  build: (snap: Snapshot, params: GrowthParams) => TreeNode;
}

const dir = (name: string, files: number, children: TreeNode[] = [], shared = false): TreeNode => ({
  name,
  files,
  shared,
  children,
});

/** Nombres estables para que el árbol se vea como un proyecto y no como un diagrama abstracto. */
const FEATURE_NAMES = [
  "pagos", "inventario", "catalogo", "usuarios", "envios", "facturacion", "notificaciones",
  "reportes", "promociones", "carrito", "devoluciones", "proveedores", "precios", "sesiones",
  "auditoria", "busqueda", "recomendaciones", "suscripciones", "impuestos", "conciliacion",
];

const featureName = (i: number) => FEATURE_NAMES[i % FEATURE_NAMES.length] + (i >= FEATURE_NAMES.length ? `-${Math.floor(i / FEATURE_NAMES.length) + 1}` : "");

/** Reparte los archivos de una feature en partes con los pesos dados. */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.max(1, Math.round((total * w) / sum)));
  return out;
}

export const LAYOUTS: LayoutDef[] = [
  {
    id: "capas",
    label: "Por capas",
    blurb: "Un directorio por responsabilidad técnica: presentación, aplicación, dominio, infraestructura.",
    scatter: 5,
    fits: "Equipos chicos y dominios donde la capa técnica es la unidad de cambio real.",
    breaks: "Cada feature nueva engorda las mismas cuatro carpetas: a los dos años nadie encuentra nada y todos los equipos escriben en los mismos directorios.",
    build: (snap, p) => {
      const [api, app, dom, infra, test] = split(p.filesPerFeature, [3, 3, 4, 2, 2]);
      const n = snap.features;
      // Cada carpeta acumula archivos de todas las features: ningún equipo es dueño de ninguna.
      return dir("proyecto/", 4, [
        dir("src/", 2, [
          dir("api/", 0, [dir("controllers/", api * n), dir("dto/", Math.round(api * n * 0.8))], true),
          dir("application/", 0, [dir("services/", app * n), dir("mappers/", Math.round(app * n * 0.5))], true),
          dir("domain/", 0, [dir("model/", dom * n), dir("rules/", Math.round(dom * n * 0.4))], true),
          dir("infrastructure/", 0, [
            dir("persistence/", infra * n),
            dir("http/", 8),
            dir("messaging/", 6),
          ], true),
          dir("shared/", 24, [], true),
        ]),
        dir("tests/", 0, [dir("unit/", test * n), dir("integration/", Math.round(test * n * 0.4))], true),
        dir("config/", 10, [], true),
      ]);
    },
  },
  {
    id: "hexagonal",
    label: "Hexagonal (puertos y adaptadores)",
    blurb: "El dominio al centro y la tecnología en adaptadores intercambiables.",
    scatter: 6,
    fits: "Cuando la lógica de negocio es densa y la tecnología va a cambiar antes que las reglas.",
    breaks: "La misma dispersión que las capas, más un puerto y un adaptador por cada integración: el costo se paga desde el primer día, sirva o no.",
    build: (snap, p) => {
      const [model, ports, uc, adaptIn, adaptOut, test] = split(p.filesPerFeature, [3, 2, 3, 2, 2, 2]);
      const n = snap.features;
      return dir("proyecto/", 4, [
        dir("src/", 2, [
          dir("domain/", 0, [dir("model/", model * n), dir("ports/", ports * n)], true),
          dir("application/", 0, [dir("usecases/", uc * n)], true),
          dir("adapters/", 0, [
            dir("in/", 0, [dir("http/", adaptIn * n), dir("messaging/", Math.round(adaptIn * n * 0.4))]),
            dir("out/", 0, [dir("persistence/", adaptOut * n), dir("clients/", Math.round(adaptOut * n * 0.6))]),
          ], true),
          dir("config/", 14, [], true),
        ]),
        dir("tests/", 0, [dir("unit/", test * n), dir("integration/", Math.round(test * n * 0.5))], true),
      ]);
    },
  },
  {
    id: "vertical",
    label: "Por feature (vertical slices)",
    blurb: "Una carpeta por módulo de negocio, con su API, su dominio y sus datos adentro.",
    scatter: 1,
    fits: "Equipos que se organizan por capacidad de negocio: el cambio queda contenido en una carpeta.",
    breaks: "El directorio raíz se llena de features y lo transversal tiende a duplicarse entre ellas si nadie cuida `shared/`.",
    build: (snap, p) => {
      const [api, dom, data, test] = split(p.filesPerFeature, [3, 5, 3, 3]);
      return dir("proyecto/", 4, [
        dir("src/", 0, [
          dir(
            "features/",
            0,
            Array.from({ length: snap.features }, (_, i) =>
              dir(featureName(i) + "/", 1, [
                dir("api/", api),
                dir("domain/", dom),
                dir("data/", data),
                dir("tests/", test),
              ]),
            ),
          ),
          dir("shared/", 0, [dir("platform/", 18, [], true), dir("ui/", 12, [], true)]),
        ]),
        dir("config/", 10, [], true),
      ]);
    },
  },
  {
    id: "modular",
    label: "Monolito modular",
    blurb: "Módulos con superficie pública explícita y todo lo demás cerrado tras `internal/`.",
    scatter: 2,
    fits: "Un solo despliegue con límites que se pueden hacer cumplir, y la opción de extraer un módulo después.",
    breaks: "Sin una regla que impida importar `internal/` ajeno, en seis meses vuelve a ser un monolito de barro con carpetas bonitas.",
    build: (snap, p) => {
      const [api, dom, data, test] = split(p.filesPerFeature, [2, 5, 4, 3]);
      return dir("proyecto/", 4, [
        dir("src/", 0, [
          dir(
            "modules/",
            0,
            Array.from({ length: snap.features }, (_, i) =>
              dir(featureName(i) + "/", 1, [
                dir("api/", api),
                dir("internal/", 0, [dir("domain/", dom), dir("data/", data)]),
                dir("tests/", test),
              ]),
            ),
          ),
          dir("platform/", 0, [
            dir("auth/", 9, [], true),
            dir("messaging/", 8, [], true),
            dir("observability/", 7, [], true),
          ]),
        ]),
        dir("config/", 12, [], true),
      ]);
    },
  },
  {
    id: "servicios",
    label: "Repositorio por servicio",
    blurb: "Cada servicio con su propio árbol completo, más librerías compartidas y despliegue.",
    scatter: 3,
    fits: "Equipos independientes que despliegan por separado y aceptan pagar la operación distribuida.",
    breaks: "Lo transversal se duplica o se acopla en `libs/`, y un cambio de contrato deja de ser un refactor para convertirse en una coordinación entre equipos.",
    build: (snap, p) => {
      const perService = Math.max(1, Math.ceil(snap.features / Math.max(1, snap.services)));
      const [api, dom, data, test] = split(p.filesPerFeature * perService, [3, 5, 3, 3]);
      return dir("repo/", 4, [
        dir(
          "services/",
          0,
          Array.from({ length: snap.services }, (_, i) =>
            dir(featureName(i) + "-service/", 3, [
              dir("src/", 0, [dir("api/", api), dir("domain/", dom), dir("data/", data)]),
              dir("tests/", test),
              dir("deploy/", 4),
            ]),
          ),
        ),
        dir("libs/", 0, [dir("contracts/", 6 * snap.services, [], true), dir("common/", 22, [], true)]),
        dir("platform/", 0, [dir("ci/", 10, [], true), dir("infra/", 16, [], true)]),
      ]);
    },
  },
  {
    id: "monorepo",
    label: "Monorepo por paquetes",
    blurb: "Aplicaciones y librerías como paquetes versionados dentro del mismo repositorio.",
    scatter: 2,
    fits: "Varios productos que comparten código y quieren un solo commit atómico para cambiarlo.",
    breaks: "El grafo de dependencias entre paquetes se vuelve el verdadero diseño del sistema, y la CI tarda lo que tarda el paquete más lento.",
    build: (snap, p) => {
      const apps = Math.max(1, Math.ceil(snap.services / 2));
      const pkgs = Math.max(2, snap.features);
      const [appFiles, pkgFiles] = split(p.filesPerFeature, [6, 8]);
      return dir("repo/", 6, [
        dir(
          "apps/",
          0,
          Array.from({ length: apps }, (_, i) =>
            dir(featureName(i) + "-app/", 2, [dir("src/", appFiles * 3), dir("tests/", Math.round(appFiles * 1.5))]),
          ),
        ),
        dir(
          "packages/",
          0,
          Array.from({ length: pkgs }, (_, i) =>
            dir(featureName(i) + "/", 2, [dir("src/", pkgFiles), dir("tests/", Math.round(pkgFiles * 0.6))]),
          ),
        ),
        dir("tooling/", 0, [dir("eslint/", 5, [], true), dir("build/", 9, [], true)]),
      ]);
    },
  },
];

export const LAYOUT_BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));

/** Estado del proyecto en un mes dado. Los servicios se derivan: nadie parte con veinte. */
export function snapshotAt(params: GrowthParams, month: number): Snapshot {
  const features = Math.max(1, Math.round(params.startFeatures + (params.featuresPerQuarter * month) / 3));
  const services = Math.max(1, Math.min(features, Math.max(params.teams, Math.ceil(features / 6))));
  return { features, services };
}

export function measure(tree: TreeNode, layout: LayoutDef): LayoutMetrics {
  let files = 0;
  let dirs = 0;
  let maxDepth = 0;
  let sharedFiles = 0;
  let hottestDir = { path: "", files: -1 };
  let widestDir = { path: "", children: -1 };

  const walk = (node: TreeNode, path: string, depth: number, inShared: boolean) => {
    const here = path + node.name;
    const shared = inShared || Boolean(node.shared);
    dirs += 1;
    files += node.files;
    if (shared) sharedFiles += node.files;
    maxDepth = Math.max(maxDepth, depth);
    if (node.files > hottestDir.files) hottestDir = { path: here, files: node.files };
    if (node.children.length > widestDir.children) widestDir = { path: here, children: node.children.length };
    for (const child of node.children) walk(child, here, depth + 1, shared);
  };
  walk(tree, "", 0, false);

  return {
    files,
    dirs,
    maxDepth,
    hottestDir,
    widestDir,
    scatter: layout.scatter,
    sharedFiles,
    ownership: files === 0 ? 1 : 1 - sharedFiles / files,
  };
}

export interface TimelinePoint {
  month: number;
  features: number;
  metrics: LayoutMetrics;
}

/** Métricas mes a mes, para ver cómo envejece cada organización en vez de cómo se ve hoy. */
export function timeline(layout: LayoutDef, params: GrowthParams): TimelinePoint[] {
  const step = Math.max(1, Math.round(params.months / 12));
  const out: TimelinePoint[] = [];
  for (let month = 0; month <= params.months; month += step) {
    const snap = snapshotAt(params, month);
    out.push({ month, features: snap.features, metrics: measure(layout.build(snap, params), layout) });
  }
  return out;
}

/**
 * Colapsa las listas largas de hermanos para poder mostrar el árbol. Se conserva el conteo real
 * en `hidden` porque "y 54 más" es justamente el dato que hace visible el problema.
 */
export interface RenderNode {
  name: string;
  files: number;
  shared: boolean;
  depth: number;
  hidden: number;
  children: RenderNode[];
}

export function toRenderTree(node: TreeNode, limit = 5, depth = 0, inShared = false): RenderNode {
  const shared = inShared || Boolean(node.shared);
  const shown = node.children.slice(0, limit);
  return {
    name: node.name,
    files: node.files,
    shared,
    depth,
    hidden: Math.max(0, node.children.length - shown.length),
    children: shown.map((c) => toRenderTree(c, limit, depth + 1, shared)),
  };
}
