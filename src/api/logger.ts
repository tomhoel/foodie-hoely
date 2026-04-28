export interface LogFields {
  event: string;
  [key: string]: unknown;
}

/** Pure: returns the JSON string a logger would write. Does not call console.* */
export function formatLogLine(fields: LogFields): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), ...fields });
}

/** Side-effecting wrapper. Writes one JSON line to stdout. */
export function logEvent(fields: LogFields): void {
  console.log(formatLogLine(fields));
}
