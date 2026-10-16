import {
  type HardwareReport,
  type WindowsSettingsReport,
} from "@/features/system/system-settings/types";
import { invokeCommand } from "@/services/tauri/commands";

/** Energia, Modo de Jogo, HAGS, reinício pendente e inicialização (somente leitura). */
export function analyzeWindowsSettings(): Promise<WindowsSettingsReport> {
  return invokeCommand("analyze_windows_settings");
}

/** BIOS, placa-mãe, Secure Boot, TPM, virtualização, CPU e memória (somente leitura). */
export function analyzeHardware(): Promise<HardwareReport> {
  return invokeCommand("analyze_hardware");
}
