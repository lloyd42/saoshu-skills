export function shouldRunStage(selectedStage, stageName) {
  return selectedStage === "all" || selectedStage === stageName;
}

export function runStageIfSelected(selectedStage, stageName, handler) {
  if (!shouldRunStage(selectedStage, stageName)) return;
  handler();
}

export function runOptionalStage({ enabled, stepName, skippedDetail, run, mark }) {
  if (!enabled) {
    mark(stepName, "skipped", skippedDetail);
    return;
  }

  const { detail, execute } = run();
  try {
    execute();
    mark(stepName, "done", detail);
  } catch (error) {
    mark(stepName, "failed", `${detail} :: ${String(error.message || error)}`);
  }
}
