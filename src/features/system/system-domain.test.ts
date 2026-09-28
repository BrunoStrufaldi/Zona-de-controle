import { describe, expect, it } from "vitest";

import { diskDisplayName } from "@/features/system/domain/disks";
import { systemHealth, worstHealth } from "@/features/system/domain/health";
import { appendSample, summarizeUsage, toUsageSample } from "@/features/system/domain/history";
import { selectProcesses } from "@/features/system/domain/processes";
import { type DiskUsage, type ProcessGroup, type SystemSnapshot } from "@/features/system/types";

const GIB = 1024 ** 3;

function snapshot(cpu: number | null, memoryUsedGib: number): SystemSnapshot {
  return {
    cpu: { usagePercent: cpu, coresPercent: [] },
    memory: {
      usedBytes: memoryUsedGib * GIB,
      totalBytes: 10 * GIB,
      swapUsedBytes: 0,
      swapTotalBytes: 0,
    },
    disks: [],
    uptimeSeconds: 60,
  };
}

function group(name: string, cpuPercent: number, memoryBytes: number): ProcessGroup {
  return { name, instances: 1, cpuPercent, memoryBytes };
}

describe("saúde do sistema", () => {
  it("usa o pior estado entre CPU e memória", () => {
    expect(systemHealth(snapshot(20, 5))).toBe("healthy");
    expect(systemHealth(snapshot(85, 5))).toBe("attention");
    expect(systemHealth(snapshot(20, 9.5))).toBe("critical");
  });

  it("ignora a CPU enquanto ela não foi medida", () => {
    expect(systemHealth(snapshot(null, 5))).toBe("healthy");
    expect(systemHealth(snapshot(null, 8.5))).toBe("attention");
  });

  it("lista vazia é saudável", () => {
    expect(worstHealth([])).toBe("healthy");
    expect(worstHealth(["attention", "healthy"])).toBe("attention");
  });
});

describe("histórico ao vivo", () => {
  it("converte a leitura em percentuais", () => {
    expect(toUsageSample(snapshot(null, 2.5), 1000)).toEqual({ at: 1000, cpu: null, memory: 25 });
  });

  it("mantém só as leituras mais recentes", () => {
    let history = appendSample([], toUsageSample(snapshot(1, 1), 1), 3);
    for (const at of [2, 3, 4])
      history = appendSample(history, toUsageSample(snapshot(at, 1), at), 3);
    expect(history.map((sample) => sample.at)).toEqual([2, 3, 4]);
  });

  it("resume atual, média e pico ignorando a CPU não medida", () => {
    const history = [
      { at: 1, cpu: null, memory: 40 },
      { at: 2, cpu: 10, memory: 50 },
      { at: 3, cpu: 30, memory: 60 },
    ];
    expect(summarizeUsage(history, "cpu")).toEqual({ current: 30, average: 20, peak: 30 });
    expect(summarizeUsage(history, "memory")).toEqual({ current: 60, average: 50, peak: 60 });
    expect(summarizeUsage(history.slice(0, 1), "cpu")).toEqual({
      current: null,
      average: null,
      peak: null,
    });
  });
});

describe("processos", () => {
  const groups = [
    group("chrome.exe", 5, 900),
    group("Code.exe", 12, 400),
    group("Explorer.EXE", 0, 100),
    group("ação.exe", 0, 100),
  ];

  it("ordena por CPU, memória ou nome", () => {
    const names = (key: "cpu" | "memory" | "name") =>
      selectProcesses(groups, "", key).map((item) => item.name);
    expect(names("cpu")).toEqual(["Code.exe", "chrome.exe", "ação.exe", "Explorer.EXE"]);
    expect(names("memory")).toEqual(["chrome.exe", "Code.exe", "ação.exe", "Explorer.EXE"]);
    expect(names("name")).toEqual(["ação.exe", "chrome.exe", "Code.exe", "Explorer.EXE"]);
  });

  it("busca sem diferenciar acentos e maiúsculas", () => {
    expect(selectProcesses(groups, "ACAO", "cpu").map((item) => item.name)).toEqual(["ação.exe"]);
    expect(selectProcesses(groups, "  ", "cpu")).toHaveLength(4);
  });

  it("não altera a lista original", () => {
    selectProcesses(groups, "", "name");
    expect(groups[0]?.name).toBe("chrome.exe");
  });
});

describe("discos", () => {
  const disk: DiskUsage = {
    mountPoint: "C:",
    label: "",
    fileSystem: "NTFS",
    kind: "ssd",
    removable: false,
    usedBytes: 1,
    totalBytes: 2,
  };

  it("usa o rótulo do volume ou um nome genérico", () => {
    expect(diskDisplayName({ ...disk, label: "Dados" })).toBe("Dados");
    expect(diskDisplayName(disk)).toBe("Disco local");
    expect(diskDisplayName({ ...disk, removable: true })).toBe("Unidade removível");
  });
});
