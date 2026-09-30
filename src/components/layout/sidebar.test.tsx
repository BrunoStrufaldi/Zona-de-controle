import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { Sidebar } from "@/components/layout/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderSidebar(collapsed: boolean, path = "/productivity/routines") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Sidebar collapsed={collapsed} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("recolhida, centraliza os ícones e destaca o item ativo", () => {
    renderSidebar(true);

    const active = screen.getByRole("link", { name: "Rotinas" });
    expect(active).toHaveAttribute("aria-current", "page");
    // O `TooltipTrigger asChild` junta `className` como texto: as classes
    // precisam chegar como texto, não como a função do NavLink.
    expect(active.className).not.toContain("=>");
    expect(active).toHaveClass("justify-center", "bg-primary/10");
    expect(screen.getByRole("link", { name: "Tarefas" })).not.toHaveClass("bg-primary/10");
  });

  it("expandida, mostra os nomes com o item ativo destacado", () => {
    renderSidebar(false, "/");

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("aria-current", "page");
    expect(dashboard).toHaveClass("px-3", "bg-primary/10");
    expect(dashboard).not.toHaveClass("justify-center");
  });
});
