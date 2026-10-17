import {
  type RepairErrorKind,
  type RepairOutcome,
  type RepairProgress,
  type RepairStep,
  type StepProgress,
  type StepResult,
} from "@/features/system/windows-repair/types";

export const stepLabels: Record<RepairStep, string> = {
  checkHealth: "DISM: verificação rápida (CheckHealth)",
  scanHealth: "DISM: verificação completa (ScanHealth)",
  restoreHealth: "DISM: reparo da imagem (RestoreHealth)",
  sfc: "Verificação dos arquivos do sistema (sfc /scannow)",
};

export const stepDescriptions: Record<RepairStep, string> = {
  checkHealth: "Confere se o Windows já marcou a imagem do sistema como danificada. Leva segundos.",
  scanHealth: "Procura danos na imagem do sistema (os arquivos de onde o Windows se repara).",
  restoreHealth:
    "Só roda se a verificação achar algo reparável. Baixa as peças boas pelo Windows Update.",
  sfc: "Confere os arquivos do Windows e troca os danificados pelas cópias da imagem.",
};

export const outcomeLabels: Record<RepairOutcome, string> = {
  success: "Concluído",
  cancelled: "Cancelado",
  failure: "Falhou",
  interrupted: "Interrompido",
};

const errorTexts: Record<RepairErrorKind, string> = {
  sourceMissing:
    "A DISM não encontrou os arquivos para o reparo. Confira a internet e o Windows Update e tente de novo.",
  downloadFailed:
    "Não foi possível baixar os arquivos pelo Windows Update. Confira a internet e tente de novo.",
  rebootPending: "Há um reinício pendente. Reinicie o computador e rode o reparo de novo.",
  busy: "Outra manutenção do Windows (DISM ou Windows Update) está em andamento. Espere terminar e tente de novo.",
  other: "A operação falhou.",
};

function hex(code: number): string {
  return `0x${code.toString(16).toUpperCase().padStart(8, "0")}`;
}

/** O que aconteceu num passo, em pt-BR. */
export function describeResult(result: StepResult): string {
  switch (result.status) {
    case "health":
      if (result.health === "healthy") return "Nenhum dano encontrado na imagem.";
      if (result.health === "repairable") return "Danos encontrados: podem ser reparados.";
      return "A imagem está danificada demais para o reparo automático. O caminho é o reparo do Windows pela mídia de instalação (atualização in-place), que mantém arquivos e programas.";
    case "restored":
      return result.restartRequired
        ? "Imagem reparada. Reinicie o computador para concluir."
        : "Imagem reparada.";
    case "sfc":
      switch (result.outcome) {
        case "noViolations":
          return "Nenhum arquivo do sistema com problema.";
        case "repaired":
          return "Arquivos danificados foram encontrados e reparados.";
        case "couldNotRepair":
          return "Alguns arquivos danificados não puderam ser reparados. Os detalhes estão em C:\\Windows\\Logs\\CBS\\CBS.log.";
        case "unknown":
          return "O resultado não pôde ser identificado. Veja C:\\Windows\\Logs\\CBS\\CBS.log.";
      }
      break;
    case "skipped":
      return "Não foi preciso: a imagem está saudável.";
    case "cancelled":
      return "Cancelado.";
    case "failed": {
      const code = result.code === null ? "" : ` (${hex(result.code)})`;
      return `${errorTexts[result.kind]}${code}`;
    }
  }
}

/** Passo que pede atenção (falha, irreparável ou SFC sem reparar tudo). */
export function resultIsProblem(result: StepResult): boolean {
  return (
    result.status === "failed" ||
    (result.status === "health" && result.health === "nonRepairable") ||
    (result.status === "sfc" && result.outcome === "couldNotRepair")
  );
}

/** Passo em andamento, se houver. */
export function currentStep(progress: RepairProgress): StepProgress | null {
  return progress.steps.find((step) => step.state === "running") ?? null;
}

/** O SFC não pode ser interrompido com segurança. */
export function cancelBlocked(progress: RepairProgress): boolean {
  return currentStep(progress)?.step === "sfc";
}

/** Avisos da confirmação. */
export const REPAIR_CONFIRMATION_NOTES = [
  "Leva de 10 a 30 minutos (às vezes mais). Dá para usar o computador enquanto isso.",
  "O Windows vai pedir permissão de administrador (UAC). O app só roda estes passos fixos; nada mais.",
  "O reparo da imagem baixa arquivos pelo Windows Update: deixe a internet ligada.",
  "Não feche o app no meio: a DISM é cancelada e o próximo passo não começa (o SFC já iniciado vai até o fim).",
  "Início e fim ficam no log de auditoria.",
] as const;
