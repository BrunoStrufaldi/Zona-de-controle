import { screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { preloadDashboard, renderRoute } from "@/test/render";
import { mockDesktopRuntime } from "@/test/tauri";

describe("páginas integradas ao backend", () => {
  beforeAll(preloadDashboard);

  it("Dispositivos lista os providers retornados pelo Rust", async () => {
    mockDesktopRuntime({
      list_battery_providers: () => [
        {
          id: "bluetooth",
          name: "Bluetooth",
          description: "Battery Service padrão.",
          status: "planned",
        },
      ],
    });
    renderRoute(paths.system.devices);

    expect(await screen.findByText("Battery Service padrão.")).toBeInTheDocument();
    expect(screen.getByText("Planejado")).toBeInTheDocument();
  });

  it("Configurações mostra aviso no navegador em vez de erro", async () => {
    renderRoute(paths.settings);

    expect(await screen.findByText("Disponível apenas no app desktop")).toBeInTheDocument();
  });

  it("Dashboard saúda o usuário pelo nome salvo", async () => {
    mockDesktopRuntime({
      get_setting: () => ({
        key: "profile.display_name",
        value: "Bruno",
        updatedAt: "2026-09-25T12:00:00Z",
      }),
    });
    renderRoute(paths.dashboard);

    expect(await screen.findByRole("heading", { level: 1, name: /, Bruno$/ })).toBeInTheDocument();
  });
});
