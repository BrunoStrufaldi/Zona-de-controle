import { screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { addDays, toIsoDate } from "@/lib/dates";
import { mockTasksBackend } from "@/test/fake-tasks-backend";
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
      list_tasks: () => [],
    });
    renderRoute(paths.dashboard);

    expect(await screen.findByRole("heading", { level: 1, name: /, Bruno$/ })).toBeInTheDocument();
  });

  it("Dashboard resume as tarefas reais do dia", async () => {
    const today = toIsoDate(new Date());
    mockTasksBackend([
      { id: 1, title: "Atrasada", dueDate: addDays(today, -2) },
      { id: 2, title: "Para hoje", dueDate: today },
      { id: 3, title: "Feita hoje", status: "done", completedAt: new Date().toISOString() },
    ]);
    renderRoute(paths.dashboard);

    const upcoming = await screen.findByRole("list", { name: "Próximos vencimentos" });
    expect(within(upcoming).getByText("Atrasada")).toBeInTheDocument();
    expect(within(upcoming).getByText("Para hoje")).toBeInTheDocument();
    expect(screen.getByText("1 atrasada")).toBeInTheDocument();
    expect(screen.getByText("de 3 concluídas")).toBeInTheDocument();
  });
});
