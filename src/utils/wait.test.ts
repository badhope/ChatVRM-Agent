import { describe, it, expect, vi } from "vitest";
import { wait } from "@/utils/wait";

describe("wait", () => {
  it("resolves after approximately the requested delay", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const promise = wait(1000);
    vi.advanceTimersByTime(1000);
    await promise;
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
    vi.useRealTimers();
  });

  it("resolves quickly for zero delay", async () => {
    await wait(0);
    // If we got here without hanging, the promise resolved.
    expect(true).toBe(true);
  });
});
