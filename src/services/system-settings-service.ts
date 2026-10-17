import {
  type HardwareReport,
  type TweakRecord,
  type TweakRequest,
  type TweakResult,
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

/** Aplica os ajustes confirmados (cada um guarda o valor anterior e é auditado). */
export function applySystemTweaks(requests: TweakRequest[]): Promise<TweakResult[]> {
  return invokeCommand("apply_system_tweaks", { requests });
}

/** Volta o valor anterior de um ajuste feito pelo app (auditado). */
export function undoSystemTweak(id: number): Promise<TweakRecord> {
  return invokeCommand("undo_system_tweak", { id });
}

/** Ajustes feitos pelo app, mais recentes primeiro. */
export function listSystemTweaks(limit: number): Promise<TweakRecord[]> {
  return invokeCommand("list_system_tweaks", { limit });
}
