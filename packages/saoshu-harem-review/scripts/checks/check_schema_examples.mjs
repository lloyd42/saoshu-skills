#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const checks = [
  {
    schema: "packages/saoshu-harem-review/references/schemas/novel_manifest.schema.json",
    example: "examples/minimal/manifest.json",
    label: "最小 manifest 样例",
  },
  {
    schema: "packages/saoshu-harem-review/references/schemas/final_report.schema.json",
    example: "examples/minimal/final-report.json",
    label: "最小 final report 样例",
  },
];

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function typeOfValue(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function validate(schema, value, pointer, errors) {
  if (!schema || typeof schema !== "object") return;

  if (Array.isArray(schema.required) && typeOfValue(value) === "object") {
    for (const key of schema.required) {
      if (!(key in value)) {
        errors.push(`${pointer} 缺少必填字段 ${key}`);
      }
    }
  }

  if (schema.type) {
    const actualType = typeOfValue(value);
    if (schema.type === "integer") {
      if (!(typeof value === "number" && Number.isInteger(value))) {
        errors.push(`${pointer} 类型应为 integer，实际为 ${actualType}`);
        return;
      }
    } else if (schema.type !== actualType) {
      errors.push(`${pointer} 类型应为 ${schema.type}，实际为 ${actualType}`);
      return;
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pointer} 枚举值非法：${JSON.stringify(value)}`);
  }

  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    errors.push(`${pointer} 不能小于 ${schema.minimum}`);
  }

  if (schema.type === "object" && schema.properties && typeOfValue(value) === "object") {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in value) {
        validate(childSchema, value[key], `${pointer}.${key}`, errors);
      }
    }
  }

  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      validate(schema.items, item, `${pointer}[${index}]`, errors);
    });
  }
}

for (const check of checks) {
  const schema = readJson(check.schema);
  const example = readJson(check.example);
  const errors = [];
  validate(schema, example, "$", errors);
  if (errors.length) {
    fail(`${check.label} 校验失败`);
    for (const err of errors) {
      fail(`  ${err}`);
    }
  } else {
    ok(`${check.label} 校验通过`);
  }
}

if (!hasFailure) {
  console.log("Schema 样例校验通过。");
} else {
  process.exitCode = 1;
}
