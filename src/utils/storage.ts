/**
 * Simple JSON file I/O for ~/.foodie/ persistent storage.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const FOODIE_DIR = path.join(os.homedir(), ".foodie");

function ensureDir(): void {
  if (!fs.existsSync(FOODIE_DIR)) {
    fs.mkdirSync(FOODIE_DIR, { recursive: true });
  }
}

export function getFoodiePath(filename: string): string {
  ensureDir();
  return path.join(FOODIE_DIR, filename);
}

export function loadJson<T>(filename: string): T | null {
  const filePath = getFoodiePath(filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveJson(filename: string, data: unknown): void {
  const filePath = getFoodiePath(filename);
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
