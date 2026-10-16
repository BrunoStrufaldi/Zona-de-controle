import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { optimizationTabHref } from "@/app/router/paths";
import {
  mockSystemSettingsBackend,
  sampleHardware,
  sampleWindowsSettings,
} from "@/test/fake-system-settings-backend";
import { renderRoute } from "@/test/render";

describe("Otimização — Ajustes do Windows", () => {
  it("abre pela URL e mostra o que dá para melhorar, mais grave primeiro", async () => {
    mockSystemSettingsBackend();
    renderRoute(optimizationTabHref("settings"));

    const findings = await screen.findByRole("list", { name: "Sugestões e alertas" });
    const items = within(findings).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0] as HTMLElement).getByText("Reinício pendente")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText("Atenção")).toBeInTheDocument();
    expect(
      within(items[1] as HTMLElement).getByText("Usar o plano “Alto desempenho”"),
    ).toBeInTheDocument();
    expect(
      within(items[1] as HTMLElement).getByText("Atual: Meu plano → sugerido: Alto desempenho"),
    ).toBeInTheDocument();
    expect(within(items[2] as HTMLElement).getByText("Modo de Jogo desligado")).toBeInTheDocument();

    const status = screen.getByLabelText("Leituras do Windows");
    expect(within(status).getByText("Meu plano")).toBeInTheDocument();
    expect(within(status).getByText("Personalizado")).toBeInTheDocument();
    expect(screen.getByText("Placa de vídeo: Placa de Vídeo Exemplo")).toBeInTheDocument();
  });

  it("lista a inicialização sem sugerir o que desligar", async () => {
    mockSystemSettingsBackend();
    renderRoute(optimizationTabHref("settings"));

    const startup = await screen.findByRole("list", { name: "Programas na inicialização" });
    expect(within(startup).getAllByRole("listitem")).toHaveLength(3);
    expect(within(startup).getByText("Arquivo não encontrado")).toBeInTheDocument();
    expect(within(startup).getByText(/desligado em 10\/01\/2026/)).toBeInTheDocument();
    expect(
      within(startup).getByText(/Registro da máquina · só com administrador/),
    ).toBeInTheDocument();
    // 2 ligados (registro) · 2 desligados (1 do registro + 1 app da Store).
    expect(screen.getByText("2 ligados · 2 desligados")).toBeInTheDocument();
    const store = screen.getByRole("list", { name: "Apps da Microsoft Store na inicialização" });
    expect(within(store).getByText("Editora.Musica")).toBeInTheDocument();
  });

  it("leitura indisponível aparece como “Não disponível”", async () => {
    const empty = sampleWindowsSettings();
    empty.power = null;
    empty.gameMode = null;
    empty.gpus = null;
    empty.pendingReboot = null;
    empty.findings = [];
    empty.startup = { items: [], packaged: [], packagedAvailable: false };
    mockSystemSettingsBackend(empty);
    renderRoute(optimizationTabHref("settings"));

    expect(await screen.findByText("Nada a melhorar.")).toBeInTheDocument();
    const status = screen.getByLabelText("Leituras do Windows");
    expect(within(status).getAllByText("Não disponível")).toHaveLength(4);
    expect(screen.getByText("Não disponível.")).toBeInTheDocument();
  });

  it("lê de novo pelo botão", async () => {
    const user = userEvent.setup();
    const { handlers } = mockSystemSettingsBackend();
    renderRoute(optimizationTabHref("settings"));

    await screen.findByRole("list", { name: "Sugestões e alertas" });
    await user.click(screen.getByRole("button", { name: /Ler de novo/ }));
    await waitFor(() => {
      expect(handlers.analyze_windows_settings).toHaveBeenCalledTimes(2);
    });
  });
});

describe("Otimização — Hardware e BIOS", () => {
  it("mostra os achados e as leituras do firmware e da memória", async () => {
    mockSystemSettingsBackend();
    renderRoute(optimizationTabHref("hardware"));

    const findings = await screen.findByRole("list", { name: "Sugestões e alertas" });
    const items = within(findings).getAllByRole("listitem");
    expect(
      within(items[0] as HTMLElement).getByText("Microcódigo do processador desatualizado"),
    ).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText("Crítico")).toBeInTheDocument();
    expect(
      within(items[0] as HTMLElement).getByText(
        "Revisão 0x129 · as correções da Intel começam na 0x12B",
      ),
    ).toBeInTheDocument();
    expect(
      within(items[1] as HTMLElement).getByText("DIMM_A2: 2.133 MT/s de 3.200 MT/s"),
    ).toBeInTheDocument();
    expect(within(items[2] as HTMLElement).getByText("BIOS de março de 2024")).toBeInTheDocument();

    const firmware = screen.getByLabelText("Leituras do firmware");
    expect(within(firmware).getByText("ASUSTeK COMPUTER INC. PLACA EXEMPLO")).toBeInTheDocument();
    expect(within(firmware).getByText("Versão 1001 de 20/03/2024")).toBeInTheDocument();
    expect(within(firmware).getByText("Ativada (em uso pelo Windows)")).toBeInTheDocument();
    expect(within(firmware).getByText("Não disponível")).toBeInTheDocument();
    expect(screen.getByText("Microcódigo")).toBeInTheDocument();
    expect(
      screen.getByText("Configurada: 2.133 MT/s · informada pelo módulo: 3.200 MT/s"),
    ).toBeInTheDocument();
  });

  it("abre o passo a passo da BIOS com a ferramenta da fabricante", async () => {
    const user = userEvent.setup();
    mockSystemSettingsBackend();
    renderRoute(optimizationTabHref("hardware"));

    await screen.findByRole("list", { name: "Sugestões e alertas" });
    const buttons = screen.getAllByRole("button", { name: "Ver o passo a passo" });
    await user.click(buttons[1] as HTMLElement);

    const dialog = await screen.findByRole("dialog", {
      name: "Ligar o perfil de memória (XMP/EXPO)",
    });
    expect(within(dialog).getByText(/Ai Tweaker > Ai Overclock Tuner/)).toBeInTheDocument();
    expect(within(dialog).getByText(/nunca altera a BIOS/)).toBeInTheDocument();
  });

  it("sem tabelas SMBIOS, a memória fica como não disponível", async () => {
    const hardware = sampleHardware();
    hardware.smbiosAvailable = false;
    hardware.memoryModules = [];
    hardware.bios = null;
    hardware.board = null;
    hardware.findings = [];
    hardware.cpu.microcode = null;
    mockSystemSettingsBackend(sampleWindowsSettings(), hardware);
    renderRoute(optimizationTabHref("hardware"));

    expect(await screen.findByText("Nada a melhorar.")).toBeInTheDocument();
    expect(screen.getByText("Não disponível.")).toBeInTheDocument();
    expect(screen.queryByText("Microcódigo")).not.toBeInTheDocument();
    const firmware = screen.getByLabelText("Leituras do firmware");
    expect(within(firmware).getAllByText("Não disponível")).toHaveLength(3);
  });
});
