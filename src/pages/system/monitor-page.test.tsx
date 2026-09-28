import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { preloadMonitor, renderRoute } from "@/test/render";
import { mockSystemBackend } from "@/test/fake-system-backend";

describe("página de Monitoramento", () => {
  beforeAll(preloadMonitor);

  it("mostra CPU, memória, discos e informações do computador", async () => {
    mockSystemBackend();
    renderRoute(paths.system.monitor);

    // A primeira leitura ainda não mediu a CPU: nada de 0% inventado.
    expect(await screen.findByText("Medindo…")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("12 GB de 16 GB em uso")).toBeInTheDocument();

    const disks = screen.getByRole("list", { name: "Unidades de armazenamento" });
    expect(within(disks).getByText("Disco local")).toBeInTheDocument();
    expect(within(disks).getByText("Pendrive")).toBeInTheDocument();
    expect(within(disks).getByText("SSD · NTFS")).toBeInTheDocument();

    expect(await screen.findByText("Processador de Teste")).toBeInTheDocument();
    expect(screen.getByText("2 físicos · 4 lógicos")).toBeInTheDocument();
    // Sem leitura de temperatura: "Não disponível", nunca um valor estimado.
    expect(screen.getByText(/só libera os sensores/)).toBeInTheDocument();
  });

  it("atualiza a CPU na leitura seguinte", async () => {
    mockSystemBackend({ cpuPercent: 37 });
    renderRoute(paths.system.monitor);

    expect(await screen.findByText("37%", {}, { timeout: 4_000 })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Uso por núcleo lógico" }).children).toHaveLength(4);
  });

  it("lista processos agrupados, com busca e ordenação", async () => {
    const user = userEvent.setup();
    mockSystemBackend();
    renderRoute(paths.system.monitor);

    const table = await screen.findByRole("table", { name: "Processos por programa" });
    expect(screen.getByText("14 processos · 3 programas")).toBeInTheDocument();
    // Primeira leitura: CPU por programa ainda não medida.
    expect(screen.getByText("Medindo o uso de CPU por programa…")).toBeInTheDocument();

    const names = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    expect(names()).toEqual(["editor.exe", "navegador.exe×12", "musica.exe"]);

    await user.click(within(table).getByRole("button", { name: "Memória" }));
    expect(names()).toEqual(["navegador.exe×12", "editor.exe", "musica.exe"]);
    expect(within(table).getByRole("columnheader", { name: "Memória" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    await user.type(screen.getByRole("searchbox", { name: "Buscar processos" }), "MÚSICA");
    expect(names()).toEqual(["musica.exe"]);
  });

  it("pausa e retoma as leituras", async () => {
    const user = userEvent.setup();
    mockSystemBackend();
    renderRoute(paths.system.monitor);

    expect(await screen.findByText("Ao vivo · a cada 2 s")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pausar" }));
    expect(screen.getByText("Pausado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retomar" }));
    expect(screen.getByText("Ao vivo · a cada 2 s")).toBeInTheDocument();
  });
});
