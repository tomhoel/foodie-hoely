/**
 * Simple level-based logger with debug mode.
 *
 * Enable debug output with --verbose flag or DEBUG=1 env var.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isDebug = process.env.DEBUG === "1" || process.argv.includes("--verbose");

function getMinLevel(): LogLevel {
  return isDebug ? "debug" : "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];
}

function formatTime(): string {
  return new Date().toISOString().slice(11, 23);
}

export const logger = {
  debug(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.log(`[${formatTime()}] [DEBUG] [${tag}] ${message}`, ...args);
    }
  },

  info(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.log(`[${tag}] ${message}`, ...args);
    }
  },

  warn(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.warn(`[${tag}] ${message}`, ...args);
    }
  },

  error(tag: string, message: string, ...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(`[${tag}] ${message}`, ...args);
    }
  },

  /** Time a block and log the duration at debug level */
  async time<T>(tag: string, label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const ms = (performance.now() - start).toFixed(0);
    if (shouldLog("debug")) {
      console.log(`[${formatTime()}] [DEBUG] [${tag}] ${label}: ${ms}ms`);
    }
    return result;
  },

  isDebug,
};
