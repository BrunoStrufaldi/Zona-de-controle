import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { optimizationTabHref } from "@/app/router/paths";
import {
  mockWindowsRepairBackend,
  scanningProgress,
  sfcProgress,
} from "@/test/fake-windows-repair-backend";
import { renderRoute } from "@/test/render";

describe("Otimização — Reparo do Windows", () => {
  it("explica os passos, avisa do reinício pendente e mostra o histórico", async () => {
    mockWindowsRepairBackend();
    renderRoute(optimizationTabHref("repair"));

    const steps = await screen.findByRole("list", { name: "Passos do reparo" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    expect(within(steps).getByText(/sfc \/scannow/)).toBeInTheDocument();
    expect(screen.getByText(/Há um reinício pendente do Windows/)).toBeInTheDocument();

    const history = await screen.findByRole("list", { name: "Reparos anteriores" });
    expect(within(history).getByText("Concluído")).toBeInTheDocument();
    expect(within(history).getByText("Interrompido")).toBeInTheDocument();
    expect(within(history).getByText(/O app foi fechado antes do fim/)).toBeInTheDocument();
  });

  it("sem as ferramentas, não deixa começar", async () => {
    mockWindowsRepairBackend({ toolsAvailable: false, pendingReboot: false, running: false });
    renderRoute(optimizationTabHref("repair"));

    expect(await screen.findByText(/Não disponível: as ferramentas de reparo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reparar o Windows/ })).toBeDisabled();
  });

  it("só começa depois da confirmação e acompanha o andamento até o resultado", async () => {
    const user = userEvent.setup();
    const backend = mockWindowsRepairBackend();
    renderRoute(optimizationTabHref("repair"));

    await user.click(await screen.findByRole("button", { name: /Reparar o Windows/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reparar o Windows?" });
    expect(within(confirm).getByText(/10 a 30 minutos/)).toBeInTheDocument();
    expect(
      within(confirm).getByText(/reinício pendente: o reparo provavelmente vai falhar/),
    ).toBeInTheDocument();
    expect(backend.handlers.run_windows_repair).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: /Pedir permissão e reparar/ }));
    expect(await screen.findByText("Aguardando a permissão…")).toBeInTheDocument();
    expect(backend.handlers.run_windows_repair).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cancelar reparo" })).toBeDisabled();

    backend.setProgress(scanningProgress());
    expect(await screen.findByText("Reparando…")).toBeInTheDocument();
    const progress = screen.getByRole("list", { name: "Andamento do reparo" });
    expect(within(progress).getByText("42,5%")).toBeInTheDocument();
    expect(within(progress).getByText("Nenhum dano encontrado na imagem.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar reparo" }));
    await waitFor(() => {
      expect(backend.handlers.cancel_windows_repair).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Cancelando…")).toBeInTheDocument();

    backend.finish({
      runId: "r1",
      outcome: "cancelled",
      steps: [
        { step: "checkHealth", result: { status: "health", health: "healthy" } },
        { step: "scanHealth", result: { status: "cancelled" } },
      ],
      restartRequired: false,
      error: null,
    });
    const result = await screen.findByRole("list", { name: "Resultado de cada passo" });
    expect(within(result).getByText("Cancelado.")).toBeInTheDocument();
    expect(screen.getByText("Reparo: cancelado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => {
      expect(backend.handlers.list_windows_repair_history).toHaveBeenCalledTimes(2);
    });
    expect(backend.handlers.check_windows_repair).toHaveBeenCalledTimes(2);
  });

  it("não deixa cancelar durante o SFC e pede reinício quando a DISM pede", async () => {
    const user = userEvent.setup();
    const backend = mockWindowsRepairBackend();
    renderRoute(optimizationTabHref("repair"));

    await user.click(await screen.findByRole("button", { name: /Reparar o Windows/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reparar o Windows?" });
    await user.click(within(confirm).getByRole("button", { name: /Pedir permissão e reparar/ }));
    backend.setProgress(sfcProgress());

    expect(await screen.findByText(/O SFC não pode ser interrompido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar reparo" })).toBeDisabled();

    backend.finish({
      runId: "r2",
      outcome: "success",
      steps: [{ step: "restoreHealth", result: { status: "restored", restartRequired: true } }],
      restartRequired: true,
      error: null,
    });
    expect(
      await screen.findByText("Reinicie o computador para concluir o reparo."),
    ).toBeInTheDocument();
  });

  it("UAC recusado aparece como falha com o motivo", async () => {
    const user = userEvent.setup();
    const backend = mockWindowsRepairBackend();
    renderRoute(optimizationTabHref("repair"));

    await user.click(await screen.findByRole("button", { name: /Reparar o Windows/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reparar o Windows?" });
    await user.click(within(confirm).getByRole("button", { name: /Pedir permissão e reparar/ }));
    backend.finish({
      runId: "r3",
      outcome: "failure",
      steps: [],
      restartRequired: false,
      error: "A permissão de administrador foi recusada. Nada foi feito.",
    });

    expect(await screen.findByText("Reparo: falhou")).toBeInTheDocument();
    expect(
      screen.getByText("A permissão de administrador foi recusada. Nada foi feito."),
    ).toBeInTheDocument();
  });
});
