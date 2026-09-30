import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { App } from "@/app/app";
import { preloadDashboard } from "@/test/render";

describe("App", () => {
  beforeAll(preloadDashboard);

  it("inicializa com layout, sidebar e dashboard", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("não marca nenhum widget como Demo: todos usam dados reais", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: /Tarefas de hoje/ });
    expect(screen.queryAllByLabelText("Dados de demonstração")).toHaveLength(0);
    for (const title of [
      /Tarefas de hoje/,
      /Rotinas de hoje/,
      /Agora e a seguir/,
      /Atividades recentes/,
      /Status do sistema/,
      /Armazenamento/,
      /^Diagnóstico/,
      /Bateria dos dispositivos/,
      /Resumo financeiro do mês/,
      /Receita x despesas/,
    ]) {
      const card = screen.getByRole("heading", { name: title }).closest("[data-slot='card']");
      expect(card?.querySelector("[aria-label='Dados de demonstração']")).toBeNull();
    }
  });
});
