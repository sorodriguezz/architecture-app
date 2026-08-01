import { useEffect, useState } from "react";

import { Toasts } from "./components/common/Ui";
import { DecisionView } from "./components/decision/DecisionView";
import { DocsView } from "./components/docs/DocsView";
import { PatternsView } from "./components/docs/PatternsView";
import { NewDecisionView } from "./components/intake/NewDecisionView";
import { ProjectsView } from "./components/layout/ProjectsView";
import { RunLogPanel } from "./components/layout/RunLogPanel";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TitleBar } from "./components/layout/TitleBar";
import { SystemModelView } from "./components/model/SystemModelView";
import { SettingsView } from "./components/settings/SettingsView";
import { SimulatorsView } from "./components/simulator/SimulatorsView";
import { onRunLine } from "./lib/tauri/events";
import { useDecisionStore } from "./state/decisionStore";
import { useProjectStore } from "./state/projectStore";
import { useSettingsStore } from "./state/settingsStore";
import { useUiStore } from "./state/uiStore";

export default function App() {
  const view = useUiStore((s) => s.view);
  const setTheme = useUiStore((s) => s.setTheme);
  const theme = useUiStore((s) => s.theme);
  const loadProjects = useProjectStore((s) => s.load);
  const loadSettings = useSettingsStore((s) => s.load);
  const appendLog = useDecisionStore((s) => s.appendLog);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  useEffect(() => {
    setTheme(theme);
    void loadProjects();
    void loadSettings();
    // Solo al montar: estos cargadores son estables y volver a correrlos pisaría el estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un único suscriptor global al stream de la CLI: si cada vista se suscribiera por su cuenta,
  // las líneas se duplicarían al cambiar de pestaña con una corrida en vuelo.
  useEffect(() => {
    const unlisten = onRunLine((line) => appendLog(line.line));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [appendLog]);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar onNewProject={() => setNewProjectOpen(true)} />

        <main className="min-w-0 flex-1 overflow-hidden">
          {view === "projects" && (
            <ProjectsView newProjectOpen={newProjectOpen} setNewProjectOpen={setNewProjectOpen} />
          )}
          {view === "new-decision" && <NewDecisionView />}
          {view === "decision" && <DecisionView />}
          {view === "model" && <SystemModelView />}
          {view === "docs" && <DocsView />}
          {view === "patterns" && <PatternsView />}
          {view === "simulators" && <SimulatorsView />}
          {view === "settings" && <SettingsView />}
        </main>

        <RunLogPanel />
      </div>

      <StatusBar />
      <Toasts />
    </div>
  );
}
