function arr(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function line(value) {
  return String(value || "").trim();
}

function hasAnyCurrentCoverageContract(report) {
  return Boolean(
    line(report?.scan?.sampling?.coverage_mode)
    || line(report?.scan?.coverage_decision?.action)
    || line(report?.scan?.coverage_decision?.confidence)
  );
}

function inferLegacyConfidence(value, fallbackRiskCount = 0) {
  const normalized = line(value);
  if (["高", "高把握", "high"].includes(normalized)) return "stable";
  if (["中", "中等", "中把握", "medium"].includes(normalized)) return "cautious";
  if (["低", "低把握", "low"].includes(normalized)) return "insufficient";
  if (fallbackRiskCount >= 3) return "insufficient";
  if (fallbackRiskCount >= 1) return "cautious";
  return "stable";
}

function inferLegacyCoverageMode(report, manifest, state) {
  const pipelineMode = line(report?.scan?.sampling?.pipeline_mode || manifest?.pipeline_mode || state?.pipeline_mode);
  const tags = line(report?.novel?.tags || manifest?.tags);
  const rangesText = [line(report?.scan?.coverage), ...arr(report?.scan?.ranges).map((item) => line(item))].join(" ");
  const chapterLike = /第\d+/.test(rangesText) || /章/.test(rangesText);
  if (pipelineMode === "economy" || tags.includes("ECONOMY-SAMPLED")) return "sampled";
  if (pipelineMode === "performance" || tags.includes("PERFORMANCE-FULL")) {
    return chapterLike ? "chapter-full" : "full-book";
  }
  return pipelineMode === "performance" ? "chapter-full" : "sampled";
}

function inferCoverageUnit(report, coverageMode) {
  const rangesText = [line(report?.scan?.coverage), ...arr(report?.scan?.ranges).map((item) => line(item))].join(" ");
  const chapterLike = /第\d+/.test(rangesText) || /章/.test(rangesText);
  if (coverageMode === "sampled") return chapterLike ? "chapter" : "segment";
  if (coverageMode === "chapter-full") return chapterLike ? "chapter" : "segment";
  return chapterLike ? "chapter" : "segment";
}

function hasCoverageDecisionImpact(risk) {
  const impact = line(risk?.impact);
  return /(劝退|改变结论|显著下调|直接劝退|关键)/.test(impact);
}

function inferLegacyCoverageDecision(report, coverageMode) {
  const coverageRatio = toNumber(report?.scan?.sampling?.coverage_ratio);
  const totalBatches = toNumber(report?.scan?.sampling?.total_batches);
  const selectedBatches = toNumber(report?.scan?.sampling?.selected_batches);
  const risks = arr(report?.risks_unconfirmed);
  const followUpQuestions = arr(report?.follow_up_questions);
  const impactfulRiskCount = risks.filter((item) => hasCoverageDecisionImpact(item)).length;
  const riskCount = risks.length;
  const followUpCount = followUpQuestions.length;
  const targetDefense = line(report?.novel?.target_defense);
  const sensitiveDefense = ["布甲", "轻甲", "低防", "负防", "极限负防"].includes(targetDefense);
  const reasonCodes = [];
  const addReason = (code) => {
    if (!reasonCodes.includes(code)) reasonCodes.push(code);
  };

  if (coverageMode === "sampled") {
    if (totalBatches > 0 && selectedBatches > 0 && selectedBatches < totalBatches && coverageRatio < 0.999) addReason("late_risk_uncovered");
    if (impactfulRiskCount >= 1 || riskCount >= 2 || followUpCount >= 2) addReason("too_many_unverified");
    if (sensitiveDefense && (coverageRatio < 0.999 || impactfulRiskCount >= 1 || followUpCount >= 2)) addReason("sensitive_defense_needs_more_evidence");
    const action = reasonCodes.length > 0 ? "upgrade-chapter-full" : "keep-sampled";
    const confidence = action === "upgrade-chapter-full"
      ? (impactfulRiskCount >= 1 || reasonCodes.length >= 2 ? "insufficient" : "cautious")
      : inferLegacyConfidence(report?.decision_summary?.confidence, riskCount);
    return { action, confidence, reasonCodes };
  }

  if (coverageMode === "chapter-full") {
    if (coverageRatio < 0.999 && (impactfulRiskCount >= 1 || followUpCount >= 2)) addReason("chapter_boundary_unstable");
    if (sensitiveDefense && impactfulRiskCount >= 1 && coverageRatio < 0.999) addReason("sensitive_defense_needs_more_evidence");
    const action = reasonCodes.length > 0 ? "upgrade-full-book" : "keep-current";
    const confidence = action === "upgrade-full-book"
      ? (impactfulRiskCount >= 1 ? "insufficient" : "cautious")
      : inferLegacyConfidence(report?.decision_summary?.confidence, riskCount);
    return { action, confidence, reasonCodes };
  }

  return {
    action: "keep-current",
    confidence: inferLegacyConfidence(report?.decision_summary?.confidence, riskCount),
    reasonCodes,
  };
}

export function resolveCoverageContract(report, state = {}, manifest = {}) {
  const reportedCoverageMode = line(report?.scan?.sampling?.coverage_mode);
  const reportedCoverageTemplate = line(report?.scan?.sampling?.coverage_template);
  const reportedCoverageUnit = line(report?.scan?.sampling?.coverage_unit);
  const reportedChapterDetectUsedMode = line(report?.scan?.sampling?.chapter_detect_used_mode);
  const reportedSerialStatus = line(report?.scan?.sampling?.serial_status);
  const reportedAction = line(report?.scan?.coverage_decision?.action);
  const reportedConfidence = line(report?.scan?.coverage_decision?.confidence);
  const reportedReasons = arr(report?.scan?.coverage_decision?.reason_codes).map((item) => line(item)).filter(Boolean);

  if (hasAnyCurrentCoverageContract(report)) {
    return {
      coverageMode: reportedCoverageMode,
      coverageTemplate: reportedCoverageTemplate,
      coverageUnit: reportedCoverageUnit,
      chapterDetectUsedMode: reportedChapterDetectUsedMode,
      serialStatus: reportedSerialStatus,
      action: reportedAction,
      confidence: reportedConfidence,
      reasons: reportedReasons,
      source: "reported",
    };
  }

  const coverageMode = inferLegacyCoverageMode(report, manifest, state);
  const inferredDecision = inferLegacyCoverageDecision(report, coverageMode);
  return {
    coverageMode,
    coverageTemplate: reportedCoverageTemplate,
    coverageUnit: inferCoverageUnit(report, coverageMode),
    chapterDetectUsedMode: reportedChapterDetectUsedMode,
    serialStatus: reportedSerialStatus,
    action: inferredDecision.action,
    confidence: inferredDecision.confidence,
    reasons: inferredDecision.reasonCodes,
    source: "legacy-inferred",
  };
}
