import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { paths } from "@/app/router/paths";
import { renderRoute } from "@/test/render";
import { mockDesktopRuntime } from "@/test/tauri";

const BACKUP_DIR = ["C:", "Docs", "Zona de Controle", "Backups"].join("\\");

describe("Configurações — backup", () => {
  it("lista os backups e cria um novo", async () => {
    const user = userEvent.setup();
    const backups = [
      {
        fileName: "zona-de-controle-2026-09-24_080000.db",
        path: `${BACKUP_DIR}\\zona-de-controle-2026-09-24_080000.db`,
        sizeBytes: 2048,
        createdAt: "2026-09-24T08:00:00",
      },
    ];
    const created = {
      fileName: "zona-de-controle-2026-09-25_143005.db",
      path: `${BACKUP_DIR}\\zona-de-controle-2026-09-25_143005.db`,
      sizeBytes: 4096,
      createdAt: "2026-09-25T14:30:05",
    };
    const createBackup = vi.fn(() => {
      backups.unshift(created);
      return created;
    });
    mockDesktopRuntime({
      get_setting: () => null,
      list_database_backups: () => ({
        directory: BACKUP_DIR,
        backups: [...backups],
      }),
      create_database_backup: createBackup,
    });
    renderRoute(paths.settings);

    await user.click(await screen.findByRole("tab", { name: /Dados/ }));
    expect(await screen.findByText(BACKUP_DIR)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Backups existentes" });
    expect(within(list).getByText("24/09/2026 08:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Fazer backup agora/ }));

    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Backup criado")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Backups existentes" })).getByText(
          created.fileName,
        ),
      ).toBeInTheDocument();
    });
  });
});
