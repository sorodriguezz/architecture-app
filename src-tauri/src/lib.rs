mod ai;
mod commands;
mod db;
mod fsops;
mod git;
mod paths;
mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Tiene que pasar antes de que `db::init()` abra la conexión SQLite: ver el comentario de
    // `paths::reset_marker_path` sobre por qué el borrado no puede ocurrir en caliente.
    if paths::reset_marker_path().exists() {
        let _ = std::fs::remove_dir_all(paths::base_dir());
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(db::init().expect("no se pudo inicializar la base de datos de ArchFlow"))
        .invoke_handler(tauri::generate_handler![
            commands::app_cmd::quit_app,
            commands::app_cmd::reset_app_data,
            commands::app_cmd::data_dir,
            commands::app_cmd::open_external,
            commands::app_cmd::reveal_in_file_manager,
            commands::project_cmd::pick_folder,
            commands::project_cmd::default_projects_dir,
            commands::project_cmd::open_project,
            commands::project_cmd::create_project,
            commands::project_cmd::clone_project,
            commands::project_cmd::list_projects,
            commands::project_cmd::get_project,
            commands::project_cmd::update_project,
            commands::project_cmd::remove_project,
            commands::decision_cmd::run_decision,
            commands::decision_cmd::list_decisions,
            commands::decision_cmd::get_decision,
            commands::decision_cmd::update_decision_markdown,
            commands::decision_cmd::delete_decision,
            commands::decision_cmd::save_decision_doc,
            commands::decision_cmd::refine_decision,
            commands::decision_cmd::review_document,
            commands::decision_cmd::generate_diagram,
            commands::decision_cmd::publish_docs,
            commands::decision_cmd::cancel_run,
            commands::model_cmd::list_model_elements,
            commands::model_cmd::upsert_model_element,
            commands::model_cmd::delete_model_element,
            commands::model_cmd::scan_repository,
            commands::model_cmd::extract_model_from_decision,
            commands::docs_cmd::list_docs,
            commands::docs_cmd::read_doc,
            commands::docs_cmd::write_doc,
            commands::docs_cmd::create_doc,
            commands::docs_cmd::delete_doc,
            commands::docs_cmd::rename_doc,
            commands::docs_cmd::doc_full_path,
            commands::git_cmd::git_status,
            commands::git_cmd::git_commit,
            commands::git_cmd::git_push,
            commands::git_cmd::git_pull,
            commands::git_cmd::git_set_remote,
            commands::git_cmd::set_git_credentials,
            commands::git_cmd::has_git_credentials,
            commands::git_cmd::clear_git_credentials,
            commands::settings_cmd::get_setting,
            commands::settings_cmd::set_setting,
            commands::settings_cmd::default_prompt,
            commands::settings_cmd::list_models,
            commands::settings_cmd::check_engine,
            commands::skills_cmd::install_skill,
            commands::skills_cmd::list_skills,
            commands::skills_cmd::set_skill_enabled,
            commands::skills_cmd::remove_skill,
            commands::skills_cmd::create_custom_skill,
            commands::skills_cmd::list_skill_files,
            commands::skills_cmd::read_skill_file,
            commands::skills_cmd::write_skill_file,
            commands::mcp_cmd::list_mcp_servers,
            commands::mcp_cmd::upsert_mcp_server,
            commands::mcp_cmd::delete_mcp_server,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación tauri");
}
