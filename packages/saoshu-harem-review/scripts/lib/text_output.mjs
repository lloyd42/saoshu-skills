import fs from "node:fs";
import path from "node:path";

function toUtf8Buffer(content) {
  if (Buffer.isBuffer(content)) return content;
  return Buffer.from(String(content ?? ""), "utf8");
}

export function ensureParentDir(targetPath) {
  const absolutePath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export function writeUtf8File(targetPath, content) {
  const absolutePath = ensureParentDir(targetPath);
  fs.writeFileSync(absolutePath, toUtf8Buffer(content));
  return absolutePath;
}

export function appendUtf8File(targetPath, content) {
  const absolutePath = ensureParentDir(targetPath);
  fs.appendFileSync(absolutePath, toUtf8Buffer(content));
  return absolutePath;
}

export function writeUtf8Json(targetPath, payload, options = {}) {
  const indent = Number.isInteger(options.indent) ? options.indent : 2;
  const newline = Boolean(options.newline);
  const suffix = newline ? "\n" : "";
  return writeUtf8File(targetPath, `${JSON.stringify(payload, null, indent)}${suffix}`);
}

export function appendUtf8Jsonl(targetPath, payload) {
  return appendUtf8File(targetPath, `${JSON.stringify(payload)}\n`);
}
export function writeUtf8Jsonl(targetPath, rows) {
  const items = Array.isArray(rows) ? rows : [];
  return writeUtf8File(targetPath, `${items.map((row) => JSON.stringify(row)).join("\n")}\n`);
}