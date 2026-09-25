import { describe, expect, it, vi } from "vitest";

import { getDisplayName, SETTING_KEYS, setDisplayName } from "@/services/settings-service";
import { ServiceError } from "@/services/tauri/errors";
import { mockDesktopRuntime } from "@/test/tauri";

describe("serviços (API do Tauri simulada)", () => {
  it("lê configurações pelo command get_setting", async () => {
    const getSetting = vi.fn(() => ({
      key: SETTING_KEYS.displayName,
      value: "Ana",
      updatedAt: "2026-09-25T12:00:00Z",
    }));
    mockDesktopRuntime({ get_setting: getSetting });

    await expect(getDisplayName()).resolves.toBe("Ana");
    expect(getSetting).toHaveBeenCalledWith({ key: SETTING_KEYS.displayName });
  });

  it("normaliza o nome antes de salvar", async () => {
    const setSetting = vi.fn((args: { key: string; value: unknown }) => ({
      key: args.key,
      value: args.value as string,
      updatedAt: "2026-09-25T12:00:00Z",
    }));
    mockDesktopRuntime({ set_setting: setSetting });

    await expect(setDisplayName("  Bruno  ")).resolves.toBe("Bruno");
    expect(setSetting).toHaveBeenCalledWith({ key: SETTING_KEYS.displayName, value: "Bruno" });
  });

  it("converte erros do backend em ServiceError", async () => {
    mockDesktopRuntime({
      set_setting: () => {
        // O Tauri rejeita com o AppError serializado (objeto puro), não com um Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { kind: "validation", message: "chave inválida" };
      },
    });

    const error: unknown = await setDisplayName("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toMatchObject({ kind: "validation", message: "chave inválida" });
  });

  it("falha com desktop-only fora do app desktop", async () => {
    await expect(getDisplayName()).rejects.toMatchObject({ kind: "desktop-only" });
  });
});
