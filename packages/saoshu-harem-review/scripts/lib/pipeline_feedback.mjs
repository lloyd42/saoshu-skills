import { ScriptIoError, ScriptUsageError } from "./exit_codes.mjs";

export function pipelineUsage(message, hint = "") {
  throw new ScriptUsageError(message, hint);
}

export function pipelineIo(message, hint = "") {
  throw new ScriptIoError(message, hint);
}

export function formatPipelineError(error) {
  return {
    message: `错误：${error?.message || String(error)}`,
    hint: error?.hint ? `提示：${error.hint}` : "",
  };
}
