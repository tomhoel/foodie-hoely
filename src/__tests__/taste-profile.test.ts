import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  loadProfile,
  saveProfile,
  resetProfile,
  mergeOverrides,
  parseTasteFlags,
  type TasteProfile,
} from "../profile/taste-profile";

const profilePath = path.join(os.homedir(), ".foodie", "profile.json");
let backup: string | null = null;

beforeEach(() => {
  // Back up existing profile
  if (fs.existsSync(profilePath)) {
    backup = fs.readFileSync(profilePath, "utf-8");
  }
});

afterEach(() => {
  // Restore backup
  if (backup) {
    fs.writeFileSync(profilePath, backup, "utf-8");
  } else if (fs.existsSync(profilePath)) {
    fs.unlinkSync(profilePath);
  }
  backup = null;
});

describe("mergeOverrides", () => {
  it("overrides specified values", () => {
    const base: TasteProfile = { spice: 5, sweetness: 5, sourness: 5, umami: 5, saltiness: 5 };
    const result = mergeOverrides(base, { spice: 9, umami: 8 });
    expect(result.spice).toBe(9);
    expect(result.umami).toBe(8);
    expect(result.sweetness).toBe(5); // unchanged
  });

  it("clamps values to 1-10", () => {
    const base: TasteProfile = { spice: 5, sweetness: 5, sourness: 5, umami: 5, saltiness: 5 };
    const result = mergeOverrides(base, { spice: 15, sweetness: -3 });
    expect(result.spice).toBe(10);
    expect(result.sweetness).toBe(1);
  });
});

describe("parseTasteFlags", () => {
  it("parses CLI flags", () => {
    const result = parseTasteFlags(["--spice", "8", "--sweet", "3", "--umami", "9"]);
    expect(result).toEqual({ spice: 8, sweetness: 3, umami: 9 });
  });

  it("ignores unrelated flags", () => {
    const result = parseTasteFlags(["--servings", "4", "--spice", "7"]);
    expect(result).toEqual({ spice: 7 });
  });

  it("returns empty for no taste flags", () => {
    const result = parseTasteFlags(["--servings", "4"]);
    expect(result).toEqual({});
  });

  it("handles alternative flag names", () => {
    const result = parseTasteFlags(["--sourness", "6", "--saltiness", "4"]);
    expect(result).toEqual({ sourness: 6, saltiness: 4 });
  });
});

describe("saveProfile / loadProfile", () => {
  it("round-trips a profile", () => {
    const profile: TasteProfile = { spice: 8, sweetness: 3, sourness: 7, umami: 9, saltiness: 5 };
    saveProfile(profile);
    const loaded = loadProfile();
    expect(loaded).toEqual(profile);
  });

  it("clamps on save", () => {
    saveProfile({ spice: 20, sweetness: -5, sourness: 5, umami: 5, saltiness: 5 });
    const loaded = loadProfile();
    expect(loaded?.spice).toBe(10);
    expect(loaded?.sweetness).toBe(1);
  });
});

describe("resetProfile", () => {
  it("resets to defaults (all 5s)", () => {
    saveProfile({ spice: 10, sweetness: 1, sourness: 10, umami: 1, saltiness: 10 });
    resetProfile();
    const loaded = loadProfile();
    expect(loaded).toEqual({ spice: 5, sweetness: 5, sourness: 5, umami: 5, saltiness: 5 });
  });
});
