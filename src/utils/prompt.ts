/**
 * Reusable readline helpers for interactive CLI features.
 *
 * Handles edge cases: piped input (stdin closes early),
 * repeated close calls, and EOF signals.
 */

import * as readline from "readline";

let rl: readline.Interface | null = null;
let closed = false;

function getReadline(): readline.Interface {
  if (!rl || closed) {
    closed = false;
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.on("close", () => {
      closed = true;
      rl = null;
    });
  }
  return rl;
}

export function closeReadline(): void {
  if (rl) {
    rl.close();
    rl = null;
    closed = true;
  }
}

/** Returns null on EOF / closed readline (caller should treat as exit). */
export function askUser(prompt: string): Promise<string | null> {
  if (closed) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const iface = getReadline();
      // Handle close mid-question (piped input ending)
      const onClose = () => resolve(null);
      iface.once("close", onClose);

      iface.question(prompt, (answer) => {
        iface.removeListener("close", onClose);
        resolve(answer.trim());
      });
    } catch {
      resolve(null);
    }
  });
}

export async function selectMenu(items: string[], prompt: string): Promise<number | null> {
  for (let i = 0; i < items.length; i++) {
    console.log(`  ${i + 1}. ${items[i]}`);
  }
  console.log();

  while (true) {
    const answer = await askUser(prompt);
    if (answer === null) return null;
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= items.length) {
      return num - 1;
    }
    console.log(`  Please enter a number between 1 and ${items.length}.`);
  }
}

export async function confirm(prompt: string): Promise<boolean> {
  const answer = await askUser(`${prompt} (y/n): `);
  if (answer === null) return false;
  return answer.toLowerCase().startsWith("y");
}
