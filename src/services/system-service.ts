import { type ProcessList, type SystemInfo, type SystemSnapshot } from "@/features/system/types";
import { invokeCommand } from "@/services/tauri/commands";

/** SO, processador, núcleos e memória instalada (somente leitura). */
export function getSystemInfo(): Promise<SystemInfo> {
  return invokeCommand("get_system_info");
}

/** Uso atual de CPU, memória e discos (somente leitura). */
export function getSystemSnapshot(): Promise<SystemSnapshot> {
  return invokeCommand("get_system_snapshot");
}

/** Processos agrupados por nome, com CPU e memória (somente leitura). */
export function listProcesses(): Promise<ProcessList> {
  return invokeCommand("list_processes");
}
