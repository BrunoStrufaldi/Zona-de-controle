import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePollingResource } from "@/hooks/use-polling-resource";

describe("usePollingResource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("relê no intervalo sem voltar para carregando", async () => {
    let value = 0;
    const load = vi.fn(() => Promise.resolve(++value));
    const { result } = renderHook(() => usePollingResource(load, { intervalMs: 1_000 }));

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toMatchObject({ status: "success", data: 1 });

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(result.current).toMatchObject({ status: "success", data: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("não lê enquanto está pausado e retoma na hora", async () => {
    const load = vi.fn(() => Promise.resolve("ok"));
    const { rerender } = renderHook(
      ({ paused }) => usePollingResource(load, { intervalMs: 1_000, paused }),
      { initialProps: { paused: false } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(load).toHaveBeenCalledTimes(1);

    rerender({ paused: true });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(load).toHaveBeenCalledTimes(1);

    rerender({ paused: false });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("para de ler após um erro até reload()", async () => {
    const load = vi.fn(() => Promise.reject(new Error("falhou")));
    const { result } = renderHook(() => usePollingResource(load, { intervalMs: 1_000 }));

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status).toBe("error");
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(load).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.reload();
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("nunca sobrepõe leituras lentas", async () => {
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve("ok");
          }, 3_000);
        }),
    );
    renderHook(() => usePollingResource(load, { intervalMs: 1_000 }));

    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(load).toHaveBeenCalledTimes(1);
    // Terminou em 3 s; a próxima começa 1 s depois.
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
