import { vi } from "vitest";

import {
  type HardwareReport,
  type WindowsSettingsReport,
} from "@/features/system/system-settings/types";
import { mockDesktopRuntime } from "@/test/tauri";

const GIB = 1024 ** 3;
const HIGH_PERFORMANCE = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

/** Leitura fictícia: plano personalizado ativo, Modo de Jogo desligado e reinício pendente. */
export function sampleWindowsSettings(): WindowsSettingsReport {
  return {
    power: {
      plans: [
        {
          guid: "381b4222-f694-41f0-9685-ff5bb260df2e",
          name: "Equilibrado",
          kind: "balanced",
          active: false,
        },
        { guid: HIGH_PERFORMANCE, name: "Alto desempenho", kind: "highPerformance", active: false },
        { guid: "0000-plano", name: "Meu plano", kind: "custom", active: true },
      ],
      modernStandby: false,
      hasBattery: false,
    },
    gameMode: { enabled: false, byDefault: false },
    gpus: [{ name: "Placa de Vídeo Exemplo", supported: true, enabled: true }],
    pendingReboot: { windowsUpdate: true, servicing: false },
    startup: {
      items: [
        {
          id: "userRun:Chat Exemplo",
          location: "userRun",
          name: "Chat Exemplo",
          command: String.raw`"C:\Users\Exemplo\AppData\Local\Chat\chat.exe" --minimized`,
          state: "enabled",
          disabledAtMs: null,
          targetExists: true,
          editable: true,
        },
        {
          id: "userRun:Antigo",
          location: "userRun",
          name: "Antigo",
          command: String.raw`C:\Programas\Antigo\antigo.exe`,
          state: "disabled",
          disabledAtMs: new Date(2026, 0, 10).getTime(),
          targetExists: false,
          editable: true,
        },
        {
          id: "machineRun:Driver de Áudio",
          location: "machineRun",
          name: "Driver de Áudio",
          command: String.raw`C:\Program Files\Audio\audio.exe`,
          state: "enabled",
          disabledAtMs: null,
          targetExists: true,
          editable: false,
        },
      ],
      packaged: [{ package: "Editora.Musica", taskId: "MusicaStartup", state: "disabledByUser" }],
      packagedAvailable: true,
    },
    findings: [
      { level: "attention", kind: "pendingReboot", windowsUpdate: true, servicing: false },
      {
        level: "suggestion",
        kind: "powerPlan",
        current: "Meu plano",
        suggestedGuid: HIGH_PERFORMANCE,
        suggestedName: "Alto desempenho",
        hasBattery: false,
      },
      { level: "suggestion", kind: "gameModeOff" },
    ],
  };
}

/** Hardware fictício: microcódigo antigo, RAM abaixo da velocidade e BIOS antiga. */
export function sampleHardware(): HardwareReport {
  return {
    firmware: "uefi",
    bios: { vendor: "BIOS Exemplo Inc.", version: "1001", releaseDate: "2024-03-20" },
    board: { manufacturer: "ASUSTeK COMPUTER INC.", product: "PLACA EXEMPLO" },
    secureBoot: true,
    tpm: "tpm20",
    cpu: {
      name: "Processador Exemplo",
      vendor: "GenuineIntel",
      family: 6,
      model: 183,
      stepping: 1,
      microcode: 0x129,
    },
    virtualization: "inUse",
    memoryIntegrity: null,
    smbiosAvailable: true,
    memoryModules: [
      {
        locator: "DIMM_A2",
        manufacturer: "Memória Exemplo",
        partNumber: "PECA-3200",
        kind: "ddr4",
        sizeBytes: 16 * GIB,
        maxSpeedMts: 3200,
        configuredSpeedMts: 2133,
      },
    ],
    findings: [
      { level: "critical", kind: "microcodeOutdated", revision: 0x129, minimum: 0x12b },
      {
        level: "attention",
        kind: "memoryBelowRated",
        modules: [{ locator: "DIMM_A2", configuredMts: 2133, maxMts: 3200 }],
      },
      { level: "suggestion", kind: "biosAge", releaseDate: "2024-03-20", months: 30 },
    ],
  };
}

/** Backend das configurações do Windows e do hardware para testes de interface. */
export function mockSystemSettingsBackend(
  settings: WindowsSettingsReport = sampleWindowsSettings(),
  hardware: HardwareReport = sampleHardware(),
) {
  const handlers = {
    analyze_windows_settings: vi.fn(() => settings),
    analyze_hardware: vi.fn(() => hardware),
  };
  mockDesktopRuntime(handlers);
  return { handlers };
}
