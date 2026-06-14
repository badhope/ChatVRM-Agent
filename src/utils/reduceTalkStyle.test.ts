import { describe, it, expect } from "vitest";
import { reduceTalkStyle } from "@/utils/reduceTalkStyle";

describe("reduceTalkStyle", () => {
  it("passes through supported Koeiromap Free v1 styles", () => {
    expect(reduceTalkStyle("talk")).toBe("talk");
    expect(reduceTalkStyle("happy")).toBe("happy");
    expect(reduceTalkStyle("sad")).toBe("sad");
  });

  it("falls back to 'talk' for unsupported styles", () => {
    expect(reduceTalkStyle("angry")).toBe("talk");
    expect(reduceTalkStyle("fear")).toBe("talk");
    expect(reduceTalkStyle("surprised")).toBe("talk");
    expect(reduceTalkStyle("")).toBe("talk");
    expect(reduceTalkStyle("garbage")).toBe("talk");
  });
});
