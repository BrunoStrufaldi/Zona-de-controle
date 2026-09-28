import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { paths } from "@/app/router/paths";
import { mockDevicesBackend } from "@/test/fake-devices-backend";
import { renderRoute } from "@/test/render";

describe("página de Dispositivos", () => {
  it("lista os dispositivos sem fio com a bateria de cada fonte", async () => {
    mockDevicesBackend();
    renderRoute(paths.system.devices);

    const list = await screen.findByRole("list", { name: "Dispositivos com bateria" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector(".truncate")?.textContent)).toEqual([
      "MCHOSE V9 PRO",
      "Rapoo VT7 Max",
      "Controle Xbox (jogador 1)",
      "Fone Bluetooth",
    ]);
    // Receptor sem leitor do modelo: presente, bateria nunca estimada.
    expect(rows[1]).toHaveTextContent("Não disponível");
    expect(rows[1]).toHaveTextContent("2.4 GHz · receptor USB conectado");
    expect(rows[2]).toHaveTextContent("Média (aprox.)");
    expect(rows[3]).toHaveTextContent("80%");
    // O teclado com fio não entra na lista de bateria.
    expect(within(list).queryByText("Akko Keyboard")).not.toBeInTheDocument();
  });

  it("marca um dispositivo USB como sem fio e ele entra na lista de bateria", async () => {
    const user = userEvent.setup();
    const { handlers } = mockDevicesBackend();
    renderRoute(paths.system.devices);

    const usb = await screen.findByRole("list", { name: "Dispositivos USB conectados" });
    const akko = within(usb).getByText("Akko Keyboard").closest("li") as HTMLElement;
    expect(within(akko).getByText("Com fio")).toBeInTheDocument();
    const rapoo = within(usb).getByText("Rapoo VT7 Max").closest("li") as HTMLElement;
    expect(within(rapoo).getByText("Reconhecido")).toBeInTheDocument();
    expect(within(rapoo).getByText(/informa “Rapoo Gaming Device”/)).toBeInTheDocument();

    await user.click(within(akko).getByRole("button", { name: "Ações de “Akko Keyboard”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Teclado.*sugerido/ }));

    await waitFor(() => {
      expect(handlers.set_device_marking).toHaveBeenCalledWith({
        key: "3151:502d",
        marking: { wireless: true, kind: "keyboard" },
      });
    });
    expect(await screen.findByText("Marcado como sem fio")).toBeInTheDocument();
    const batteries = screen.getByRole("list", { name: "Dispositivos com bateria" });
    expect(await within(batteries).findByText("Akko Keyboard")).toBeInTheDocument();
    expect(within(akko).getByText("Marcado por você")).toBeInTheDocument();
  });

  it("mostra estado vazio sem dispositivos sem fio", async () => {
    mockDevicesBackend({ others: [] });
    renderRoute(paths.system.devices);

    const usb = await screen.findByRole("list", { name: "Dispositivos USB conectados" });
    const user = userEvent.setup();
    for (const name of ["MCHOSE V9 PRO", "Rapoo VT7 Max"]) {
      const row = within(usb).getByText(name).closest("li") as HTMLElement;
      await user.click(within(row).getByRole("button", { name: `Ações de “${name}”` }));
      await user.click(await screen.findByRole("menuitem", { name: /Não é sem fio/ }));
      await screen.findByText(`“${name}” saiu da lista de bateria.`);
    }
    expect(await screen.findByText("Nenhum dispositivo sem fio encontrado")).toBeInTheDocument();
  });
});
