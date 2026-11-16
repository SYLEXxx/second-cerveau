// Pas de console noire derrière la fenêtre sous Windows en version installée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    second_cerveau_lib::run()
}
