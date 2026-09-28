import {
  type DiagnosticFinding,
  type DiagnosticFindingKind,
  type DiagnosticReport,
  type DiagnosticSeverity,
} from "@/features/system/diagnostics/types";
import { worstHealth } from "@/features/system/domain/health";
import { type HealthStatus } from "@/features/system/types";
import { formatBytes, formatNumber, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";

export type DiagnosticCheckId = "storage" | "memory" | "programs";

/** Ordem fixa das verificações na tela. */
export const DIAGNOSTIC_CHECKS: readonly DiagnosticCheckId[] = ["storage", "memory", "programs"];

export const checkLabels: Record<DiagnosticCheckId, string> = {
  storage: "Armazenamento",
  memory: "Memória",
  programs: "Programas",
};

export const severityLabels: Record<DiagnosticSeverity, string> = {
  attention: "Atenção",
  critical: "Crítico",
};

const checkByKind: Record<DiagnosticFindingKind, DiagnosticCheckId> = {
  diskSpace: "storage",
  memory: "memory",
  pageFile: "memory",
  programMemory: "programs",
  programCpu: "programs",
};

export function findingCheck(finding: DiagnosticFinding): DiagnosticCheckId {
  return checkByKind[finding.kind];
}

/** Gravidade → estado de saúde (mesmas cores e rótulos do Monitoramento). */
export function severityHealth(severity: DiagnosticSeverity): HealthStatus {
  return severity;
}

export function reportHealth(report: DiagnosticReport): HealthStatus {
  return worstHealth(report.findings.map((finding) => severityHealth(finding.severity)));
}

export interface CheckResult {
  check: DiagnosticCheckId;
  status: HealthStatus;
  findings: DiagnosticFinding[];
}

/** Uma entrada por verificação, na ordem fixa, mesmo sem achados. */
export function groupByCheck(report: DiagnosticReport): CheckResult[] {
  return DIAGNOSTIC_CHECKS.map((check) => {
    const findings = report.findings.filter((finding) => findingCheck(finding) === check);
    return {
      check,
      status: worstHealth(findings.map((finding) => severityHealth(finding.severity))),
      findings,
    };
  });
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

/** "O que foi verificado" de cada verificação sem problemas. */
export function checkSummary(check: DiagnosticCheckId, report: DiagnosticReport): string {
  switch (check) {
    case "storage":
      return `${plural(report.checkedDisks, "unidade fixa verificada", "unidades fixas verificadas")}. Unidades removíveis não entram.`;
    case "memory":
      return "Memória e arquivo de paginação dentro dos limites.";
    case "programs":
      return report.cpuMeasured
        ? `${plural(report.checkedPrograms, "programa verificado", "programas verificados")}.`
        : `${plural(report.checkedPrograms, "programa verificado", "programas verificados")} só pela memória: o uso de CPU não pôde ser medido.`;
  }
}

/** Limites aplicados em cada verificação, para o usuário saber o critério. */
export function checkCriteria(check: DiagnosticCheckId, report: DiagnosticReport): string {
  const t = report.thresholds;
  switch (check) {
    case "storage":
      return `Atenção a partir de ${t.diskAttentionPercent}% em uso, crítico a partir de ${t.diskCriticalPercent}% ou com menos de ${t.systemDiskMinFreeGb} GB livres na unidade do Windows.`;
    case "memory":
      return `Atenção a partir de ${t.memoryAttentionPercent}% em uso, crítico a partir de ${t.memoryCriticalPercent}%. Arquivo de paginação: atenção a partir de ${t.pageFileAttentionPercent}%.`;
    case "programs":
      return `Cita programas com mais de ${t.programMemoryPercent}% da memória ou ${t.programCpuPercent}% da CPU (exceto processos internos do Windows).`;
  }
}

export interface FindingText {
  title: string;
  detail: string;
  recommendation: string;
}

/**
 * Uma casa decimal: com o limite em 90%, "89,6%" (atenção) não pode aparecer
 * arredondado como "90%" ao lado do critério "crítico a partir de 90%".
 */
function usedPercent(part: number, total: number): string {
  return formatPercent(safeRatio(part, total), 1);
}

function programName(name: string, instances: number): string {
  return instances > 1 ? `“${name}” (${formatNumber(instances)} processos)` : `“${name}”`;
}

/** Título, números e recomendação de um achado, em pt-BR. */
export function describeFinding(finding: DiagnosticFinding): FindingText {
  switch (finding.kind) {
    case "diskSpace": {
      const free = Math.max(0, finding.totalBytes - finding.usedBytes);
      const name =
        finding.label === "" ? finding.mountPoint : `${finding.mountPoint} (${finding.label})`;
      return {
        title: finding.lowFreeSpace
          ? `Pouco espaço livre em ${name}`
          : `Unidade ${name} quase cheia`,
        detail: `${usedPercent(finding.usedBytes, finding.totalBytes)} em uso · ${formatBytes(free, 1)} livres de ${formatBytes(finding.totalBytes, 0)}`,
        recommendation: finding.systemDrive
          ? "Libere espaço: esvazie a Lixeira, desinstale programas que não usa ou mova arquivos grandes para outra unidade. O Windows precisa de espaço livre para atualizações e para o arquivo de paginação."
          : "Mova para outra unidade ou apague arquivos que não precisa mais.",
      };
    }
    case "memory":
      return {
        title: finding.severity === "critical" ? "Memória quase esgotada" : "Uso de memória alto",
        detail: `${usedPercent(finding.usedBytes, finding.totalBytes)} em uso · ${formatBytes(finding.usedBytes)} de ${formatBytes(finding.totalBytes, 0)}`,
        recommendation:
          "Feche programas que não está usando (veja quais usam mais memória em Monitoramento). Se acontecer com frequência, pode valer instalar mais RAM.",
      };
    case "pageFile":
      return {
        title: "Arquivo de paginação quase cheio",
        detail: `${formatBytes(finding.usedBytes)} de ${formatBytes(finding.totalBytes)} em uso`,
        recommendation:
          "O Windows está usando o disco como memória extra, o que deixa tudo mais lento. Feche programas pesados; se o limite for atingido, programas podem travar ou fechar.",
      };
    case "programMemory":
      return {
        title: `${programName(finding.name, finding.instances)} usa muita memória`,
        detail: `${formatBytes(finding.memoryBytes)} · ${usedPercent(finding.memoryBytes, finding.totalMemoryBytes)} da RAM`,
        recommendation:
          "Se não estiver usando esse programa agora, feche-o. Se ele for essencial, é o que mais pesa na memória.",
      };
    case "programCpu":
      return {
        title: `${programName(finding.name, finding.instances)} usa muita CPU`,
        detail: `${formatPercent(finding.cpuPercent / 100, 0)} da CPU no momento da análise`,
        recommendation:
          "Se o programa não deveria estar trabalhando agora, feche-o ou verifique se está travado.",
      };
  }
}
