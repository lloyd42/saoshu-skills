import path from "node:path";
import { findFirstExisting } from "./script_helpers.mjs";

export function resolveDefaultWikiPath({ projectRoot, home, wikiDict }) {
  if (wikiDict) return wikiDict;
  return findFirstExisting([
    process.env.SAOSHU_WIKI_DICT || "",
    path.join(projectRoot, "saoshu-term-wiki", "references", "glossary.json"),
    process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills", "saoshu-term-wiki", "references", "glossary.json") : "",
    home ? path.join(home, ".codex", "skills", "saoshu-term-wiki", "references", "glossary.json") : "",
  ]);
}

export function resolveLocalDbIngestScript({ projectRoot, home }) {
  return findFirstExisting([
    process.env.SAOSHU_DB_INGEST_SCRIPT || "",
    path.join(projectRoot, "saoshu-scan-db", "scripts", "db_ingest.mjs"),
    process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills", "saoshu-scan-db", "scripts", "db_ingest.mjs") : "",
    home ? path.join(home, ".codex", "skills", "saoshu-scan-db", "scripts", "db_ingest.mjs") : "",
  ]);
}

export function resolveLocalDbDashboardScript({ projectRoot, home }) {
  return findFirstExisting([
    process.env.SAOSHU_DB_DASHBOARD_SCRIPT || "",
    path.join(projectRoot, "saoshu-scan-db", "scripts", "db_dashboard.mjs"),
    process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills", "saoshu-scan-db", "scripts", "db_dashboard.mjs") : "",
    home ? path.join(home, ".codex", "skills", "saoshu-scan-db", "scripts", "db_dashboard.mjs") : "",
  ]);
}

export function buildExternalDbIngestCommand(template, { reportPath, statePath, manifestPath, dbPath }) {
  return String(template || "")
    .replaceAll("{report}", String(reportPath || "").replaceAll("\\", "/"))
    .replaceAll("{state}", String(statePath || "").replaceAll("\\", "/"))
    .replaceAll("{manifest}", String(manifestPath || "").replaceAll("\\", "/"))
    .replaceAll("{db}", String(dbPath || "").replaceAll("\\", "/"));
}
