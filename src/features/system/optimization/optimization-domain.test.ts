import { describe, expect, it } from "vitest";

import {
  groupByCategory,
  itemCountLabel,
  scanTotals,
  sourceNotes,
} from "@/features/system/optimization/domain/cleanup";
import { type CleanupSource, type SourceSummary } from "@/features/system/optimization/types";
import { SAMPLE_SCAN } from "@/test/fake-optimization-backend";

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
