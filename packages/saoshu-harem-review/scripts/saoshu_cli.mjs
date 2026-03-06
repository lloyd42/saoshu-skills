#!/usr/bin/env node
import { dispatchCliCommand, parseCommon, showCliHelp } from "./lib/cli_commands.mjs";
import { formatCliError } from "./lib/cli_feedback.mjs";
import { getExitCode } from "./lib/exit_codes.mjs";

const HELP_FLAGS = ["--help", "-h"];

function main() {
  const { cmd, rest } = parseCommon(process.argv);
  if (HELP_FLAGS.includes(cmd)) {
    showCliHelp();
    return;
  }
  dispatchCliCommand(cmd, rest, import.meta.url);
}

try {
  main();
} catch (err) {
  const formatted = formatCliError(err);
  console.error(formatted.message);
  if (formatted.hint) console.error(formatted.hint);
  console.log("");
  showCliHelp();
  process.exit(getExitCode(err));
}
