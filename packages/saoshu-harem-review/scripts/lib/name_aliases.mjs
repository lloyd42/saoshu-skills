import fs from "node:fs";
import path from "node:path";

function safeText(value) {
  return String(value || "").trim();
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => safeText(item)).filter(Boolean))];
}

export function normalizeAliasName(value) {
  return safeText(value).replace(/\s+/g, "");
}

export function normalizeAliasRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      canonical_name: normalizeAliasName(row?.canonical_name || row?.canonicalName || row?.name || ""),
      aliases: uniqueStrings(row?.aliases).map((item) => normalizeAliasName(item)),
      gender: safeText(row?.gender || ""),
      role_hint: safeText(row?.role_hint || row?.roleHint || ""),
      relation_label: safeText(row?.relation_label || row?.relationLabel || ""),
      note: safeText(row?.note || ""),
    }))
    .filter((row) => row.canonical_name)
    .map((row) => ({
      ...row,
      aliases: uniqueStrings([row.canonical_name, ...row.aliases]).filter((item) => item !== row.canonical_name ? item.length > 0 : true),
    }));
}

export function buildAliasContext(rows) {
  const normalizedRows = normalizeAliasRows(rows);
  const aliasToCanonical = new Map();
  const canonicalRows = new Map();
  for (const row of normalizedRows) {
    canonicalRows.set(row.canonical_name, row);
    aliasToCanonical.set(row.canonical_name, row.canonical_name);
    for (const alias of row.aliases) aliasToCanonical.set(alias, row.canonical_name);
  }
  return { rows: normalizedRows, aliasToCanonical, canonicalRows };
}

export function resolveAliasName(name, aliasContext = null) {
  const normalized = normalizeAliasName(name);
  if (!normalized) return "";
  if (!aliasContext?.aliasToCanonical) return normalized;
  return aliasContext.aliasToCanonical.get(normalized) || normalized;
}

export function createAliasCandidate(rawName, canonicalName) {
  let raw = normalizeAliasName(rawName);
  const canonical = normalizeAliasName(canonicalName);
  const leadNoiseChars = new Set(["说", "都", "众", "称", "叫", "唤", "把", "将", "令"]);
  while (raw.length > 2 && leadNoiseChars.has(raw[0])) raw = raw.slice(1);
  if (!raw || !canonical || raw === canonical) return "";
  if (raw.length <= 1) return "";
  return raw;
}

export function normalizeTopCharacters(rows, aliasContext = null) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const rawName = safeText(row?.name || "");
    if (!rawName) continue;
    const canonicalName = resolveAliasName(rawName, aliasContext);
    if (!grouped.has(canonicalName)) grouped.set(canonicalName, { name: canonicalName, count: 0, aliases: new Set() });
    const current = grouped.get(canonicalName);
    current.count += Number(row?.count || 0);
    const alias = createAliasCandidate(rawName, canonicalName);
    if (alias) current.aliases.add(alias);
  }
  return [...grouped.values()]
    .map((row) => ({ name: row.name, count: row.count, aliases: [...row.aliases] }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh"));
}

export function enrichTopCharactersWithAliasHits(rows, text, aliasContext = null) {
  const grouped = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.name, { ...row, aliases: new Set(Array.isArray(row.aliases) ? row.aliases : []) }]));
  const source = String(text || "");
  for (const row of aliasContext?.rows || []) {
    let extraCount = 0;
    for (const alias of row.aliases || []) {
      if (!alias || alias === row.canonical_name) continue;
      const count = source.split(alias).length - 1;
      if (count <= 0) continue;
      extraCount += count;
      if (!grouped.has(row.canonical_name)) grouped.set(row.canonical_name, { name: row.canonical_name, count: 0, aliases: new Set() });
      grouped.get(row.canonical_name).aliases.add(alias);
    }
    if (extraCount > 0) {
      if (!grouped.has(row.canonical_name)) grouped.set(row.canonical_name, { name: row.canonical_name, count: 0, aliases: new Set() });
      grouped.get(row.canonical_name).count += extraCount;
    }
  }
  return [...grouped.values()]
    .map((row) => ({ name: row.name, count: row.count, aliases: [...row.aliases] }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh"));
}

export function loadAliasRows(aliasMapPath) {
  if (!aliasMapPath) return [];
  const absolutePath = path.resolve(aliasMapPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`alias map not found: ${absolutePath}`);
  const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  if (Array.isArray(payload)) return normalizeAliasRows(payload);
  if (Array.isArray(payload.aliases)) return normalizeAliasRows(payload.aliases);
  return [];
}
