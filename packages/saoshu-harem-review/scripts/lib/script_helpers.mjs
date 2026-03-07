import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function shellQuote(value) {
  const text = String(value ?? "");
  if (!/[\s"'`]/.test(text)) return text;
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function formatCommand(command, args = []) {
  return [command, ...args].map((item) => shellQuote(item)).join(" ");
}

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${formatCommand(command, args)}`);
  }
}

export function runNodeScript(scriptPath, args = [], options = {}) {
  return runCommand(process.execPath, [path.resolve(scriptPath), ...args.map((item) => String(item))], options);
}

export function runShellCommand(command, options = {}) {
  if (process.platform === "win32") return runCommand(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", String(command)], options);
  return runCommand(process.env.SHELL || "/bin/sh", ["-lc", String(command)], options);
}

export function getScriptDir(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

export function findFirstExisting(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    if (fs.existsSync(path.resolve(candidate))) return path.resolve(candidate);
  }
  return "";
}

export function getInstalledSkillPath(name, importMetaUrl) {
  const scriptDir = getScriptDir(importMetaUrl);
  const home = os.homedir();
  const codexHome = process.env.CODEX_HOME || "";
  const custom = process.env.SAOSHU_SKILLS_DIR || "";
  const candidates = [
    custom ? path.join(custom, name) : "",
    codexHome ? path.join(codexHome, "skills", name) : "",
    home ? path.join(home, ".codex", "skills", name) : "",
    path.resolve(scriptDir, "..", "..", name),
  ];
  return findFirstExisting(candidates) || candidates[candidates.length - 1];
}

export function valueOf(rest, key, fallback = "") {
  const index = rest.indexOf(key);
  if (index === -1 || index + 1 >= rest.length) return fallback;
  return rest[index + 1];
}

export function hasFlag(rest, key) {
  return rest.includes(key);
}

export function pushArg(args, key, value) {
  if (value === "" || value === undefined || value === null) return args;
  args.push(key, String(value));
  return args;
}

export function pushFlag(args, enabled, flag) {
  if (!enabled) return args;
  args.push(flag);
  return args;
}
