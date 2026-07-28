import { Cpu, Database, GitBranch, Plug, ScrollText, Sparkles, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { useSettingsStore } from "../../state/settingsStore";
import { DataSection } from "./DataSection";
import { EngineSection } from "./EngineSection";
import { GitSection } from "./GitSection";
import { McpSection } from "./McpSection";
import { ProjectSection } from "./ProjectSection";
import { PromptsSection } from "./PromptsSection";
import { SkillsSection } from "./SkillsSection";

type Section = "engine" | "prompts" | "skills" | "mcp" | "git" | "project" | "data";

const SECTIONS: { id: Section; label: string; icon: typeof Cpu }[] = [
  { id: "engine", label: "Motor de IA", icon: Cpu },
  { id: "prompts", label: "Prompts", icon: ScrollText },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "mcp", label: "Servidores MCP", icon: Plug },
  { id: "git", label: "Git y publicación", icon: GitBranch },
  { id: "project", label: "Proyecto", icon: Wrench },
  { id: "data", label: "Datos", icon: Database },
];

export function SettingsView() {
  const [section, setSection] = useState<Section>("engine");
  const load = useSettingsStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full">
      <nav className="w-56 shrink-0 space-y-0.5 border-r border-line p-2.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
              section === s.id
                ? "bg-[var(--accent-soft)] font-semibold text-accent-text"
                : "text-muted hover:bg-[var(--surface-hover)]"
            }`}
            onClick={() => setSection(s.id)}
          >
            <s.icon size={15} /> {s.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {section === "engine" && <EngineSection />}
          {section === "prompts" && <PromptsSection />}
          {section === "skills" && <SkillsSection />}
          {section === "mcp" && <McpSection />}
          {section === "git" && <GitSection />}
          {section === "project" && <ProjectSection />}
          {section === "data" && <DataSection />}
        </div>
      </div>
    </div>
  );
}

/** Encabezado compartido por todas las secciones. */
export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="mt-0.5 text-[13px] text-muted">{description}</p>
    </header>
  );
}
