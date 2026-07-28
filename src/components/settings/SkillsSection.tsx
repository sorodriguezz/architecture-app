import { Download, ExternalLink, FolderOpen, Package, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import * as api from "../../lib/tauri/commands";
import { onSkillProgress } from "../../lib/tauri/events";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import type { Skill } from "../../types/domain";
import { BouncingDots, EmptyState, Field, Modal } from "../common/Ui";
import { SectionHeader } from "./SettingsView";

/** Repos conocidos de skills.sh, para no tener que escribirlos de memoria. */
const SUGGESTED = [
  { repo: "anthropics/skills", skill: "skill-creator", label: "skill-creator — crear y editar skills" },
  { repo: "anthropics/skills", skill: "docx", label: "docx — generar documentos Word" },
  { repo: "anthropics/skills", skill: "pptx", label: "pptx — generar presentaciones" },
  { repo: "anthropics/skills", skill: "xlsx", label: "xlsx — generar planillas" },
  { repo: "supabase/agent-skills", skill: "supabase", label: "supabase — buenas prácticas de Postgres" },
];

const STARTER_SKILL = `---
name: revisor-arquitectura
description: Criterios propios de arquitectura de la organización. Úsala al evaluar opciones y al redactar ADRs.
---

# Criterios de arquitectura de la organización

## Reglas duras
- Toda integración con un sistema externo pasa por un anti-corruption layer.
- Ningún servicio nuevo sin health check, métricas y trazas desde el día uno.

## Preferencias
- Preferimos PostgreSQL salvo justificación explícita.
- Mensajería asíncrona antes que llamadas sincrónicas encadenadas de más de dos saltos.

## Qué rechazar
- Propuestas que agreguen un componente de infraestructura sin dueño operacional definido.
`;

export function SkillsSection() {
  const activeId = useProjectStore((s) => s.activeId);
  const toast = useUiStore((s) => s.toast);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installOpen, setInstallOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [repo, setRepo] = useState("anthropics/skills");
  const [name, setName] = useState("");
  const [customName, setCustomName] = useState("revisor-arquitectura");
  const [customMd, setCustomMd] = useState(STARTER_SKILL);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!activeId) return setSkills([]);
    try {
      setSkills(await api.listSkills(activeId));
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  }, [activeId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // El progreso de `npx skills add` llega por evento: sin esto la instalación parecería colgada.
  useEffect(() => {
    const unlisten = onSkillProgress((line) => setProgress((p) => [...p.slice(-40), line]));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const install = async () => {
    if (!activeId || !name.trim()) return;
    setBusy(true);
    setProgress([]);
    try {
      await api.installSkill(activeId, repo.trim(), name.trim());
      toast("success", `Skill «${name.trim()}» instalada`);
      setInstallOpen(false);
      setName("");
      await refresh();
    } catch (err) {
      toast("error", api.describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const createCustom = async () => {
    if (!activeId || !customName.trim()) return;
    setBusy(true);
    try {
      await api.createCustomSkill(activeId, customName.trim(), customMd);
      toast("success", "Skill creada");
      setCustomOpen(false);
      await refresh();
    } catch (err) {
      toast("error", api.describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  if (!activeId) {
    return (
      <div>
        <SectionHeader title="Skills" description="Las skills son por proyecto." />
        <EmptyState icon={<FolderOpen size={34} />} title="Abre un proyecto para gestionar sus skills" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Skills"
        description="Instrucciones reutilizables que el modelo carga al analizar. Se instalan desde skills.sh con «npx skills add» y se sincronizan dentro del repositorio antes de cada corrida."
      />

      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => setInstallOpen(true)}>
          <Download size={15} /> Instalar desde skills.sh
        </button>
        <button className="btn" onClick={() => setCustomOpen(true)}>
          <Plus size={15} /> Crear una propia
        </button>
        <button className="btn btn-ghost" onClick={() => void api.openExternal("https://skills.sh")}>
          Explorar skills.sh <ExternalLink size={13} />
        </button>
      </div>

      {skills.length === 0 ? (
        <EmptyState
          icon={<Package size={34} />}
          title="Sin skills en este proyecto"
          description="Una skill con los criterios de arquitectura de tu organización hace que cada ADR salga alineado sin repetirlo en cada brief."
        />
      ) : (
        <div className="space-y-2">
          {skills.map((s) => (
            <div key={s.id} className="card flex items-center gap-3 p-3.5">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={async (e) => {
                  await api.setSkillEnabled(s.id, e.target.checked);
                  await refresh();
                }}
                title={s.enabled ? "Habilitada" : "Deshabilitada"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{s.skillName}</p>
                <p className="truncate font-mono text-[11.5px] text-faint">{s.sourceRepo}</p>
              </div>
              <button
                className="btn btn-ghost shrink-0 px-1.5 py-1"
                onClick={async () => {
                  await api.removeSkill(s.id);
                  await refresh();
                }}
                title="Quitar"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={installOpen}
        title="Instalar una skill"
        onClose={() => !busy && setInstallOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setInstallOpen(false)} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={install} disabled={busy || !name.trim()}>
              {busy ? <BouncingDots /> : <Download size={14} />} Instalar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Repositorio" hint="Formato usuario/repo, tal como lo espera «npx skills add».">
            <input className="input font-mono text-[12.5px]" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </Field>
          <Field label="Nombre de la skill" required>
            <input className="input font-mono text-[12.5px]" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>

          <div>
            <span className="field-label">Sugerencias</span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button
                  key={`${s.repo}/${s.skill}`}
                  className="chip cursor-pointer"
                  onClick={() => {
                    setRepo(s.repo);
                    setName(s.skill);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {progress.length > 0 && (
            <pre
              className="selectable max-h-40 overflow-auto rounded-lg px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-muted"
              style={{ background: "var(--bg-elevated)" }}
            >
              {progress.join("\n")}
            </pre>
          )}

          <p className="text-[11.5px] text-faint">
            Requiere Node y npx en el PATH. La skill queda en la carpeta de datos de ArchFlow y se copia al
            repositorio del proyecto justo antes de cada análisis.
          </p>
        </div>
      </Modal>

      <Modal
        open={customOpen}
        title="Crear una skill propia"
        onClose={() => !busy && setCustomOpen(false)}
        width="max-w-2xl"
        footer={
          <>
            <button className="btn" onClick={() => setCustomOpen(false)} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={createCustom} disabled={busy || !customName.trim()}>
              Crear
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre" required hint="Se usa como nombre de carpeta: sin espacios ni acentos.">
            <input
              className="input font-mono text-[12.5px]"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </Field>
          <Field label="SKILL.md" hint="Front-matter YAML con name y description, y luego el contenido en Markdown.">
            <textarea
              className="input h-72 resize-none font-mono text-[12px] leading-relaxed"
              value={customMd}
              onChange={(e) => setCustomMd(e.target.value)}
              spellCheck={false}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
