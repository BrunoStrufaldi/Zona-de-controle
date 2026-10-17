// Evita abrir uma janela de console extra no Windows em builds de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Reparo do Windows (4.7): o mesmo executável, aberto elevado pelo UAC, só
    // roda a sequência fixa e sai, sem abrir a janela.
    if let Some(code) = zona_de_controle_lib::run_repair_helper() {
        std::process::exit(code);
    }
    zona_de_controle_lib::run();
}
