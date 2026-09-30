import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { diskUsageHref, paths } from "@/app/router/paths";
import { type DiskUsageScan } from "@/features/system/disk-usage/types";
import { fail, mockDiskUsageBackend, SAMPLE_DISK_SCAN } from "@/test/fake-disk-usage-backend";
import { renderRoute } from "@/test/render";

describe("página Espaço em disco", () => {
  it("analisa a unidade escolhida e mostra a árvore, maiores primeiro", async () => {
    const user = userEvent.setup();
    const { handlers } = mockDiskUsageBackend();
    renderRoute(paths.system.diskUsage);

    expect(await screen.findByText("Escolha uma unidade para analisar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analisar a unidade C:" }));
    expect(handlers.scan_disk_usage).toHaveBeenCalledWith({ mountPoint: "C:" });

    const tree = await screen.findByRole("tree", { name: "Pastas de C:\\" });
    const users = await within(tree).findByRole("treeitem", { name: /^Users: 80 GB/ });
    expect(users).toHaveAttribute("aria-expanded", "false");
    expect(within(tree).getByRole("treeitem", { name: /^C:\\: 118 GB/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const names = within(tree)
      .getAllByRole("treeitem")
      .map((item) => item.getAttribute("aria-label")?.split(":")[0]);
    expect(names).toEqual([
      "C",
      "Users",
      "Windows",
      "pagefile.sys",
      "System Volume Information",
      "3 itens menores",
    ]);
    expect(within(tree).getByText("Sem acesso")).toBeInTheDocument();
    // Parte da pasta de cima: 80 de 118 GB.
    expect(users).toHaveAccessibleName(/\(68% da pasta\)/);

    // Resumo: o que está nas pastas, o não identificado e o livre.
    expect(screen.getByText("Nas pastas")).toBeInTheDocument();
    expect(
      screen.getByText(/12 GB em uso na unidade não aparecem em nenhuma pasta/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 atalhos de pasta \(links e junções\) não foram seguidos/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analisar de novo a unidade C:" })).toBeEnabled();
  });

  it("abre as pastas pelo teclado e mostra o caminho do item selecionado", async () => {
    const user = userEvent.setup();
    const { handlers } = mockDiskUsageBackend({ latest: SAMPLE_DISK_SCAN });
    renderRoute(paths.system.diskUsage);

    const tree = await screen.findByRole("tree");
    const users = await within(tree).findByRole("treeitem", { name: /^Users:/ });
    await user.click(users);
    expect(screen.getByText("C:\\Users")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    const bruno = await within(tree).findByRole("treeitem", { name: /^bruno:/ });
    expect(users).toHaveAttribute("aria-expanded", "true");
    expect(handlers.list_disk_usage_children).toHaveBeenCalledWith({
      scanId: SAMPLE_DISK_SCAN.id,
      folderId: 1,
      limit: 200,
    });

    await user.keyboard("{ArrowDown}");
    expect(bruno).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await within(tree).findByRole("treeitem", { name: /^video\.mp4:/ })).toHaveAttribute(
      "aria-level",
      "4",
    );
    expect(screen.getByText("C:\\Users\\bruno")).toBeInTheDocument();

    // ← volta para a pasta de cima; de novo, fecha.
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{ArrowLeft}");
    expect(users).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(users).toHaveAttribute("aria-expanded", "false");
    expect(within(tree).queryByRole("treeitem", { name: /^bruno:/ })).not.toBeInTheDocument();
  });

  it("lista os maiores arquivos da unidade", async () => {
    const user = userEvent.setup();
    mockDiskUsageBackend({ latest: SAMPLE_DISK_SCAN });
    renderRoute(paths.system.diskUsage);

    await user.click(await screen.findByRole("tab", { name: "Maiores arquivos" }));
    const table = screen.getByRole("table", { name: "Maiores arquivos" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("video.mp4")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("C:\\Users\\bruno")).toBeInTheDocument();
    // Em disco (o tamanho, na coluna seguinte, só aparece com espaço).
    expect(within(rows[0] as HTMLElement).getAllByRole("cell")[1]).toHaveTextContent("12 GB");
    expect(
      within(rows[1] as HTMLElement).getByRole("button", {
        name: "Copiar o caminho C:\\pagefile.sys",
      }),
    ).toBeInTheDocument();
  });

  it("mostra o andamento e, cancelada, volta para a análise anterior", async () => {
    const user = userEvent.setup();
    let finish: (scan: DiskUsageScan | null) => void = () => undefined;
    const { handlers } = mockDiskUsageBackend({
      latest: SAMPLE_DISK_SCAN,
      progress: {
        mountPoint: "D:",
        files: 12_345,
        folders: 300,
        allocatedBytes: 150 * 1024 ** 3,
        currentFolder: "D:\\Fotos\\2026",
        cancelRequested: false,
      },
      scan: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    renderRoute(paths.system.diskUsage);

    await user.click(await screen.findByRole("button", { name: "Analisar a unidade D:" }));
    expect(await screen.findByText("Analisando D:…")).toBeInTheDocument();
    expect(
      await screen.findByText("12.345 arquivos · 150 GB de 300 GB em uso"),
    ).toBeInTheDocument();
    expect(screen.getByText("D:\\Fotos\\2026")).toBeInTheDocument();
    // Enquanto roda, nenhuma outra análise começa.
    expect(screen.getByRole("button", { name: "Analisar de novo a unidade C:" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancelar análise" }));
    expect(handlers.cancel_disk_usage).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Cancelando…")).toBeInTheDocument();

    finish(null);
    expect(await screen.findByRole("tree", { name: "Pastas de C:\\" })).toBeInTheDocument();
    expect(screen.queryByText("Cancelando…")).not.toBeInTheDocument();
  });

  it("acompanha a análise que já rodava ao abrir a tela e mostra o resultado", async () => {
    const { handlers, finishRunning } = mockDiskUsageBackend({
      runningOnOpen: true,
      progress: {
        mountPoint: "C:",
        files: 500,
        folders: 20,
        allocatedBytes: 1024 ** 3,
        currentFolder: "C:\\Users",
        cancelRequested: false,
      },
    });
    renderRoute(paths.system.diskUsage);

    expect(await screen.findByText("Analisando C:…")).toBeInTheDocument();
    finishRunning(SAMPLE_DISK_SCAN);
    expect(await screen.findByRole("tree", { name: "Pastas de C:\\" })).toBeInTheDocument();
    expect(handlers.scan_disk_usage).not.toHaveBeenCalled();
  });

  it("vindo do card Armazenamento, analisa a unidade do link", async () => {
    const { handlers } = mockDiskUsageBackend();
    const { router } = renderRoute(diskUsageHref("C:"));

    await waitFor(() => {
      expect(handlers.scan_disk_usage).toHaveBeenCalledWith({ mountPoint: "C:" });
    });
    expect(await screen.findByRole("tree")).toBeInTheDocument();
    expect(router.state.location.search).toBe("");
  });

  it("não repete a análise da unidade que já está na tela", async () => {
    const { handlers } = mockDiskUsageBackend({ latest: SAMPLE_DISK_SCAN });
    renderRoute(diskUsageHref("C:"));

    expect(await screen.findByRole("tree")).toBeInTheDocument();
    expect(handlers.scan_disk_usage).not.toHaveBeenCalled();
  });

  it("mostra o erro e mantém a análise anterior", async () => {
    const user = userEvent.setup();
    mockDiskUsageBackend({
      latest: SAMPLE_DISK_SCAN,
      scan: () => {
        fail("validation", "Unidade não encontrada. Confira se ela ainda está conectada.");
      },
    });
    renderRoute(paths.system.diskUsage);

    await user.click(await screen.findByRole("button", { name: "Analisar a unidade D:" }));
    expect(await screen.findByText("A análise não foi concluída")).toBeInTheDocument();
    expect(screen.getByText(/Unidade não encontrada/)).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Pastas de C:\\" })).toBeInTheDocument();
  });
});
