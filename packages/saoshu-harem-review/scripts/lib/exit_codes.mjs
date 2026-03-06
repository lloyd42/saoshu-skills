export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_RUNTIME = 1;
export const EXIT_IO = 3;

export class ScriptUsageError extends Error {
  constructor(message, hint = "") {
    super(message);
    this.name = "ScriptUsageError";
    this.hint = hint;
    this.exitCode = EXIT_USAGE;
  }
}

export class ScriptIoError extends Error {
  constructor(message, hint = "") {
    super(message);
    this.name = "ScriptIoError";
    this.hint = hint;
    this.exitCode = EXIT_IO;
  }
}

export function getExitCode(error) {
  if (error && Number.isInteger(error.exitCode)) return error.exitCode;
  return EXIT_RUNTIME;
}
