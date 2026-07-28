// Evita la ventana extra de consola en Windows en release. NO BORRAR.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    archflow_lib::run()
}
