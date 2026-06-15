import { describe, it, expect } from "vitest";
import { parseSSE } from "../openaiCompatible";

/** Build a ReadableStream from an array of strings (each yielded as one chunk). */
function makeStream(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(encoder.encode(p));
      controller.close();
    },
  });
}

describe("parseSSE", () => {
  it("decodes a single complete event", async () => {
    const stream = makeStream(["data: hello\n\n"]);
    const out: { data: string }[] = [];
    await parseSSE(stream, (e) => out.push({ data: e.data }));
    expect(out).toEqual([{ data: "hello" }]);
  });

  it("handles chunk-boundary splits", async () => {
    const stream = makeStream(["data: hel", "lo\n\n"]);
    const out: { data: string }[] = [];
    await parseSSE(stream, (e) => out.push({ data: e.data }));
    expect(out).toEqual([{ data: "hello" }]);
  });

  it("emits a done marker for [DONE]", async () => {
    const stream = makeStream(["data: [DONE]\n\n"]);
    const out: { data: string }[] = [];
    await parseSSE(stream, (e) => out.push({ data: e.data }));
    expect(out).toEqual([{ data: "[DONE]" }]);
  });

  it("concatenates multi-line data fields", async () => {
    const stream = makeStream(["data: line1\ndata: line2\n\n"]);
    const out: { data: string }[] = [];
    await parseSSE(stream, (e) => out.push({ data: e.data }));
    expect(out).toEqual([{ data: "line1\nline2" }]);
  });

  it("ignores comment lines", async () => {
    const stream = makeStream([": this is a comment\ndata: ok\n\n"]);
    const out: { data: string }[] = [];
    await parseSSE(stream, (e) => out.push({ data: e.data }));
    expect(out).toEqual([{ data: "ok" }]);
  });

  it("captures the event name", async () => {
    const stream = makeStream(["event: ping\ndata: hello\n\n"]);
    const out: { event?: string; data: string }[] = [];
    await parseSSE(stream, (e) => out.push({ event: e.event, data: e.data }));
    expect(out).toEqual([{ event: "ping", data: "hello" }]);
  });
});
