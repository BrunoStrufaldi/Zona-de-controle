import { describe, expect, it } from "vitest";

import {
  confirmationNotes,
  defaultSelection,
  groupByCategory,
  itemCountLabel,
  progressPercent,
  removedOfLabel,
  reportTotals,
  resultNotes,
  scanTotals,
  selectionTotals,
  sourceNotes,
} from "@/features/system/optimization/domain/cleanup";
import { type CleanupSource, type SourceSummary } from "@/features/system/optimization/types";
import { SAMPLE_SCAN, sampleReport } from "@/test/fake-optimization-backend";

const MIB = 1024 ** 2;

function sampleSource(id: CleanupSource): SourceSummary {
  const found = SAMPLE_SCAN.sources.find((summary) => summary.source === id);
  if (!found) throw new Error(`origem ausente no exemplo: ${id}`);
  return found;
}

describe("análise da limpeza", () => {
  it("agrupa por categoria na ordem fixa, separando o que não existe", () => {
    const groups = groupByCategory(SAMPLE_SCAN);
    expect(groups.map((group) => group.category)).toEqual([
      "tempFiles",
      "safeCaches",
      "recycleBin",
    ]);

    const caches = groups[1];
    expect(caches?.sources.map((source) => source.source)).toEqual([
      "directXShaders",
      "nvidiaShaders",
      "crashDumps",
      "thumbnails",
      "chrome",
      "edge",
    ]);
    expect(caches?.missing.map((source) => source.source)).toEqual([
      "amdShaders",
      "errorReports",
      "brave",
      "firefox",
    ]);
    // O total do card inclui caches em uso: é o que existe na pasta.
    expect(caches?.totalBytes).toBe((2048 + 20 + 10 + 1024 + 50) * MIB);
  });

  it("separa o que pode ser liberado agora do que está em uso", () => {
    expect(scanTotals(SAMPLE_SCAN)).toEqual({
      readyBytes: (300 + 2048 + 20 + 10 + 50 + 5) * MIB,
      inUseBytes: 1024 * MIB,
    });
  });

  it("conta arquivos e, na Lixeira, itens", () => {
    expect(itemCountLabel("userTemp", 1)).toBe("1 arquivo");
    expect(itemCountLabel("userTemp", 21214)).toBe("21.214 arquivos");
    expect(itemCountLabel("recycleBin", 1)).toBe("1 item");
    expect(itemCountLabel("recycleBin", 3)).toBe("3 itens");
  });

  it("explica o que ficou de fora e pede para fechar o navegador", () => {
    expect(sourceNotes(sampleSource("userTemp"), 24)).toEqual([
      {
        text: "12 arquivos recentes (40 MB), com menos de 24 horas, ficam de fora.",
        warning: false,
      },
    ]);
    expect(sourceNotes(sampleSource("thumbnails"), 24)).toEqual([
      { text: "1 item ignorado (link, arquivo só na nuvem ou sem acesso).", warning: false },
    ]);
    expect(sourceNotes(sampleSource("chrome"), 24)).toEqual([
      { text: "Feche o Google Chrome para limpar este cache.", warning: true },
    ]);
  });
});

describe("limpeza", () => {
  it("marca por padrão o que pode ser limpo, menos os shaders", () => {
    expect(defaultSelection(SAMPLE_SCAN)).toEqual([
      "userTemp",
      "crashDumps",
      "thumbnails",
      "edge",
      "recycleBin",
    ]);
  });

  it("soma só as origens marcadas que podem ser limpas", () => {
    // Chrome em uso e DirectX vazio são ignorados mesmo se marcados.
    const totals = selectionTotals(
      SAMPLE_SCAN,
      new Set<CleanupSource>(["userTemp", "chrome", "directXShaders", "nvidiaShaders"]),
    );
    expect(totals.sources.map((summary) => summary.source)).toEqual(["userTemp", "nvidiaShaders"]);
    expect(totals.itemCount).toBe(253);
    expect(totals.totalBytes).toBe((300 + 2048) * MIB);
  });

  it("avisa sobre shaders e sobre a Lixeira só quando escolhidos", () => {
    const base = confirmationNotes([sampleSource("userTemp")]);
    expect(base).toHaveLength(3);
    expect(base[0]).toBe("A remoção é permanente: os arquivos não vão para a Lixeira.");
    expect(confirmationNotes([sampleSource("recycleBin")])[0]).toBe(
      "A remoção é permanente e não pode ser desfeita.",
    );
    const all = confirmationNotes([sampleSource("nvidiaShaders"), sampleSource("recycleBin")]);
    expect(all.some((note) => note.includes("recompilam"))).toBe(true);
    expect(all.some((note) => note.includes("Lixeira é esvaziada de uma vez"))).toBe(true);
  });

  it("totaliza o relatório e conta o que não foi processado", () => {
    const report = sampleReport(SAMPLE_SCAN, ["userTemp", "edge"]);
    expect(reportTotals(report)).toEqual({
      removedCount: 248 + 40,
      removedBytes: (298 + 50) * MIB,
      inUseCount: 2,
      changedCount: 0,
      failedCount: 0,
      pendingCount: 0,
    });
    const [temp] = report.sources;
    if (!temp) throw new Error("relatório sem a origem esperada");
    expect(resultNotes(temp)).toEqual(["2 em uso"]);
    expect(removedOfLabel(temp)).toBe("248 de 250 arquivos removidos");
    expect(
      removedOfLabel({ ...temp, source: "recycleBin", plannedCount: 1, removedCount: 1 }),
    ).toBe("1 de 1 item removido");
    expect(
      resultNotes({
        source: "userTemp",
        plannedCount: 10,
        removedCount: 2,
        removedBytes: 0,
        inUseCount: 0,
        changedCount: 1,
        failedCount: 1,
      }),
    ).toEqual(["1 mudou ou sumiu", "1 com erro", "6 não processados"]);
  });

  it("calcula o percentual do andamento", () => {
    const progress = {
      totalItems: 200,
      processedItems: 50,
      removedBytes: 0,
      currentSource: null,
      cancelRequested: false,
    };
    expect(progressPercent(progress)).toBe(25);
    expect(progressPercent({ ...progress, totalItems: 0 })).toBe(0);
  });
});
