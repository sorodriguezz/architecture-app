; Hooks NSIS del instalador/desinstalador de ArchFlow.
;
; La instalación no necesita hook: ArchFlow crea C:\ArchFlow en el primer arranque vía
; `paths::ensure_dirs()` (`std::fs::create_dir_all`, no-op si ya existe) — así una instalación
; previa conserva su config, credenciales, proyectos y skills sin lógica en el instalador, y una
; máquina nueva obtiene el directorio limpio por el mismo camino.
;
; La desinstalación sí pregunta si conservar o borrar ese directorio, porque ahí viven la base
; SQLite, los .md de arquitectura y las skills instaladas desde skills.sh.

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} ${FileExists} "C:\ArchFlow\*.*"
    MessageBox MB_YESNO|MB_ICONQUESTION "¿Borrar la configuración, credenciales y datos de ArchFlow en C:\ArchFlow?$\n$\nElige No para conservarlos para la próxima vez que instales ArchFlow." IDYES archflow_delete_data IDNO archflow_keep_data
    archflow_delete_data:
      RMDir /r "C:\ArchFlow"
      Goto archflow_data_done
    archflow_keep_data:
    archflow_data_done:
  ${EndIf}
!macroend
