const FEMALE_WORDS = ["她", "女主", "准女主", "妻子", "未婚妻", "道侣", "姑娘", "小姐", "夫人", "公主", "圣女", "仙子", "师姐", "妹妹", "姐姐", "王后", "女王"];
const MALE_WORDS = ["他", "男主", "公子", "少主", "皇子", "师兄", "夫君", "丈夫", "主角"];
const FEMALE_CORE_WORDS = ["妻子", "未婚妻", "道侣", "女主", "准女主", "红颜", "妃子"];
const GENERIC_NAME_WORDS = new Set(["众人", "有人", "主线", "前世", "真相", "误会", "传闻", "消息", "开头", "继续", "故事", "夜变", "复归"]);
const COMMON_SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘景詹束龙叶幸司韶郜黎薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎连习艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧师巩聂晁勾敖融冷訾辛阚那简饶空曾沙";
const NAME_SUFFIX_CHARS = new Set(["来", "去", "了", "着", "呢", "啊", "呀", "吗", "嘛", "的", "地", "得", "儿"]);
const NAME_PREFIX_CHARS = new Set(["阿", "小", "老"]);
const NAME_TITLE_SUFFIXES = ["师兄", "师姐", "公子", "小姐", "姑娘", "夫人", "前辈", "兄长", "姐姐", "妹妹"];
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

function timelinePriority(timeline) {
  const priorities = { mainline: 5, flashback: 4, original_plot: 3, past_life: 2, rumor: 1 };
  return priorities[String(timeline || "mainline")] || 0;
}

function extractLocalClause(text, index, keyword) {
  const leftText = text.slice(0, index);
  const rightText = text.slice(index + keyword.length);
  const leftBreak = Math.max(leftText.lastIndexOf("。"), leftText.lastIndexOf("！"), leftText.lastIndexOf("？"), leftText.lastIndexOf("\n"));
  const rightCandidates = [rightText.indexOf("。"), rightText.indexOf("！"), rightText.indexOf("？"), rightText.indexOf("\n")].filter((value) => value >= 0);
  const rightBreak = rightCandidates.length > 0 ? Math.min(...rightCandidates) : rightText.length;
  return normalizeSpaces(text.slice(leftBreak + 1, index + keyword.length + rightBreak + 1));
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

function normalizeCandidateName(text) {
  let value = safeText(text).trim();
  while (value.length >= 3 && NAME_SUFFIX_CHARS.has(value[value.length - 1])) value = value.slice(0, -1);
  return value;
}

function resolveKnownNameAlias(text, knownNames = []) {
  const value = normalizeCandidateName(text);
  const names = (knownNames || []).map((item) => normalizeCandidateName(item)).filter(Boolean);
  if (names.includes(value)) return value;
  if (value.length === 1) {
    const byTail = names.filter((name) => name.endsWith(value));
    if (byTail.length === 1) return byTail[0];
    const byHead = names.filter((name) => name.startsWith(value));
    if (byHead.length === 1) return byHead[0];
  }
  if (text && NAME_PREFIX_CHARS.has(String(text)[0])) {
    const shortValue = normalizeCandidateName(String(text).slice(1));
    const byTail = names.filter((name) => name.endsWith(shortValue));
    if (byTail.length === 1) return byTail[0];
  }
  for (const suffix of NAME_TITLE_SUFFIXES) {
    if (String(text).endsWith(suffix)) {
      const trimmed = normalizeCandidateName(String(text).slice(0, -suffix.length));
      const byHead = names.filter((name) => name.startsWith(trimmed) || name === trimmed);
      if (byHead.length === 1) return byHead[0];
    }
  }
  return value;
}

function looksLikeName(text) {
  const value = normalizeCandidateName(text);
  if (!/^[\u4e00-\u9fa5]{2,3}$/.test(value)) return false;
  if (!COMMON_SURNAMES.includes(value[0])) return false;
  if (GENERIC_NAME_WORDS.has(value)) return false;
  return true;
}

function relationMetaFromTitle(title) {
  const value = String(title || "");
  if (value === "未婚妻") return { subjectLabel: "未婚妻", targetLabel: "男主候选", targetRoleHint: "male_lead_candidate" };
  if (value === "妻子" || value === "夫人" || value === "妃子") return { subjectLabel: "伴侣候选", targetLabel: "男主候选", targetRoleHint: "male_lead_candidate" };
  if (value === "道侣" || value === "女友") return { subjectLabel: "感情线候选", targetLabel: "男主候选", targetRoleHint: "male_lead_candidate" };
  return { subjectLabel: "女主候选", targetLabel: "关系对象", targetRoleHint: "close_relation_candidate" };
}

function withRelationMeta(entity, relationLabel, relationConfidence) {
  return { ...entity, relation_label: relationLabel, relation_confidence: relationConfidence };
}

function relationPairFromSnippet(snippet, knownNames = []) {
  const match = /([\u4e00-\u9fa5]{2,3})是([\u4e00-\u9fa5]{2,3})的(未婚妻|妻子|道侣|女友|夫人|妃子)/.exec(snippet);
  if (!match) return null;
  const subjectName = resolveKnownNameAlias(match[1], knownNames);
  const targetName = resolveKnownNameAlias(match[2], knownNames);
  if (!looksLikeName(subjectName) || !looksLikeName(targetName)) return null;
  const relationMeta = relationMetaFromTitle(match[3]);
  return {
    subject: withRelationMeta({ name: subjectName, gender: "female", role_hint: "女主候选", confidence: 0.92 }, relationMeta.subjectLabel, 0.92),
    target: withRelationMeta({ name: targetName, role_hint: relationMeta.targetRoleHint, confidence: 0.84 }, relationMeta.targetLabel, 0.84),
  };
}

function buildBatchContext(batchText, topCharacters = []) {
  const directNames = [...new Set((batchText.match(/[\u4e00-\u9fa5]{2,3}/g) || []).map((value) => normalizeCandidateName(value)).filter((value) => looksLikeName(value)))];
  const knownNames = new Set([...(topCharacters || []).map((item) => String(item.name || "").trim()).filter(Boolean), ...directNames]);
  const relationPair = relationPairFromSnippet(batchText, [...knownNames]);
  if (relationPair?.subject?.name) knownNames.add(relationPair.subject.name);
  if (relationPair?.target?.name) knownNames.add(relationPair.target.name);
  return {
    relationPair,
    knownNames: [...knownNames],
  };
}

function inferNamedPair(snippet, keyword, batchContext = null) {
  const knownNames = batchContext?.knownNames || [];
  const relationPair = relationPairFromSnippet(snippet, knownNames) || batchContext?.relationPair || null;
  const betrayal = /([\u4e00-\u9fa5]{2,3}|她)(?:并未|未曾|没有|不会)?背叛([\u4e00-\u9fa5]{2,3})/.exec(snippet);
  if (betrayal && (!keyword || betrayal[0].includes(keyword))) {
    const targetName = resolveKnownNameAlias(betrayal[2], knownNames);
    if (looksLikeName(targetName)) {
      const subjectName = looksLikeName(betrayal[1]) ? resolveKnownNameAlias(betrayal[1], knownNames) : relationPair?.subject?.name;
      if (subjectName && looksLikeName(subjectName)) {
        return {
          subject: withRelationMeta({ name: subjectName, gender: "female", role_hint: "女主候选", confidence: 0.88 }, relationPair ? String(relationPair.subject?.relation_label || "女主候选") : "女主候选", relationPair ? Number(relationPair.subject?.relation_confidence || 0.88) : 0.88),
          target: withRelationMeta({ name: targetName, role_hint: relationPair && relationPair.target?.name === targetName ? "male_lead_candidate" : "close_relation_candidate", confidence: 0.78 }, relationPair && relationPair.target?.name === targetName ? String(relationPair.target?.relation_label || "男主候选") : "关系对象", relationPair && relationPair.target?.name === targetName ? Number(relationPair.target?.relation_confidence || 0.84) : 0.7),
        };
      }
    }
  }
  const loyalty = /([\u4e00-\u9fa5]{2,3}|她)(?:只是假装)?投靠([\u4e00-\u9fa5]{2,3})/.exec(snippet);
  if (loyalty && (!keyword || loyalty[0].includes(keyword))) {
    const targetName = resolveKnownNameAlias(loyalty[2], knownNames);
    const subjectName = looksLikeName(loyalty[1]) ? resolveKnownNameAlias(loyalty[1], knownNames) : relationPair?.subject?.name;
    if (subjectName && looksLikeName(subjectName) && looksLikeName(targetName)) {
      return {
        subject: withRelationMeta({ name: subjectName, gender: "female", role_hint: "女主候选", confidence: 0.82 }, relationPair ? String(relationPair.subject?.relation_label || "女主候选") : "女主候选", relationPair ? Number(relationPair.subject?.relation_confidence || 0.82) : 0.82),
        target: withRelationMeta({ name: targetName, role_hint: relationPair && relationPair.target?.name === targetName ? "male_lead_candidate" : "rival_or_faction_target", confidence: 0.76 }, relationPair && relationPair.target?.name === targetName ? String(relationPair.target?.relation_label || "男主候选") : "投靠对象", relationPair && relationPair.target?.name === targetName ? Number(relationPair.target?.relation_confidence || 0.84) : 0.72),
      };
    }
  }
  if (relationPair) return relationPair;
  return null;
}

function inferSubject(snippet, keyword, topCharacters = [], batchContext = null) {
  const namedPair = inferNamedPair(snippet, keyword, batchContext);
  if (namedPair?.subject) return namedPair.subject;

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
        relation_label: coreSignal ? "女主候选" : "女性角色",
        relation_confidence: coreSignal ? 0.58 : 0.42,
      };
    }
    return {
      name: "未识别角色",
      gender: maleSignal ? "male" : "unknown",
      role_hint: "未知",
      confidence: 0.2,
      relation_label: "未知",
      relation_confidence: 0.2,
    };
  }

  return {
    name: best.name,
    gender: femaleSignal ? "female" : (maleSignal ? "male" : "unknown"),
    role_hint: coreSignal ? "女主候选" : (femaleSignal ? "女性角色" : "未知"),
    confidence: Math.min(0.95, 0.45 + best.score / 400),
    relation_label: coreSignal ? "女主候选" : (femaleSignal ? "女性角色" : "未知"),
    relation_confidence: Math.min(0.95, 0.45 + best.score / 400),
  };
}

function inferTarget(snippet, subject, keyword = "", batchContext = null) {
  const namedPair = inferNamedPair(snippet, keyword, batchContext);
  if (namedPair?.target && (!namedPair.subject?.name || namedPair.subject.name === safeText(subject?.name))) {
    return namedPair.target;
  }
  if (safeText(subject?.name) && snippet.includes(subject.name)) {
    const withoutSubject = snippet.replace(subject.name, "");
    if (includesAny(withoutSubject, MALE_WORDS)) {
      return withRelationMeta({ name: "男主/关系对象", role_hint: "mc_or_relation", confidence: 0.65 }, "男主候选", 0.65);
    }
  }
  if (includesAny(snippet, ["男主", "主角", "他", "丈夫", "夫君"])) {
    return withRelationMeta({ name: "男主/关系对象", role_hint: "mc_or_relation", confidence: 0.6 }, "男主候选", 0.6);
  }
  return withRelationMeta({ name: "未识别对象", role_hint: "unknown", confidence: 0.2 }, "未知", 0.2);
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

function relationRolePriority(roleHint) {
  const mapping = {
    male_lead_candidate: 5,
    mc_or_relation: 4,
    close_relation_candidate: 3,
    rival_or_faction_target: 2,
    other_relation: 1,
    unknown: 0,
  };
  return mapping[String(roleHint || "unknown")] ?? 0;
}

function resolveCandidateConflicts(candidate) {
  const notes = [];
  const targetVotes = Array.isArray(candidate._target_votes) ? candidate._target_votes : [];
  if (targetVotes.length > 0) {
    const grouped = new Map();
    for (const vote of targetVotes) {
      const name = String(vote.name || "").trim();
      if (!name) continue;
      const score = 1 + Number(vote.relation_confidence || 0) + relationRolePriority(vote.role_hint);
      if (!grouped.has(name)) grouped.set(name, { score: 0, sample: vote });
      grouped.get(name).score += score;
    }
    const ranked = [...grouped.entries()].sort((a, b) => b[1].score - a[1].score);
    if (ranked.length > 0) {
      const primary = ranked[0][1].sample;
      candidate.target = {
        name: primary.name,
        role_hint: primary.role_hint,
        confidence: primary.confidence,
        relation_label: primary.relation_label,
        relation_confidence: primary.relation_confidence,
      };
      candidate.alternate_targets = ranked.slice(1).map(([name, row]) => ({
        name,
        role_hint: row.sample.role_hint,
        relation_label: row.sample.relation_label,
      }));
      if (candidate.alternate_targets.length > 0) notes.push(`备用对象:${candidate.alternate_targets.map((item) => item.name).join("/")}`);
    }
  }
  const polarityVotes = [...new Set((candidate._polarity_votes || []).filter(Boolean))];
  if (polarityVotes.length > 1) {
    candidate.polarity = polarityVotes.includes("affirmed") && polarityVotes.includes("negated") ? "uncertain" : candidate.polarity;
    notes.push(`极性冲突:${polarityVotes.join("/")}`);
  }
  const timelineVotes = (candidate._timeline_votes || []).filter(Boolean);
  const uniqueTimelineVotes = [...new Set(timelineVotes)];
  if (uniqueTimelineVotes.length > 0) {
    const grouped = new Map();
    for (const value of timelineVotes) grouped.set(value, (grouped.get(value) || 0) + 1);
    const ranked = [...grouped.entries()].sort((a, b) => b[1] - a[1] || timelinePriority(b[0]) - timelinePriority(a[0]));
    candidate.timeline = ranked[0][0];
    if (uniqueTimelineVotes.length > 1) notes.push(`时间线冲突:${uniqueTimelineVotes.join("/")}`);
  }
  candidate.conflict_notes = notes;
  delete candidate._target_votes;
  delete candidate._polarity_votes;
  delete candidate._timeline_votes;
}

export function buildEventCandidates({ batchId, batchRange, batchText, chapters, topCharacters, thunderRules, riskRules, depressionRules }) {
  const groups = new Map();
  const batchContext = buildBatchContext(batchText, topCharacters);
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
        const localContext = extractLocalClause(batchText, index, keyword);
        const polarity = inferPolarity(localContext);
        const timeline = inferTimeline(localContext);
        const subject = inferSubject(snippet, keyword, topCharacters, batchContext);
        const target = inferTarget(snippet, subject, keyword, batchContext);
        const chapter = chapterForOffset(chapters, index);
        const groupKey = mergeKey(rule.rule || rule.risk || keyword, subject, timeline);

        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            event_id: `${safeText(rule.rule || rule.risk || keyword).toLowerCase()}-${safeText(batchId).toLowerCase()}-${String(groups.size + 1).padStart(3, "0")}`,
            rule_candidate: safeText(rule.rule || rule.risk || keyword),
            category: rule.category,
            severity: safeText(rule.severity || ""),
            min_defense: safeText(rule.min_defense || ""),
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
            _target_votes: [],
            _polarity_votes: [],
            _timeline_votes: [],
          });
        }

        const candidate = groups.get(groupKey);
        if (!candidate.signals.includes(keyword)) candidate.signals.push(keyword);
        if (candidate.polarity === "affirmed" && polarity !== "affirmed") candidate.polarity = polarity;
        if (candidate.timeline === "mainline" && timeline !== "mainline") candidate.timeline = timeline;
        candidate._target_votes.push(target);
        candidate._polarity_votes.push(polarity);
        candidate._timeline_votes.push(timeline);

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
    resolveCandidateConflicts(candidate);
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
