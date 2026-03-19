import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import { loadJson, saveJson, getFoodiePath } from "../utils/storage";

const TEST_FILE = "test-storage-temp.json";

afterEach(() => {
  const filePath = getFoodiePath(TEST_FILE);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

describe("storage", () => {
  it("round-trips JSON data", () => {
    const data = { key: "value", nested: { a: 1 } };
    saveJson(TEST_FILE, data);
    const loaded = loadJson(TEST_FILE);
    expect(loaded).toEqual(data);
  });

  it("returns null for non-existent files", () => {
    expect(loadJson("does-not-exist-12345.json")).toBeNull();
  });

  it("handles arrays", () => {
    const data = [1, 2, 3, "a", "b"];
    saveJson(TEST_FILE, data);
    expect(loadJson(TEST_FILE)).toEqual(data);
  });
});
