const FEMALE_WORDS = ["她", "女主", "准女主", "妻子", "未婚妻", "道侣", "姑娘", "小姐", "夫人", "公主", "圣女", "仙子", "师姐", "妹妹", "姐姐", "王后", "女王"];
const MALE_WORDS = ["他", "男主", "公子", "少主", "皇子", "师兄", "夫君", "丈夫", "主角"];
const FEMALE_CORE_WORDS = ["妻子", "未婚妻", "道侣", "女主", "准女主", "红颜", "妃子"];
const NEGATION_WORDS = ["没有", "并未", "未曾", "不是", "并非", "毫无"];
const UNCERTAIN_WORDS = ["差点", "险些", "几乎", "误会", "误以为", "假装", "如果", "本该", "原本", "传闻", "听说"];
const TIMELINE_PATTERNS = [
  { timeline: "past_life", patterns: ["前世", "上一世"] },
  { timeline: "original_plot", patterns: ["原剧情", "原著", "原世界线"] },
  { timeline: "flashback", patterns: ["回忆", "当年", "昔日"] },
  { timeline: "rumor", patterns: ["传闻", "听说"] },
];

function safeText(value) {
  return String(value || "");
}

function normalizeSpaces(text) {
  return safeText(text).replace(/\s+/g, " ").trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function inferTimeline(text) {
  for (const entry of TIMELINE_PATTERNS) {
    if (includesAny(text, entry.patterns)) return entry.timeline;
  }
  return "mainline";
}

function inferPolarity(text) {
  if (includesAny(text, NEGATION_WORDS)) return "negated";
  if (includesAny(text, UNCERTAIN_WORDS)) return "uncertain";
  return "affirmed";
}

function findAllKeywordHits(text, keyword) {
  const hits = [];
  let offset = 0;
  while (offset < text.length) {
    const index = text.indexOf(keyword, offset);
    if (index === -1) break;
    hits.push(index);
    offset = index + keyword.length;
  }
  return hits;
}

function chapterForOffset(chapters, offset) {
  for (const chapter of chapters) {
    if (offset >= chapter.start && offset < chapter.end) return chapter;
  }
  return chapters[chapters.length - 1] || null;
}

function collectSnippet(text, index, keyword, window = 180) {
  const start = Math.max(0, index - window);
  const end = Math.min(text.length, index + keyword.length + window);
  return normalizeSpaces(text.slice(start, end));
}

function scoreNameAroundSnippet(snippet, name, keyword) {
  const idx = snippet.indexOf(name);
  const kw = snippet.indexOf(keyword);
  if (idx === -1 || kw === -1) return -1;
  const distance = Math.abs(idx - kw);
  return Math.max(0, 200 - distance);
}

function inferSubject(snippet, keyword, topCharacters = []) {
  const candidates = topCharacters
    .map((item) => ({ name: safeText(item.name).trim(), count: Number(item.count || 0) }))
    .filter((item) => item.name);

  let best = null;
  for (const candidate of candidates) {
    const score = scoreNameAroundSnippet(snippet, candidate.name, keyword) + candidate.count * 3;
    if (score <= 0) continue;
    if (!best || score > best.score) best = { ...candidate, score };
  }

  const lowerSnippet = safeText(snippet);
  const femaleSignal = includesAny(lowerSnippet, FEMALE_WORDS);
  const maleSignal = includesAny(lowerSnippet, MALE_WORDS);
  const coreSignal = includesAny(lowerSnippet, FEMALE_CORE_WORDS);

  if (!best) {
    if (femaleSignal) {
      return {
        name: "未识别女性角色",
        gender: "female",
        role_hint: coreSignal ? "女主候选" : "女性角色",
        confidence: coreSignal ? 0.58 : 0.42,
      };
    }
    return {
      name: "未识别角色",
      gender: maleSignal ? "male" : "unknown",
      role_hint: "未知",
      confidence: 0.2,
    };
  }

  return {
    name: best.name,
    gender: femaleSignal ? "female" : (maleSignal ? "male" : "unknown"),
    role_hint: coreSignal ? "女主候选" : (femaleSignal ? "女性角色" : "未知"),
    confidence: Math.min(0.95, 0.45 + best.score / 400),
  };
}

function inferTarget(snippet, subject) {
  if (safeText(subject?.name) && snippet.includes(subject.name)) {
    const withoutSubject = snippet.replace(subject.name, "");
    if (includesAny(withoutSubject, MALE_WORDS)) {
      return { name: "男主/关系对象", role_hint: "mc_or_relation", confidence: 0.65 };
    }
  }
  if (includesAny(snippet, ["男主", "主角", "他", "丈夫", "夫君"])) {
    return { name: "男主/关系对象", role_hint: "mc_or_relation", confidence: 0.6 };
  }
  return { name: "未识别对象", role_hint: "unknown", confidence: 0.2 };
}

function scoreCandidate(ruleName, subject, snippet, evidenceCount, polarity, timeline) {
  let score = 0;
  if (subject.gender === "female") score += 3;
  if (subject.role_hint === "女主候选") score += 3;
  else if (subject.role_hint === "女性角色") score += 1;
  if (evidenceCount >= 2) score += 2;
  if (polarity === "affirmed") score += 2;
  if (["死女", "背叛", "送女"].includes(ruleName) && includesAny(snippet, ["她", "妻子", "未婚妻", "道侣", "女主", "准女主"])) score += 2;
  if (polarity === "uncertain") score -= 2;
  if (polarity === "negated") score -= 4;
  if (timeline !== "mainline") score -= 2;
  if (subject.gender === "male") score -= 3;
  return score;
}

function statusFromScore(score) {
  if (score >= 7) return "已确认";
  if (score >= 4) return "高概率";
  return "未知待证";
}

function certaintyFromScore(score) {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function missingEvidence(ruleName, subject, polarity, timeline) {
  const items = [];
  if (subject.gender !== "female") items.push("需确认主体是否为女性核心角色");
  if (polarity !== "affirmed") items.push("需确认事件是否真实发生而非误会/假设/未遂");
  if (timeline !== "mainline") items.push("需确认该情节是否影响主线而非前世/回忆/传闻");
  if (["死女", "背叛", "送女"].includes(ruleName)) items.push("需确认该角色是否属于女主或准女主范围");
  return [...new Set(items)].slice(0, 4);
}

function counterEvidence(snippet, subject, timeline, polarity) {
  const items = [];
  if (polarity === "negated") items.push("片段中存在明确否定词");
  if (polarity === "uncertain") items.push("片段中存在误会/未遂/假设类词汇");
  if (timeline !== "mainline") items.push(`时间线为 ${timeline}`);
  if (subject.gender === "male") items.push("主体更像男性角色");
  return items;
}

function pushEvidence(evidence, entry) {
  const key = `${entry.chapter_num}|${entry.keyword}|${entry.snippet}`;
  if (!evidence.some((item) => `${item.chapter_num}|${item.keyword}|${item.snippet}` === key)) {
    evidence.push(entry);
  }
}

function mergeKey(ruleName, subject, timeline) {
  return `${ruleName}|${safeText(subject?.name)}|${timeline}`;
}

export function buildEventCandidates({ batchId, batchRange, batchText, chapters, topCharacters, thunderRules, riskRules, depressionRules }) {
  const groups = new Map();
  const allRules = [
    ...thunderRules.map((item) => ({ ...item, category: "thunder" })),
    ...riskRules.map((item) => ({ ...item, category: "risk" })),
    ...depressionRules.map((item) => ({ ...item, category: "depression" })),
  ];

  for (const rule of allRules) {
    for (const keyword of rule.patterns || []) {
      const hitIndexes = findAllKeywordHits(batchText, keyword);
      for (const index of hitIndexes) {
        const snippet = collectSnippet(batchText, index, keyword);
        const polarity = inferPolarity(snippet);
        const timeline = inferTimeline(snippet);
        const subject = inferSubject(snippet, keyword, topCharacters);
        const target = inferTarget(snippet, subject);
        const chapter = chapterForOffset(chapters, index);
        const groupKey = mergeKey(rule.rule || rule.risk || keyword, subject, timeline);

        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            event_id: `${safeText(rule.rule || rule.risk || keyword).toLowerCase()}-${safeText(batchId).toLowerCase()}-${String(groups.size + 1).padStart(3, "0")}`,
            rule_candidate: safeText(rule.rule || rule.risk || keyword),
            category: rule.category,
            source: "keyword+context",
            subject,
            target,
            chapter_range: batchRange,
            timeline,
            polarity,
            certainty: "low",
            signals: [],
            evidence: [],
            counter_evidence: [],
            confidence_score: 0,
            status: "未知待证",
            missing_evidence: [],
          });
        }

        const candidate = groups.get(groupKey);
        if (!candidate.signals.includes(keyword)) candidate.signals.push(keyword);
        if (candidate.polarity === "affirmed" && polarity !== "affirmed") candidate.polarity = polarity;
        if (candidate.timeline === "mainline" && timeline !== "mainline") candidate.timeline = timeline;

        pushEvidence(candidate.evidence, {
          chapter_num: Number(chapter?.num || 0),
          chapter_title: safeText(chapter?.title || ""),
          keyword,
          snippet,
          offset_hint: index,
        });
      }
    }
  }

  const out = [];
  for (const candidate of groups.values()) {
    const primarySnippet = safeText(candidate.evidence[0]?.snippet || "");
    candidate.confidence_score = scoreCandidate(
      candidate.rule_candidate,
      candidate.subject,
      primarySnippet,
      candidate.evidence.length,
      candidate.polarity,
      candidate.timeline
    );
    candidate.status = statusFromScore(candidate.confidence_score);
    candidate.certainty = certaintyFromScore(candidate.confidence_score);
    candidate.counter_evidence = counterEvidence(primarySnippet, candidate.subject, candidate.timeline, candidate.polarity);
    candidate.missing_evidence = missingEvidence(candidate.rule_candidate, candidate.subject, candidate.polarity, candidate.timeline);
    out.push(candidate);
  }

  return out.sort((a, b) => b.confidence_score - a.confidence_score || a.rule_candidate.localeCompare(b.rule_candidate, "zh"));
}
