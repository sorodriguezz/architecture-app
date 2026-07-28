import { FolderOpen, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import * as api from "../../lib/tauri/commands";
import { useUiStore } from "../../state/uiStore";
import { Modal } from "../common/Ui";
import { SectionHeader } from "./SettingsView";

export function DataSection() {
  const [dir, setDir] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useUiStore((s) => s.toast);

  useEffect(() => {
    void api.dataDir().then(setDir);
  }, []);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Datos"
        description="Dónde vive todo lo que ArchFlow guarda fuera de tus repositorios."
      />

      <section className="card p-4">
        <h2 className="mb-1 text-[13.5px] font-semibold text-ink">Carpeta de datos</h2>
        <p className="selectable mb-3 font-mono text-[12px] text-muted">{dir || "…"}</p>
        <p className="mb-3 text-[12.5px] text-muted">
          Contiene la base SQLite con proyectos y decisiones, las skills instaladas y las configuraciones MCP
          generadas. Los documentos <code>.md</code> <strong className="text-ink">no</strong> están aquí: viven
          en el repositorio de cada proyecto.
        </p>
        <button className="btn" onClick={() => void api.revealInFileManager(dir)} disabled={!dir}>
          <FolderOpen size={14} /> Abrir carpeta
        </button>
      </section>

      <section className="card p-4" style={{ borderColor: "var(--danger)" }}>
        <h2 className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold text-danger">
          <TriangleAlert size={15} /> Restablecer la aplicación
        </h2>
        <p className="mb-3 text-[12.5px] text-muted">
          Borra la base de datos, la configuración y las skills instaladas, y cierra ArchFlow. Tus repositorios
          y los documentos que ya guardaste en ellos no se tocan — pero sí se pierde el historial de decisiones
          que no hayas guardado como archivo.
        </p>
        <button className="btn btn-danger" onClick={() => setConfirmOpen(true)}>
          Restablecer y cerrar
        </button>
      </section>

      <Modal
        open={confirmOpen}
        title="¿Restablecer ArchFlow?"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  await api.resetAppData();
                } catch (err) {
                  toast("error", api.describeError(err).message);
                }
              }}
            >
              Sí, restablecer
            </button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          La aplicación se cerrará y el borrado ocurrirá en el próximo arranque (no se puede eliminar la base
          mientras está abierta). Tus repositorios quedan intactos.
        </p>
      </Modal>
    </div>
  );
}
