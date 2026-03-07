export const CRITICAL_RISK_RULES = ["绿帽", "死女", "送女", "背叛", "wrq", "龟作"];

export const FEMALE_CONTEXT_REQUIRED_RULES = new Set(["送女", "背叛", "绿帽", "死女", "wrq"]);

export const THUNDER_STRICT = [
  { rule: "绿帽", patterns: ["绿帽", "ntr"] },
  { rule: "wrq", patterns: ["万人骑", "wrq"] },
  { rule: "龟作", patterns: ["龟作", "知雷写雷"] },
];

export const THUNDER_RISK = [
  { rule: "绿帽", patterns: ["偷情", "出轨"] },
  { rule: "死女", patterns: ["香消玉殒", "战死", "殒命"] },
  { rule: "送女", patterns: ["送给", "送人", "让给", "拱手相让"] },
  { rule: "背叛", patterns: ["背叛", "叛变", "反目", "投靠"] },
  { rule: "wrq", patterns: ["人尽可夫", "交际花"] },
  { rule: "龟作", patterns: ["前世", "原剧情", "刻意"] },
];

export const DEPRESSION_RULES = [
  { rule: "前世雷", severity: "中等", min_defense: "重甲", minCount: 2, patterns: ["前世", "原剧情", "原世界线"] },
  { rule: "px/fc/非初", severity: "中等", min_defense: "布甲", minCount: 2, patterns: ["非处", "破身", "嫁过人", "人妻"] },
  { rule: "亵女", severity: "中等", min_defense: "布甲", minCount: 2, patterns: ["肚兜", "看光", "轻薄", "调戏"] },
  { rule: "虐主", severity: "中等", min_defense: "布甲", minCount: 3, patterns: ["重伤", "羞辱", "围攻", "吊打"] },
  { rule: "百合", severity: "轻微", min_defense: "轻甲", minCount: 1, patterns: ["百合", "女女"] },
  { rule: "面具流", severity: "中等", min_defense: "布甲", minCount: 1, patterns: ["易容", "面具", "伪装身份"] },
  { rule: "分身流", severity: "轻微", min_defense: "轻甲", minCount: 1, patterns: ["分身", "化身"] },
  { rule: "生孩子", severity: "超轻微", min_defense: "低防", minCount: 8, patterns: ["孩子", "儿子", "女儿", "怀孕"] },
  { rule: "接盘", severity: "轻微", min_defense: "轻甲", minCount: 1, patterns: ["接盘", "离异", "前任"] },
  { rule: "神雕", severity: "轻微", min_defense: "轻甲", minCount: 1, patterns: ["名花有主"] },
  { rule: "药老", severity: "轻微", min_defense: "布甲", minCount: 2, patterns: ["残魂", "体内老者"] },
  { rule: "宠物", severity: "超轻微", min_defense: "低防", minCount: 2, patterns: ["坐骑", "灵宠", "雄性宠物"] },
  { rule: "被系统控制", severity: "轻微", min_defense: "布甲", minCount: 1, patterns: ["系统强制", "任务惩罚", "抹杀"] },
  { rule: "圣母", severity: "超轻微", min_defense: "低防", minCount: 1, patterns: ["滥好人", "圣母"] },
  { rule: "虐心", severity: "超轻微", min_defense: "低防", minCount: 3, patterns: ["误会", "失忆"] },
  { rule: "nc", severity: "超轻微", min_defense: "低防", minCount: 3, patterns: ["脑残", "犯蠢"] },
  { rule: "拉皮条", severity: "超轻微", min_defense: "低防", minCount: 2, patterns: ["撮合", "牵线"] },
  { rule: "魂穿", severity: "超轻微", min_defense: "低防", minCount: 1, patterns: ["穿越", "魂穿", "附体"] },
  { rule: "配角开后宫", severity: "超轻微", min_defense: "低防", minCount: 2, patterns: ["后宫"] },
  { rule: "同人凑CP", severity: "超轻微", min_defense: "低防", minCount: 2, patterns: ["原著", "cp"] },
  { rule: "擦边", severity: "超轻微", min_defense: "低防", minCount: 4, patterns: ["暧昧", "差点", "险些"] },
];

export const TITLE_SIGNAL_RULES = [
  { type: "risk", rule: "绿帽", weight: 8, critical: true, patterns: ["绿帽", "ntr", "偷情", "出轨", "奸情"] },
  { type: "risk", rule: "送女", weight: 8, critical: true, patterns: ["送女", "送给", "送人", "让给", "共享"] },
  { type: "risk", rule: "背叛", weight: 8, critical: true, patterns: ["背叛", "叛变", "反目", "投靠"] },
  { type: "risk", rule: "死女", weight: 8, critical: true, patterns: ["死别", "诀别", "香消玉殒", "陨落", "战死", "殒命"] },
  { type: "risk", rule: "wrq", weight: 8, critical: true, patterns: ["万人骑", "人尽可夫", "交际花"] },
  { type: "depression", rule: "前世雷", weight: 4, critical: false, patterns: ["前世", "原剧情", "前尘", "旧梦"] },
  { type: "depression", rule: "px/fc/非初", weight: 4, critical: false, patterns: ["人妻", "前任", "嫁过", "破身", "非处"] },
  { type: "depression", rule: "虐主", weight: 3, critical: false, patterns: ["重伤", "围杀", "羞辱", "追杀"] },
  { type: "depression", rule: "百合", weight: 2, critical: false, patterns: ["百合", "女女"] },
  { type: "depression", rule: "接盘", weight: 2, critical: false, patterns: ["接盘", "前夫", "前男友", "离异"] },
];

export const TAG_PATTERNS = [
  "穿越", "重生", "系统", "学院", "宗门", "帝国", "皇宫", "朝堂", "战争", "后宫", "未婚妻", "妻子", "公主", "女王", "炼丹"
];

export const FEMALE_CONTEXT_WORDS = ["女主", "准女主", "她", "妻子", "未婚妻", "妃", "公主", "圣女", "姐姐", "妹妹", "姑娘", "小姐", "夫人", "王后", "女王"];

export function findAllKeywordHits(text, keyword) {
  const hits = [];
  const source = String(text || "");
  const needle = String(keyword || "");
  if (!needle) return hits;
  let offset = 0;
  while (offset < source.length) {
    const index = source.indexOf(needle, offset);
    if (index === -1) break;
    hits.push(index);
    offset = index + needle.length;
  }
  return hits;
}

export function hasKeywordInContext(text, keyword, contextWords, window = 80) {
  const source = String(text || "");
  const words = Array.isArray(contextWords) ? contextWords : [];
  for (const index of findAllKeywordHits(source, keyword)) {
    const left = Math.max(0, index - window);
    const right = Math.min(source.length, index + String(keyword).length + window);
    const snippet = source.slice(left, right);
    if (words.some((word) => snippet.includes(word))) return true;
  }
  return false;
}

export function collectRuleNames(rows, field = "rule") {
  return [...new Set((Array.isArray(rows) ? rows : []).map((item) => String(item?.[field] || "")).filter(Boolean))];
}
