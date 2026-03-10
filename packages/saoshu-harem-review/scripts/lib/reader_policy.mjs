import fs from "node:fs";
import { readJsonFile } from "./json_input.mjs";

function text(value) {
  return String(value || "").trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item)).filter(Boolean))];
}

export function normalizeReaderPolicy(input, options = {}) {
  const policy = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const hasExplicitInput = Object.keys(policy).length > 0;
  const coverageMode = text(options.coverageMode);
  const preset = text(policy.preset) || "community-default";
  const defaultLabel = preset === "community-default" ? "默认社区 preset" : preset;
  const label = text(policy.label) || defaultLabel;
  const source = text(policy.source) || (hasExplicitInput ? "manifest" : "system-default");
  const hardBlocks = normalizeList(policy.hard_blocks);
  const softRisks = normalizeList(policy.soft_risks);
  const relationConstraints = normalizeList(policy.relation_constraints);
  const scopeRules = normalizeList(policy.scope_rules);
  const notes = normalizeList(policy.notes);
  const evidenceThreshold = text(policy.evidence_threshold) || "balanced";
  const defaultCoveragePreference = coverageMode === "sampled" ? "balanced" : "high-coverage";
  const coveragePreference = text(policy.coverage_preference) || defaultCoveragePreference;
  const customized = preset !== "community-default"
    || hardBlocks.length > 0
    || softRisks.length > 0
    || relationConstraints.length > 0
    || scopeRules.length > 0
    || evidenceThreshold !== "balanced"
    || coveragePreference !== defaultCoveragePreference;
  const summary = text(policy.summary) || (
    customized
      ? `当前按“${label}”视角解释证据。`
      : "当前按默认社区 preset 解释证据。"
  );

  return {
    preset,
    label,
    source,
    customized,
    summary,
    hard_blocks: hardBlocks,
    soft_risks: softRisks,
    relation_constraints: relationConstraints,
    scope_rules: scopeRules,
    evidence_threshold: evidenceThreshold,
    coverage_preference: coveragePreference,
    notes,
  };
}

export function loadReaderPolicyFromFile(filePath, options = {}) {
  const absolutePath = text(filePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return normalizeReaderPolicy({}, options);
  }
  const payload = readJsonFile(absolutePath);
  const candidate = payload && typeof payload === "object" && !Array.isArray(payload) && payload.reader_policy
    ? payload.reader_policy
    : payload;
  return normalizeReaderPolicy(candidate, options);
}
