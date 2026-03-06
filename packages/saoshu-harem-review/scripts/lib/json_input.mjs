import fs from "node:fs";
import path from "node:path";

export function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

export function parseJsonText(text) {
  return JSON.parse(stripBom(text));
}

export function readJsonFile(filePath) {
  const absolutePath = path.resolve(filePath);
  return parseJsonText(fs.readFileSync(absolutePath, "utf8"));
}
