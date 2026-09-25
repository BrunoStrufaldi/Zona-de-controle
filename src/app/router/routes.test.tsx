import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { navigation } from "@/config/navigation";
import { flattenNavigation } from "@/lib/navigation";
import { renderRoute } from "@/test/render";

const pagesWithTitle = flattenNavigation(navigation).filter(
  (item) => item.path !== paths.dashboard,
);

describe("roteamento", () => {
  it.each(pagesWithTitle.map((item) => [item.path, item.label] as const))(
    "%s renderiza a página “%s”",
    async (path, label) => {
      renderRoute(path);
      expect(await screen.findByRole("heading", { level: 1, name: label })).toBeInTheDocument();
    },
  );

  it("exibe a página 404 para rotas desconhecidas", async () => {
    renderRoute("/rota/inexistente");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar ao dashboard/ })).toHaveAttribute("href", "/");
  });

  it("navega pela sidebar e atualiza o breadcrumb", async () => {
    const user = userEvent.setup();
    const { router } = renderRoute(paths.dashboard);
    await screen.findByRole("heading", { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)/ });

    await user.click(screen.getByRole("link", { name: "Parcelamentos" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Parcelamentos" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.finance.installments);
    const breadcrumb = screen.getByRole("navigation", { name: "Você está em" });
    expect(within(breadcrumb).getByText("Finanças")).toBeInTheDocument();
    expect(within(breadcrumb).getByText("Parcelamentos")).toBeInTheDocument();
  });

  it("recolhe e expande um grupo da sidebar", async () => {
    const user = userEvent.setup();
    renderRoute(paths.settings);
    await screen.findByRole("heading", { level: 1, name: "Configurações" });

    const groupToggle = screen.getByRole("button", { name: "Sistema" });
    expect(groupToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(groupToggle);
    expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Monitoramento" })).not.toBeInTheDocument();
  });
});
