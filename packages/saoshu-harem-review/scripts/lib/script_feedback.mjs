import { ScriptIoError, ScriptUsageError } from "./exit_codes.mjs";

export function scriptUsage(message, hint = "") {
  throw new ScriptUsageError(message, hint);
}

export function scriptIo(message, hint = "") {
  throw new ScriptIoError(message, hint);
}

export function formatScriptError(error) {
  return {
    message: `错误：${error?.message || String(error)}`,
    hint: error?.hint ? `提示：${error.hint}` : "",
  };
}
