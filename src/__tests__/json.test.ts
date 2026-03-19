import { describe, it, expect } from "vitest";
import { safeParseJson } from "../utils/json";

describe("safeParseJson", () => {
  it("parses valid JSON", () => {
    const result = safeParseJson<{ name: string }>('{"name": "test"}', "test");
    expect(result).toEqual({ name: "test" });
  });

  it("strips markdown code fences", () => {
    const input = '```json\n{"name": "test"}\n```';
    const result = safeParseJson<{ name: string }>(input, "test");
    expect(result).toEqual({ name: "test" });
  });

  it("extracts JSON from surrounding text", () => {
    const input = 'Here is the result: {"name": "test"} Hope this helps!';
    const result = safeParseJson<{ name: string }>(input, "test");
    expect(result).toEqual({ name: "test" });
  });

  it("extracts JSON arrays from text", () => {
    const input = 'Results: [{"a": 1}, {"a": 2}]';
    const result = safeParseJson<{ a: number }[]>(input, "test");
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("returns null for empty input", () => {
    expect(safeParseJson("", "test")).toBeNull();
    expect(safeParseJson("   ", "test")).toBeNull();
  });

  it("returns null for completely invalid content", () => {
    expect(safeParseJson("hello world", "test")).toBeNull();
  });
});
