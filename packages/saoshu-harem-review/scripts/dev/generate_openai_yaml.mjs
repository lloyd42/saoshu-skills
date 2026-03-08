#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File } from "../lib/text_output.mjs";

function parseArgs(argv) {
  const args = { skillPath: null, interfaces: [] };
  if (argv.length < 3) {
    throw new Error("Usage: node generate_openai_yaml.mjs <skill-path> --interface key=value [--interface key=value ...]");
  }
  args.skillPath = path.resolve(argv[2]);
  for (let i = 3; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--interface") {
      const pair = argv[++i];
      if (!pair || !pair.includes("=")) {
        throw new Error("--interface expects key=value");
      }
      args.interfaces.push(pair);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function parseInterfacePairs(pairs) {
  const out = {};
  for (const p of pairs) {
    const idx = p.indexOf("=");
    const key = p.slice(0, idx).trim();
    const value = p.slice(idx + 1).trim();
    if (!key || !value) throw new Error(`Invalid interface pair: ${p}`);
    out[key] = value;
  }
  return out;
}

function q(value) {
  return JSON.stringify(String(value));
}

function buildYaml(data) {
  const lines = ["interface:"];
  for (const key of Object.keys(data)) {
    lines.push(`  ${key}: ${q(data[key])}`);
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const { skillPath, interfaces } = parseArgs(process.argv);
  const iface = parseInterfacePairs(interfaces);

  const required = ["display_name", "short_description", "default_prompt"];
  for (const key of required) {
    if (!iface[key]) {
      throw new Error(`Missing required interface field: ${key}`);
    }
  }

  const outDir = path.join(skillPath, "agents");
  const outPath = path.join(outDir, "openai.yaml");
  fs.mkdirSync(outDir, { recursive: true });
  writeUtf8File(outPath, buildYaml(iface));
  console.log(`Generated: ${outPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
