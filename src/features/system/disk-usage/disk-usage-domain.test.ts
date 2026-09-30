import { describe, expect, it } from "vitest";

import {
  joinPath,
  scanDurationLabel,
  scanNotes,
  shareLabel,
  shareOfParent,
  splitPath,
  volumeSegments,
} from "@/features/system/disk-usage/domain/disk-usage";
import {
  type ChildrenState,
  folderKey,
  treeKeyAction,
  visibleRows,
} from "@/features/system/disk-usage/domain/tree";
import { type DiskEntry, type DiskUsageScan } from "@/features/system/disk-usage/types";
import { SAMPLE_CHILDREN, SAMPLE_DISK_SCAN } from "@/test/fake-disk-usage-backend";

const GIB = 1024 ** 3;

describe("textos e cálculos do Espaço em disco", () => {
  it("mede a duração em segundos e minutos", () => {
    expect(scanDurationLabel(400)).toBe("1 s");
    expect(scanDurationLabel(3_400)).toBe("3 s");
    expect(scanDurationLabel(60_000)).toBe("1 min");
    expect(scanDurationLabel(72_400)).toBe("1 min 12 s");
  });

  it("separa e junta caminhos do Windows", () => {
    expect(splitPath("C:\\Users\\bruno\\video.mp4")).toEqual({
      name: "video.mp4",
      folder: "C:\\Users\\bruno",
    });
    expect(splitPath("C:\\pagefile.sys")).toEqual({ name: "pagefile.sys", folder: "C:\\" });
    expect(joinPath("C:\\", "Users")).toBe("C:\\Users");
    expect(joinPath("C:\\Users", "bruno")).toBe("C:\\Users\\bruno");
  });

  it("mostra a parte da pasta com mais detalhe quando é pequena", () => {
    expect(shareLabel(0.678)).toBe("68%");
    expect(shareLabel(0.035)).toBe("3,5%");
    expect(shareLabel(0.0002)).toBe("<0,1%");
    expect(shareLabel(0)).toBe("0%");
  });

  it("calcula a parte da pasta de cima sem passar de 100%", () => {
    expect(shareOfParent(25, 100)).toBe(0.25);
    expect(shareOfParent(10, 0)).toBe(0);
    expect(shareOfParent(150, 100)).toBe(1);
  });

  it("divide a unidade em pastas, não identificado e livre", () => {
    expect(volumeSegments(SAMPLE_DISK_SCAN)).toEqual({
      scannedBytes: 118 * GIB,
      unaccountedBytes: 12 * GIB,
      freeBytes: 70 * GIB,
      totalBytes: 200 * GIB,
    });
    // Somado a mais que o em uso (leitura em momentos diferentes): nunca negativo.
    const over: DiskUsageScan = {
      ...SAMPLE_DISK_SCAN,
      totals: { ...SAMPLE_DISK_SCAN.totals, allocatedBytes: 140 * GIB },
    };
    expect(volumeSegments(over).unaccountedBytes).toBe(0);
  });

  it("explica o espaço não identificado, os links físicos e os arquivos na nuvem", () => {
    const scan: DiskUsageScan = {
      ...SAMPLE_DISK_SCAN,
      stats: {
        skippedLinks: 1,
        hardLinkDuplicates: 57_338,
        hardLinkBytes: 13.5 * GIB,
        cloudOnlyFiles: 1,
        cloudOnlyBytes: 0.9 * GIB,
      },
    };
    expect(scanNotes(scan).map((note) => note.text)).toEqual([
      "12 GB em uso na unidade não aparecem em nenhuma pasta: 1 pasta sem acesso (como System Volume Information, onde ficam os pontos de restauração) e arquivos internos do sistema de arquivos. Sem administrador, o app não lê esses locais e não estima o que há neles.",
      "57.338 nomes repetidos de arquivos (13,5 GB) por links físicos, comuns em C:\\Windows\\WinSxS: o mesmo arquivo aparece em mais de uma pasta e foi contado uma vez só, na primeira pasta lida.",
      "1 arquivo (921,6 MB) está só na nuvem (OneDrive) e quase não ocupa o disco até ser baixado.",
      "1 atalho de pasta (link ou junção) não foi seguido, para nada ser contado duas vezes.",
    ]);
    expect(
      scanNotes({
        ...SAMPLE_DISK_SCAN,
        unaccountedBytes: 0,
        stats: { ...scan.stats, skippedLinks: 0, hardLinkDuplicates: 0, cloudOnlyFiles: 0 },
      }),
    ).toEqual([]);
  });
});

describe("árvore do Espaço em disco", () => {
  const root: DiskEntry = SAMPLE_DISK_SCAN.root;
  const used = SAMPLE_DISK_SCAN.volumeUsedBytes;
  const loaded = (id: number): [number, ChildrenState] => {
    const data = SAMPLE_CHILDREN[id];
    if (!data) throw new Error(`sem a pasta ${id}`);
    return [id, { status: "success", data }];
  };

  it("mostra a raiz aberta com o conteúdo e os itens menores somados", () => {
    const rows = visibleRows(root, used, new Set([0]), new Map([loaded(0)]));
    expect(rows.map((row) => row.key)).toEqual([
      folderKey(0),
      folderKey(1),
      folderKey(2),
      "file:0:pagefile.sys",
      folderKey(3),
      "rest:0",
    ]);
    const [first, second] = rows;
    expect(first).toMatchObject({
      depth: 0,
      path: "C:\\",
      parentAllocatedBytes: used,
      expanded: true,
    });
    expect(second).toMatchObject({
      depth: 1,
      path: "C:\\Users",
      parentKey: folderKey(0),
      parentAllocatedBytes: 118 * GIB,
      expanded: false,
    });
  });

  it("mostra o carregamento e o erro de uma pasta aberta", () => {
    const loading = visibleRows(root, used, new Set([0, 1]), new Map([loaded(0)]));
    expect(loading[2]).toMatchObject({ kind: "loading", depth: 2, parentKey: folderKey(1) });

    const failed = visibleRows(
      root,
      used,
      new Set([0, 1]),
      new Map([loaded(0), [1, { status: "error", message: "falhou" }]]),
    );
    expect(failed[2]).toMatchObject({ kind: "error", folderId: 1, message: "falhou" });
  });

  it("pasta sem conteúdo (ou sem acesso) não abre", () => {
    const rows = visibleRows(root, used, new Set([0, 3]), new Map([loaded(0)]));
    expect(rows.find((row) => row.key === folderKey(3))).toMatchObject({ expanded: false });
    expect(treeKeyAction(rows, folderKey(3), "ArrowRight")).toBeNull();
  });

  it("navega pelo teclado como numa árvore", () => {
    const rows = visibleRows(root, used, new Set([0, 1]), new Map([loaded(0), loaded(1)]));
    const users = folderKey(1);
    expect(treeKeyAction(rows, users, "ArrowDown")).toEqual({ type: "focus", key: folderKey(4) });
    expect(treeKeyAction(rows, users, "ArrowUp")).toEqual({ type: "focus", key: folderKey(0) });
    expect(treeKeyAction(rows, users, "ArrowRight")).toEqual({ type: "focus", key: folderKey(4) });
    expect(treeKeyAction(rows, users, "ArrowLeft")).toEqual({ type: "collapse", folderId: 1 });
    expect(treeKeyAction(rows, folderKey(4), "ArrowRight")).toEqual({
      type: "expand",
      folderId: 4,
    });
    expect(treeKeyAction(rows, folderKey(4), "ArrowLeft")).toEqual({ type: "focus", key: users });
    expect(treeKeyAction(rows, users, "Home")).toEqual({ type: "focus", key: folderKey(0) });
    expect(treeKeyAction(rows, users, "End")).toEqual({ type: "focus", key: "rest:0" });
    expect(treeKeyAction(rows, folderKey(0), "ArrowLeft")).toEqual({
      type: "collapse",
      folderId: 0,
    });
    expect(treeKeyAction(rows, "sumiu", "ArrowDown")).toEqual({ type: "focus", key: folderKey(0) });
  });
});
