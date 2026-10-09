// @vitest-environment jsdom
// R7f coverage gate — useSource polling hook. Exercises every branch:
// idle -> loading -> ready, HTTP failure -> failed, JSON failure -> failed,
// polling only fires when document is visible, reload re-fetches, cleanup
// unmount stops both poll interval and the in-flight load.

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { useSource, type SourceStatus } from "../src/lib/use-source";

// Minimal hook runner: renders nothing, just captures the return value.
function useHook<T>(path: string, intervalMs: number) {
  let last: ReturnType<typeof useSource<T>> | undefined;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  act(() => {
    last = useSource<T>(path, intervalMs);
  });
  return last!;
}

interface Store {
  status: SourceStatus;
  data: unknown;
  error: string | undefined;
  fetchedAt: string | undefined;
  reload: () => void;
}

function renderHook(path: string, intervalMs: number): {
  current: () => Store;
  rerender: () => void;
  unmount: () => void;
} {
  const ref: { v?: Store } = {};
  const Comp = () => {
    const s = useSource(path, intervalMs);
    ref.v = {
      status: s.status,
      data: s.data,
      error: s.error,
      fetchedAt: s.fetchedAt,
      reload: s.reload,
    };
    return null;
  };

  // Mount / unmount via react-dom client into a detached container.
  const React = require("react");
  const ReactDOM = require("react-dom/client");
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);
  let mounted = true;
  function tick() {
    if (mounted) root.render(React.createElement(Comp));
  }
  act(() => tick());
  return {
    current: () => ref.v!,
    rerender: () => act(() => tick()),
    unmount: () => {
      mounted = false;
      act(() => root.unmount());
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  // jsdom keeps document.hidden === false by default; ensure visible.
  Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
});

describe("useSource", () => {
  it("goes idle -> loading -> ready with data and fetchedAt", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ hello: "world" }) } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    const { current, unmount } = renderHook("/api/mock", 0); // interval 0 -> no poll
    expect(current().status).toBe("loading"); // mount triggered useEffect

    // The act() in renderHook already triggered useEffect once.
    // Give the microtask chain time to flush.
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect(current().status).toBe("ready");
    expect(current().data).toEqual({ hello: "world" });
    expect(typeof current().fetchedAt).toBe("string");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("sets status=failed and error on HTTP failure", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: false, status: 503, json: async () => null } as Response)
    );

    const { current, unmount } = renderHook("/api/bad", 0);
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect(current().status).toBe("failed");
    expect(current().error).toBe("HTTP 503");
    expect(current().data).toBeUndefined(); // no data yet
    unmount();
  });

  it("sets status=failed on JSON parse error, never throws", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: async () => {
          throw new Error("Unexpected token");
        },
      } as Response)
    );

    const { current, unmount } = renderHook("/api/bad-json", 0);
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect(current().status).toBe("failed");
    expect(current().error).toBe("Unexpected token");
    unmount();
  });

  it("keeps last-good data when a refresh fails (data not cleared)", async () => {
    const fetchMock = vi
      .fn<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ v: 1 }) } as Response)
      .mockRejectedValueOnce(new Error("network down") as never);
    vi.stubGlobal("fetch", fetchMock);

    const { current, unmount } = renderHook("/api/ok-then-fail", 0);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(current().status).toBe("ready");
    expect(current().data).toEqual({ v: 1 });

    // Force a reload (polling won't fire because interval=0).
    act(() => current().reload());
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect(current().status).toBe("failed");
    expect(current().error).toBe("network down");
    expect(current().data).toEqual({ v: 1 }); // preserved
    unmount();
  });

  it("polling interval re-fetches while document is visible", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ n: 1 }) } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderHook("/api/poll", 100);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    const first = fetchMock.mock.calls.length;

    // Advance past one interval (visible) -> extra call.
    await act(() => new Promise((r) => setTimeout(r, 120)));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(first);

    unmount();
  });

  it("polling pauses when document.hidden is true", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ n: 1 }) } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderHook("/api/poll", 100);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    const afterMount = fetchMock.mock.calls.length;

    Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
    await act(() => new Promise((r) => setTimeout(r, 150)));
    // No additional fetch while hidden.
    expect(fetchMock.mock.calls.length).toBe(afterMount);

    Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
    unmount();
  });

  it("reload() triggers an immediate re-fetch", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    const { current, unmount } = renderHook("/api/reload", 0);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    const countAfterMount = fetchMock.mock.calls.length;

    await act(async () => current().reload());
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(countAfterMount + 1);

    unmount();
  });

  it("unmount prevents state updates from a late in-flight fetch", async () => {
    let resolveFetch: (v: Response) => void;
    const pending = new Promise<Response>((res) => {
      resolveFetch = res;
    });
    vi.stubGlobal("fetch", () => pending as Promise<Response>);

    const { current, unmount } = renderHook("/api/unmount", 0);
    expect(current().status).toBe("loading");

    // Unmount while the fetch is still pending — live.current flips to false.
    unmount();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolveFetch!({ ok: true, json: async () => ({ late: true }) } as Response);
    // If the guard didn't work, react would throw "can't perform setState on unmounted".
    await act(() => new Promise((r) => setTimeout(r, 10)));
  });

  it("unmount during a FAILED fetch also skips setState (catch guard)", async () => {
    let rejectFetch: (e: Error) => void;
    const pending = new Promise<Response>((_, rej) => {
      rejectFetch = rej;
    });
    vi.stubGlobal("fetch", () => pending as Promise<Response>);

    const { current, unmount } = renderHook("/api/unmount-fail", 0);
    expect(current().status).toBe("loading");

    // Unmount first, then let the request fail: the catch arm must bail on
    // live.current === false without calling setError/setStatus.
    unmount();
    rejectFetch!(new Error("network down"));

    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(current().status).toBe("loading");
    expect(current().error).toBeUndefined();
  });
});
