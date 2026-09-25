import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "@/app/app";

describe("App", () => {
  it("inicializa com layout, sidebar e dashboard", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("marca todos os widgets com dados fictícios como Demo", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: /Tarefas de hoje/ });
    expect(screen.getAllByLabelText("Dados de demonstração").length).toBeGreaterThanOrEqual(8);
  });
});
