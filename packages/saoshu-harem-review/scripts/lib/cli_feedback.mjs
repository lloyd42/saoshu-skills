import { EXIT_USAGE } from "./exit_codes.mjs";

export class CliUsageError extends Error {
  constructor(message, hint = "") {
    super(message);
    this.name = "CliUsageError";
    this.hint = hint;
    this.exitCode = EXIT_USAGE;
  }
}

export function requireArg(value, message, hint = "") {
  if (value) return value;
  throw new CliUsageError(message, hint);
}

export function failUsage(message, hint = "") {
  throw new CliUsageError(message, hint);
}

export function formatCliError(error) {
  const message = error?.message || String(error);
  const hint = error?.hint ? `提示：${error.hint}` : "";
  return { message: `错误：${message}`, hint };
}
