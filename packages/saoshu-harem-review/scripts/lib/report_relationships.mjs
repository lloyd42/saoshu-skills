import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./json_input.mjs";

function normalizeRelationshipRow(item) {
  return {
    from: String(item?.from || "").trim(),
    to: String(item?.to || "").trim(),
    type: String(item?.type || item?.label || "关系").trim(),
    weight: Number(item?.weight || 1),
    evidence: String(item?.evidence || "relationship_map").trim(),
    source: String(item?.source || "human_promoted").trim(),
  };
}

export function loadRelationshipRows(filePath) {
  if (!filePath) return [];
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return [];
  try {
    const payload = readJsonFile(absolutePath);
    const rows = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.relationships) ? payload.relationships : []);
    return rows
      .map(normalizeRelationshipRow)
      .filter((item) => item.from && item.to);
  } catch {
    return [];
  }
}

export function mergeRelationshipRows(baseRows, extraRows, limit = 80) {
  const relationMap = new Map();
  for (const row of [...(Array.isArray(baseRows) ? baseRows : []), ...(Array.isArray(extraRows) ? extraRows : [])]) {
    const key = `${row.from}|${row.to}|${row.type}`;
    if (!relationMap.has(key)) relationMap.set(key, { ...row });
    else relationMap.get(key).weight = Number(relationMap.get(key).weight || 0) + Number(row.weight || 0);
  }
  return [...relationMap.values()]
    .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0))
    .slice(0, limit);
}
