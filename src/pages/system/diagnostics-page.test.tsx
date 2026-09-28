import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { diagnosticThresholdsHref, paths } from "@/app/router/paths";
import { DEFAULT_THRESHOLDS, mockDiagnosticsBackend } from "@/test/fake-diagnostics-backend";
import { renderRoute } from "@/test/render";

describe("página de Diagnósticos", () => {
  it("mostra os alertas por verificação, com recomendação", async () => {
    mockDiagnosticsBackend();
    renderRoute(paths.system.diagnostics);

    expect(await screen.findByText("3 alertas")).toBeInTheDocument();
    const storage = screen.getByRole("list", { name: "Alertas de Armazenamento" });
    expect(within(storage).getByText("Pouco espaço livre em C:")).toBeInTheDocument();
    expect(within(storage).getByText("Crítico")).toBeInTheDocument();
    expect(within(storage).getByText(/esvazie a Lixeira/)).toBeInTheDocument();

    const programs = screen.getByRole("list", { name: "Alertas de Programas" });
    expect(within(programs).getByText("“jogo.exe” usa muita memória")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ajustar limites/ })).toHaveAttribute(
      "href",
      diagnosticThresholdsHref,
    );
  });

  it("indica quando está tudo certo e analisa de novo", async () => {
    const user = userEvent.setup();
    const { handlers } = mockDiagnosticsBackend([]);
    renderRoute(paths.system.diagnostics);

    expect(await screen.findByText("Nenhum problema encontrado")).toBeInTheDocument();
    expect(screen.getAllByText("Tudo certo.")).toHaveLength(3);
    expect(
      screen.getByText("2 unidades fixas verificadas. Unidades removíveis não entram."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Analisar de novo/ }));
    await waitFor(() => {
      expect(handlers.run_diagnostics).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Nenhum problema encontrado")).toBeInTheDocument();
  });
});

describe("Configurações — limites do diagnóstico", () => {
  it("abre a aba pela URL, salva e mostra erros de validação do Rust", async () => {
    const user = userEvent.setup();
    const { handlers } = mockDiagnosticsBackend();
    renderRoute(diagnosticThresholdsHref);

    const critical = await screen.findAllByLabelText("Crítico a partir de (%)");
    const diskCritical = critical[0] as HTMLElement;
    const save = screen.getByRole("button", { name: /Salvar limites/ });
    expect(save).toBeDisabled();

    // Atenção (80) ≥ crítico (75): o Rust recusa e a mensagem aparece no formulário.
    await user.clear(diskCritical);
    await user.type(diskCritical, "75");
    await user.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "o limite de atenção deve ser menor que o crítico",
    );

    await user.clear(diskCritical);
    await user.type(diskCritical, "95");
    await user.click(save);
    await waitFor(() => {
      expect(handlers.set_diagnostic_thresholds).toHaveBeenLastCalledWith({
        thresholds: { ...DEFAULT_THRESHOLDS, diskCriticalPercent: 95 },
      });
    });
    expect(await screen.findByText("Limites salvos")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Restaurar padrões só preenche o formulário; salvar continua explícito.
    await user.click(screen.getByRole("button", { name: /Restaurar padrões/ }));
    expect(diskCritical).toHaveValue("90");
    expect(handlers.set_diagnostic_thresholds).toHaveBeenCalledTimes(2);
  });

  it("aponta o campo que não é número inteiro sem chamar o backend", async () => {
    const user = userEvent.setup();
    const { handlers } = mockDiagnosticsBackend();
    renderRoute(diagnosticThresholdsHref);

    const cpu = await screen.findByLabelText("Citar acima de (CPU) (%)");
    await user.clear(cpu);
    await user.click(screen.getByRole("button", { name: /Salvar limites/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe um número inteiro positivo.",
    );
    expect(cpu).toHaveAttribute("aria-invalid", "true");
    expect(handlers.set_diagnostic_thresholds).not.toHaveBeenCalled();
  });
});
