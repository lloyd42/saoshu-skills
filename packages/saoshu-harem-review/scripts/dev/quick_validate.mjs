#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function validateName(name) {
  return /^[a-z0-9-]{1,64}$/.test(name);
}

function extractFrontmatter(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const yaml = normalized.slice(4, end);
  return yaml;
}

function parseSimpleYaml(yaml) {
  const out = {};
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function main() {
  const skillPath = path.resolve(process.argv[2] || ".");
  const skillFile = path.join(skillPath, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    fail(`Missing SKILL.md at ${skillFile}`);
    return;
  }

  const text = fs.readFileSync(skillFile, "utf8");
  const front = extractFrontmatter(text);
  if (!front) {
    fail("SKILL.md frontmatter missing or malformed (expected --- blocks)");
    return;
  }

  const meta = parseSimpleYaml(front);
  if (!meta.name) fail("frontmatter missing name");
  else if (!validateName(meta.name)) fail("name must match ^[a-z0-9-]{1,64}$");
  else ok(`name: ${meta.name}`);

  if (!meta.description) fail("frontmatter missing description");
  else ok("description present");

  if (meta.name && path.basename(skillPath) !== meta.name) {
    fail(`folder name (${path.basename(skillPath)}) must equal frontmatter name (${meta.name})`);
  } else if (meta.name) {
    ok("folder name matches skill name");
  }

  const agentYaml = path.join(skillPath, "agents", "openai.yaml");
  if (fs.existsSync(agentYaml)) {
    ok("agents/openai.yaml present");
  } else {
    console.log("WARN: agents/openai.yaml missing (recommended)");
  }

  const refs = path.join(skillPath, "references");
  if (fs.existsSync(refs)) ok("references directory present");

  if (process.exitCode && process.exitCode !== 0) {
    console.error("Validation finished with errors.");
  } else {
    console.log("Validation passed.");
  }
}

main();
