import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function quotePath(value) {
  return `\"${String(value).replaceAll("\\", "/")}\"`;
}

export function runCommand(command) {
  execSync(command, { stdio: "inherit" });
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

export function appendArg(command, key, value) {
  if (value === "" || value === undefined || value === null) return command;
  return `${command} ${key} ${quotePath(value)}`;
}

export function appendRawArg(command, key, value) {
  if (value === "" || value === undefined || value === null) return command;
  return `${command} ${key} ${value}`;
}

export function appendFlag(command, enabled, flag) {
  if (!enabled) return command;
  return `${command} ${flag}`;
}
