/**
 * Taste Profile System — persistent user preferences for spice, sweetness,
 * sourness, umami, and saltiness. Recipes auto-calibrate to your palate.
 */

import { loadJson, saveJson } from "../utils/storage";

export interface TasteProfile {
  spice: number;      // 1-10
  sweetness: number;  // 1-10
  sourness: number;   // 1-10
  umami: number;      // 1-10
  saltiness: number;  // 1-10
}

const PROFILE_FILE = "profile.json";

const DEFAULT_PROFILE: TasteProfile = {
  spice: 5,
  sweetness: 5,
  sourness: 5,
  umami: 5,
  saltiness: 5,
};

function clamp(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

export function loadProfile(): TasteProfile | null {
  return loadJson<TasteProfile>(PROFILE_FILE);
}

export function saveProfile(profile: TasteProfile): void {
  const clamped: TasteProfile = {
    spice: clamp(profile.spice),
    sweetness: clamp(profile.sweetness),
    sourness: clamp(profile.sourness),
    umami: clamp(profile.umami),
    saltiness: clamp(profile.saltiness),
  };
  saveJson(PROFILE_FILE, clamped);
}

export function resetProfile(): void {
  saveProfile(DEFAULT_PROFILE);
}

export function showProfile(profile: TasteProfile): void {
  const bar = (val: number) => {
    const filled = "█".repeat(val);
    const empty = "░".repeat(10 - val);
    return `${filled}${empty} ${val}/10`;
  };

  console.log(`\n  🎨 Your Taste Profile:\n`);
  console.log(`    🌶️  Spice:     ${bar(profile.spice)}`);
  console.log(`    🍯 Sweetness: ${bar(profile.sweetness)}`);
  console.log(`    🍋 Sourness:  ${bar(profile.sourness)}`);
  console.log(`    🍄 Umami:     ${bar(profile.umami)}`);
  console.log(`    🧂 Saltiness: ${bar(profile.saltiness)}`);
  console.log();
}

/** Merge CLI per-recipe overrides onto the saved profile */
export function mergeOverrides(
  profile: TasteProfile,
  overrides: Partial<TasteProfile>
): TasteProfile {
  return {
    spice: overrides.spice != null ? clamp(overrides.spice) : profile.spice,
    sweetness: overrides.sweetness != null ? clamp(overrides.sweetness) : profile.sweetness,
    sourness: overrides.sourness != null ? clamp(overrides.sourness) : profile.sourness,
    umami: overrides.umami != null ? clamp(overrides.umami) : profile.umami,
    saltiness: overrides.saltiness != null ? clamp(overrides.saltiness) : profile.saltiness,
  };
}

/** Parse taste flags from CLI args: --spice 8 --sweet 3 etc. */
export function parseTasteFlags(args: string[]): Partial<TasteProfile> {
  const overrides: Partial<TasteProfile> = {};
  const flagMap: Record<string, keyof TasteProfile> = {
    "--spice": "spice",
    "--sweet": "sweetness",
    "--sweetness": "sweetness",
    "--sour": "sourness",
    "--sourness": "sourness",
    "--umami": "umami",
    "--salt": "saltiness",
    "--saltiness": "saltiness",
  };

  for (const [flag, key] of Object.entries(flagMap)) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      const val = parseInt(args[idx + 1], 10);
      if (!isNaN(val)) {
        overrides[key] = val;
      }
    }
  }

  return overrides;
}
