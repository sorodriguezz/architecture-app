/**
 * Qué tan completo está un brief, paso por paso.
 *
 * El wizard no valida nada duro salvo título y problema — pedir más sería fingir que un campo
 * vacío es un error cuando muchas veces es la respuesta honesta. Lo que sí hace es decir qué se
 * pierde al dejarlo vacío: cada hueco del brief se convierte en un supuesto que el modelo tiene
 * que inventar, y eso es exactamente lo que el usuario necesita saber *antes* de gastar una
 * corrida de varios minutos.
 */
import type { DecisionBrief } from "../types/domain";

export interface StepProgress {
  /** Campos del paso con contenido. */
  filled: number;
  /** Campos que el paso ofrece. */
  total: number;
  /** Si el paso ya aporta lo suficiente como para no ser un hueco. */
  done: boolean;
}

const has = (value: string) => value.trim().length > 0;

/** Progreso de los cuatro pasos de captura, en el mismo orden en que se muestran. */
export function stepProgress(brief: DecisionBrief): StepProgress[] {
  const contexto = [brief.title, brief.problem, brief.goals, brief.nonGoals].filter(has).length;
  const situacion = [
    brief.currentState,
    brief.constraints,
    brief.scale,
    brief.team,
    brief.compliance,
    brief.budget,
  ].filter(has).length;
  const conEscenario = brief.qualityAttributes.filter((qa) => has(qa.scenario)).length;
  const alcance =
    (brief.candidateOptions.length > 0 ? 1 : 0) +
    (brief.patternFamilies.length > 0 ? 1 : 0) +
    (brief.deliverables.length > 0 ? 1 : 0) +
    (has(brief.notes) ? 1 : 0);

  return [
    { filled: contexto, total: 4, done: has(brief.title) && has(brief.problem) },
    { filled: situacion, total: 6, done: situacion >= 3 },
    // Con un solo driver no hay nada que ponderar: la matriz sale de comparar prioridades.
    { filled: conEscenario, total: Math.max(brief.qualityAttributes.length, 2), done: brief.qualityAttributes.length >= 2 },
    { filled: alcance, total: 4, done: brief.deliverables.length > 0 && brief.patternFamilies.length > 0 },
  ];
}

/** Cobertura global 0-100, para la barra del stepper. */
export function coverage(brief: DecisionBrief): number {
  const steps = stepProgress(brief);
  const filled = steps.reduce((n, s) => n + Math.min(s.filled, s.total), 0);
  const total = steps.reduce((n, s) => n + s.total, 0);
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

/** Lo único que bloquea la ejecución. Todo lo demás es opcional a propósito. */
export function blockers(brief: DecisionBrief): string[] {
  const out: string[] = [];
  if (brief.title.trim().length <= 2) out.push("Falta el título de la decisión");
  if (brief.problem.trim().length <= 10) out.push("Falta describir el problema de negocio");
  return out;
}

export function isRunnable(brief: DecisionBrief): boolean {
  return blockers(brief).length === 0;
}

export interface Gap {
  /** Qué campo quedó vacío. */
  field: string;
  /** Qué va a tener que asumir el análisis por no tenerlo. */
  consequence: string;
  /** Paso donde se completa. */
  step: number;
}

/**
 * Huecos del brief con su consecuencia concreta. No son errores: son el precio de correr sin
 * ese dato, y se muestran en el paso de revisión para que la decisión de correr igual sea
 * informada y no por descuido.
 */
export function gaps(brief: DecisionBrief): Gap[] {
  const out: Gap[] = [];
  const add = (ok: boolean, field: string, consequence: string, step: number) => {
    if (!ok) out.push({ field, consequence, step });
  };

  add(has(brief.goals), "Qué se necesita conseguir", "La recomendación se justifica contra el problema, sin un resultado de negocio medible al que apuntar.", 0);
  add(has(brief.nonGoals), "Fuera de alcance", "El análisis puede proponer cambios en partes del sistema que no querías tocar.", 0);
  add(has(brief.currentState), "Estado actual", "Se recomienda sin conocer el stack ni la deuda existente; el plan de migración sale genérico.", 1);
  add(has(brief.constraints), "Restricciones", "Puede recomendar tecnología vetada, licencias no aprobadas o una nube distinta a la tuya.", 1);
  add(has(brief.scale), "Escala esperada", "Dimensiona con supuestos propios: la opción elegida puede quedar corta o sobredimensionada.", 1);
  add(has(brief.team), "Equipo", "No puede aplicar la Ley de Conway ni descartar opciones que el equipo no podría operar.", 1);
  add(has(brief.compliance), "Cumplimiento", "Asume que no hay requisitos de residencia, retención ni auditoría de datos.", 1);
  add(has(brief.budget), "Presupuesto y plazos", "Compara alternativas sin techo de costo ni fecha contra la cual medir el time to market.", 1);
  add(brief.qualityAttributes.length >= 2, "Drivers priorizados", "Sin atributos ponderados, la matriz de trade-off usa los criterios que el modelo decida.", 2);
  add(
    brief.qualityAttributes.every((qa) => has(qa.scenario)),
    "Escenarios de los drivers",
    "Los drivers sin escenario se evalúan en abstracto: «buena disponibilidad» no se puede puntuar.",
    2,
  );
  add(brief.candidateOptions.length > 0, "Opciones candidatas", "El modelo propone las alternativas; las que ya estabas evaluando podrían no aparecer.", 3);

  return out;
}
