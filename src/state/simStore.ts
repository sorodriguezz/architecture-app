import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { LoadProfile, Stage } from "../lib/simulation/engine";
import { TOPOLOGIES } from "../lib/simulation/presets";
import type { GrowthParams } from "../lib/simulation/structure";

/**
 * Configuración de los simuladores.
 *
 * Persiste por la misma razón que el borrador del brief: armar una topología de cinco etapas con
 * sus parámetros toma varios minutos y perderla por ir a mirar el catálogo sería absurdo. Los
 * resultados no se guardan — son función determinista de la configuración y la semilla, así que
 * volver a correrlos es más barato que serializarlos.
 */

/** `inicio` es el selector que explica para qué sirve cada simulador antes de entrar a uno. */
export type SimTab = "inicio" | "carga" | "estructura";

const DEFAULT_GROWTH: GrowthParams = {
  startFeatures: 6,
  featuresPerQuarter: 3,
  filesPerFeature: 14,
  teams: 3,
  months: 36,
};

interface SimState {
  tab: SimTab;
  stages: Stage[];
  profile: LoadProfile;
  seed: number;
  /** Escenario de arranque cargado, para poder marcarlo como activo. `null` = armado a mano. */
  topologyId: string | null;
  growth: GrowthParams;
  /** Organizaciones de directorios que se están comparando. */
  layoutIds: string[];
  /** Mes del que se muestra el árbol. */
  month: number;
  setTab: (tab: SimTab) => void;
  setStages: (stages: Stage[]) => void;
  /** Carga un escenario completo: etapas, perfil y marca cuál quedó activo. */
  loadTopology: (id: string) => void;
  patchStage: (id: string, values: Partial<Stage>) => void;
  setProfile: (values: Partial<LoadProfile>) => void;
  setSeed: (seed: number) => void;
  setGrowth: (values: Partial<GrowthParams>) => void;
  setLayoutIds: (ids: string[]) => void;
  setMonth: (month: number) => void;
}

export const useSimStore = create<SimState>()(
  persist(
    (set) => ({
      tab: "inicio",
      stages: TOPOLOGIES[0].build(),
      profile: TOPOLOGIES[0].profile,
      seed: 7,
      topologyId: TOPOLOGIES[0].id,
      growth: DEFAULT_GROWTH,
      layoutIds: ["capas", "vertical", "modular"],
      month: 24,

      setTab: (tab) => set({ tab }),
      // Editar a mano deja de corresponder al escenario cargado: se suelta la marca para no
      // mostrar como activo un preset que ya no es lo que está en pantalla.
      setStages: (stages) => set({ stages, topologyId: null }),
      loadTopology: (id) => {
        const topology = TOPOLOGIES.find((t) => t.id === id);
        if (!topology) return;
        set({ stages: topology.build(), profile: topology.profile, topologyId: topology.id });
      },
      patchStage: (id, values) =>
        set((s) => ({ stages: s.stages.map((st) => (st.id === id ? { ...st, ...values } : st)) })),
      setProfile: (values) => set((s) => ({ profile: { ...s.profile, ...values } })),
      setSeed: (seed) => set({ seed }),
      setGrowth: (values) => set((s) => ({ growth: { ...s.growth, ...values } })),
      setLayoutIds: (layoutIds) => set({ layoutIds }),
      setMonth: (month) => set({ month }),
    }),
    {
      name: "archflow.sim",
      storage: createJSONStorage(() => localStorage),
      // v2 agregó la pantalla de inicio. Se fuerza el salto a ella una vez para que quien ya venía
      // usando la app se encuentre con la explicación en vez de caer directo a los controles.
      version: 2,
      migrate: (state, version) => {
        const s = state as Partial<SimState>;
        return version < 2 ? { ...s, tab: "inicio" as SimTab, topologyId: null } : s;
      },
      partialize: (s) => ({
        tab: s.tab,
        stages: s.stages,
        profile: s.profile,
        seed: s.seed,
        topologyId: s.topologyId,
        growth: s.growth,
        layoutIds: s.layoutIds,
        month: s.month,
      }),
    },
  ),
);
