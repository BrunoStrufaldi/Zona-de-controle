import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { paths, SETTINGS_TAB_PARAM } from "@/app/router/paths";
import { formatBytes } from "@/lib/format";
import { renderRoute } from "@/test/render";
import { mockDesktopRuntime } from "@/test/tauri";
import { type AppInfo, type AvailableUpdate, type UpdateProgress } from "@/types/app";

const ABOUT = `${paths.settings}?${SETTINGS_TAB_PARAM}=about`;

const APP_INFO: AppInfo = {
  name: "Zona de Controle",
  version: "0.2.0",
  identifier: "com.brunostrufaldi.zonadecontrole",
  databasePath: "C:\\dados\\zona-de-controle.db",
  schemaVersion: 13,
  updatedFrom: null,
};

const UPDATE: AvailableUpdate = {
  currentVersion: "0.2.0",
  version: "0.3.0",
  notes: "- Atualizador automático\n- Correções",
};

describe("Configurações — atualizações", () => {
  it("só procura quando o usuário clica e avisa quando já está na mais recente", async () => {
    const user = userEvent.setup();
    const check = vi.fn(() => null);
    mockDesktopRuntime({ get_app_info: () => APP_INFO, check_app_update: check });
    renderRoute(ABOUT);

    const button = await screen.findByRole("button", { name: "Procurar atualizações" });
    expect(check).not.toHaveBeenCalled();

    await user.click(button);

    expect(await screen.findByText("Você já está na versão mais recente.")).toBeInTheDocument();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("mostra as novidades e instala só depois da confirmação", async () => {
    const user = userEvent.setup();
    const progress: UpdateProgress = {
      stage: "downloading",
      downloadedBytes: 1_048_576,
      totalBytes: 4_194_304,
    };
    // No Windows o app fecha durante a instalação: a promessa não volta.
    const install = vi.fn(() => new Promise<null>(() => undefined));
    mockDesktopRuntime({
      get_app_info: () => APP_INFO,
      check_app_update: () => UPDATE,
      install_app_update: install,
      get_app_update_progress: () => progress,
    });
    renderRoute(ABOUT);

    await user.click(await screen.findByRole("button", { name: "Procurar atualizações" }));
    expect(await screen.findByText("Versão 0.3.0 disponível")).toBeInTheDocument();
    expect(screen.getByText("Você está na versão 0.2.0.")).toBeInTheDocument();
    expect(screen.getByText(/Atualizador automático/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Atualizar e reiniciar" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/backup do banco/)).toBeInTheDocument();
    expect(within(dialog).getByText(/assinatura conferir/)).toBeInTheDocument();
    expect(install).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Atualizar e reiniciar" }));

    expect(install).toHaveBeenCalledWith({ version: "0.3.0" });
    expect(await screen.findByText("Baixando a atualização…")).toBeInTheDocument();
    expect(
      screen.getByText(`${formatBytes(1_048_576)} de ${formatBytes(4_194_304)}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Procurar atualizações" })).toBeDisabled();
  });

  it("cancelar a confirmação não instala nada", async () => {
    const user = userEvent.setup();
    const install = vi.fn(() => null);
    mockDesktopRuntime({
      get_app_info: () => APP_INFO,
      check_app_update: () => UPDATE,
      install_app_update: install,
    });
    renderRoute(ABOUT);

    await user.click(await screen.findByRole("button", { name: "Procurar atualizações" }));
    await user.click(await screen.findByRole("button", { name: "Atualizar e reiniciar" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }),
    );

    expect(install).not.toHaveBeenCalled();
    expect(screen.getByText("Versão 0.3.0 disponível")).toBeInTheDocument();
  });

  it("mostra a falha da instalação e permite tentar de novo", async () => {
    const user = userEvent.setup();
    const message = "A assinatura da atualização não confere com a do app; nada foi instalado.";
    mockDesktopRuntime({
      get_app_info: () => APP_INFO,
      check_app_update: () => UPDATE,
      install_app_update: () => Promise.reject(new Error(message)),
      get_app_update_progress: () => null,
    });
    renderRoute(ABOUT);

    await user.click(await screen.findByRole("button", { name: "Procurar atualizações" }));
    await user.click(await screen.findByRole("button", { name: "Atualizar e reiniciar" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Atualizar e reiniciar",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it("mostra a falha da busca", async () => {
    const user = userEvent.setup();
    const message =
      "Sem conexão com o servidor de atualizações. Confira a internet e tente de novo.";
    mockDesktopRuntime({
      get_app_info: () => APP_INFO,
      check_app_update: () => Promise.reject(new Error(message)),
    });
    renderRoute(ABOUT);

    await user.click(await screen.findByRole("button", { name: "Procurar atualizações" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  it("depois de atualizar, avisa a versão nova e mostra a anterior no Sobre", async () => {
    mockDesktopRuntime({ get_app_info: () => ({ ...APP_INFO, updatedFrom: "0.1.0" }) });
    renderRoute(ABOUT);

    expect(
      await screen.findByText("Zona de Controle atualizado para a versão 0.2.0"),
    ).toBeInTheDocument();
    expect(await screen.findByText("0.2.0 (atualizado da 0.1.0)")).toBeInTheDocument();
  });
});
