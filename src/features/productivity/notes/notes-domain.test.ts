import { describe, expect, it } from "vitest";

import {
  collectNoteTags,
  countWords,
  filterNotes,
  findJournalEntry,
  noteDisplayTitle,
  noteExcerpt,
  validateFolderName,
} from "@/features/productivity/notes/domain/notes";
import { type Note } from "@/features/productivity/notes/types";

let nextId = 1;
function note(overrides: Partial<Note> = {}): Note {
  const id = overrides.id ?? nextId++;
  return {
    id,
    title: `Nota ${id}`,
    content: "",
    folderId: null,
    favorite: false,
    journalDate: null,
    tags: [],
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

describe("títulos e trechos", () => {
  it("usa título, data do diário ou 'Sem título'", () => {
    expect(noteDisplayTitle(note({ title: "  Ideias " }))).toBe("Ideias");
    expect(noteDisplayTitle(note({ title: "", journalDate: "2026-09-25" }))).toBe(
      "Diário de 25/09/2026",
    );
    expect(noteDisplayTitle(note({ title: " " }))).toBe("Sem título");
  });

  it("gera trecho sem marcação Markdown", () => {
    const content = [
      "# Reunião",
      "",
      "- [x] **Aprovar** o [orçamento](https://exemplo.com)",
      "> citação _importante_",
      "```",
      "codigo()",
      "```",
      "Fim.",
    ].join("\n");
    expect(noteExcerpt(content)).toBe("Reunião Aprovar o orçamento citação importante Fim.");
    expect(noteExcerpt("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
  });

  it("conta palavras", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  uma  nota\ncurta ")).toBe(3);
  });
});

describe("filtros", () => {
  const notes = [
    note({ id: 1, title: "Orçamento", updatedAt: "2026-09-20T10:00:00Z", tags: ["casa"] }),
    note({ id: 2, title: "Receitas", folderId: 7, updatedAt: "2026-09-24T10:00:00Z" }),
    note({ id: 3, title: "Leituras", favorite: true, updatedAt: "2026-09-01T10:00:00Z" }),
    note({ id: 4, title: "", journalDate: "2026-09-24", content: "Dia bom" }),
    note({ id: 5, title: "", journalDate: "2026-09-25" }),
  ];
  const all = { view: { kind: "all" } as const, search: "", tag: null };

  it("ordena favoritas primeiro e depois as editadas recentemente", () => {
    expect(filterNotes(notes, all).map((n) => n.id)).toEqual([3, 2, 1, 4, 5]);
  });

  it("filtra por visão", () => {
    const ids = (view: Parameters<typeof filterNotes>[1]["view"]) =>
      filterNotes(notes, { ...all, view }).map((n) => n.id);
    expect(ids({ kind: "favorites" })).toEqual([3]);
    expect(ids({ kind: "folder", folderId: 7 })).toEqual([2]);
    expect(ids({ kind: "unfiled" })).toEqual([3, 1]);
    // Diário: do dia mais recente para o mais antigo.
    expect(ids({ kind: "journal" })).toEqual([5, 4]);
  });

  it("busca sem acentos no título e no conteúdo, e filtra por tag", () => {
    expect(filterNotes(notes, { ...all, search: "orcamento" }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { ...all, search: "DIA BOM" }).map((n) => n.id)).toEqual([4]);
    expect(filterNotes(notes, { ...all, tag: "casa" }).map((n) => n.id)).toEqual([1]);
    expect(collectNoteTags(notes)).toEqual(["casa"]);
    expect(findJournalEntry(notes, "2026-09-24")?.id).toBe(4);
  });
});

describe("pastas", () => {
  const folders = [{ id: 1, name: "Estudos", noteCount: 0 }];

  it("valida nome obrigatório e único", () => {
    expect(validateFolderName("  ", folders)).toMatch(/nome/);
    expect(validateFolderName("estudos", folders)).toMatch(/Já existe/);
    expect(validateFolderName("ESTUDOS", folders, 1)).toBeNull();
    expect(validateFolderName("Receitas", folders)).toBeNull();
  });
});
