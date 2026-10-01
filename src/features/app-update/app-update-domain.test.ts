import { describe, expect, it } from "vitest";

import { downloadedText, updateFraction } from "@/features/app-update/domain/update";
import { formatBytes } from "@/lib/format";

describe("andamento da atualização", () => {
  it("só mostra fração quando sabe o tamanho do download", () => {
    expect(updateFraction(null)).toBeNull();
    expect(updateFraction({ stage: "backup", downloadedBytes: 0, totalBytes: null })).toBeNull();
    expect(
      updateFraction({ stage: "downloading", downloadedBytes: 500, totalBytes: null }),
    ).toBeNull();
    expect(
      updateFraction({ stage: "downloading", downloadedBytes: 1_000, totalBytes: 4_000 }),
    ).toBe(0.25);
    expect(
      updateFraction({ stage: "downloading", downloadedBytes: 5_000, totalBytes: 4_000 }),
    ).toBe(1);
    expect(updateFraction({ stage: "installing", downloadedBytes: 4_000, totalBytes: 4_000 })).toBe(
      1,
    );
  });

  it("descreve o que já foi baixado, com o total quando existe", () => {
    expect(downloadedText({ stage: "backup", downloadedBytes: 0, totalBytes: null })).toBeNull();
    expect(
      downloadedText({ stage: "downloading", downloadedBytes: 1_048_576, totalBytes: 4_194_304 }),
    ).toBe(`${formatBytes(1_048_576)} de ${formatBytes(4_194_304)}`);
    expect(downloadedText({ stage: "downloading", downloadedBytes: 2_048, totalBytes: null })).toBe(
      `${formatBytes(2_048)} baixados`,
    );
  });
});
