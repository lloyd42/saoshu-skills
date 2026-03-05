#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function decodeBuffer(buf, encoding) {
  return new TextDecoder(encoding, { fatal: false }).decode(buf);
}

function maybeGarbled(text) {
  if (!text) return true;
  const bad = (text.match(/�/g) || []).length;
  return bad > 0 && bad / Math.max(text.length, 1) > 0.001;
}

function tryParseChapterCount(text) {
  const re = /^(?:(?:第\s*\d+\s*[节回卷话]\s*)?第\s*(\d+)\s*章[^\n]*)$/gm;
  return [...text.matchAll(re)].length;
}

function readNovelText(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const candidates = [];

  const utf8 = buf.toString("utf8");
  candidates.push({ encoding: "utf8", text: utf8, chapters: tryParseChapterCount(utf8), garbled: maybeGarbled(utf8) });

  for (const enc of ["gb18030", "gbk"]) {
    try {
      const t = decodeBuffer(buf, enc);
      candidates.push({ encoding: enc, text: t, chapters: tryParseChapterCount(t), garbled: maybeGarbled(t) });
    } catch {
      // Ignore unsupported encoding in current Node runtime.
    }
  }

  candidates.sort((a, b) => {
    if (b.chapters !== a.chapters) return b.chapters - a.chapters;
    if (a.garbled !== b.garbled) return a.garbled ? 1 : -1;
    return 0;
  });

  const best = candidates[0];
  if (!best || best.chapters === 0) {
    throw new Error("No chapter headers found (all decoding candidates failed)");
  }

  return best;
}

// High-specificity words can enter thunder_hits directly; low-specificity words only enter risk_unconfirmed.
const THUNDER_STRICT = [
  { rule: "绿帽", patterns: ["绿帽", "ntr"] },
  { rule: "wrq", patterns: ["万人骑", "wrq"] },
  { rule: "龟作", patterns: ["龟作", "知雷写雷"] },
];

const THUNDER_RISK = [
  { rule: "绿帽", patterns: ["偷情", "出轨"] },
  { rule: "死女", patterns: ["香消玉殒", "战死", "殒命"] },
  { rule: "送女", patterns: ["送给", "送人", "让给", "拱手相让"] },
  { rule: "背叛", patterns: ["背叛", "叛变", "反目", "投靠"] },
  { rule: "wrq", patterns: ["人尽可夫", "交际花"] },
  { rule: "龟作", patterns: ["前世", "原剧情", "刻意"] },
];

const DEPRESSION_RULES = [
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

const TAG_PATTERNS = [
  "穿越", "重生", "系统", "学院", "宗门", "帝国", "皇宫", "朝堂", "战争", "后宫", "未婚妻", "妻子", "公主", "女王", "炼丹"
];

const FEMALE_CONTEXT_WORDS = ["女主", "准女主", "她", "妻子", "未婚妻", "妃", "公主", "圣女", "姐姐", "妹妹", "姑娘", "小姐", "夫人", "王后", "女王"];

function usage() {
  console.log("Usage: node scan_txt_batches.mjs --input <novel.txt> --output <batch-dir> [--batch-size 80] [--overlap 2]");
}

function parseArgs(argv) {
  const out = { input: "", output: "", batchSize: 80, overlap: 2 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--input") out.input = v, i++;
    else if (k === "--output") out.output = v, i++;
    else if (k === "--batch-size") out.batchSize = Number(v), i++;
    else if (k === "--overlap") out.overlap = Number(v), i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown argument: ${k}`);
  }
  if (!out.input || !out.output) throw new Error("--input and --output are required");
  if (out.batchSize < 10) throw new Error("--batch-size too small");
  if (out.overlap < 0 || out.overlap >= out.batchSize) throw new Error("--overlap out of range");
  return out;
}

function parseChapters(text) {
  // Support variants like:
  // - 第0001章 标题
  // - 第1章：标题
  // - 第1节 第1章：标题
  const re = /^(?:(?:第\s*\d+\s*[节回卷话]\s*)?第\s*(\d+)\s*章[^\n]*)$/gm;
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) throw new Error("No chapter headers found");

  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const num = Number(m[1]);
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const titleLineEnd = text.indexOf("\n", start);
    const title = text.slice(start, titleLineEnd === -1 ? end : titleLineEnd).trim();
    const bodyStart = titleLineEnd === -1 ? start : titleLineEnd + 1;
    const body = text.slice(bodyStart, end);
    chapters.push({ num, title, body });
  }
  return chapters;
}

function countMatches(text, pattern) {
  if (!pattern) return 0;
  return text.split(pattern).length - 1;
}

function inFemaleContext(text, keyword, window = 80) {
  const idx = text.indexOf(keyword);
  if (idx === -1) return false;
  const l = Math.max(0, idx - window);
  const r = Math.min(text.length, idx + keyword.length + window);
  const s = text.slice(l, r);
  return FEMALE_CONTEXT_WORDS.some((w) => s.includes(w));
}

function extractTopTags(text, topN = 12) {
  const rows = TAG_PATTERNS
    .map((name) => ({ name, count: countMatches(text, name) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
  return rows;
}

function extractTopCharacters(text, topN = 16) {
  const surname = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉戎祖武符刘景詹束龙叶幸司韶郜黎薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公司";
  const ignore = new Set(["林羽", "自己", "对方", "众人", "老者", "男子", "女子", "大家", "有人", "没有", "什么", "这样", "那里", "这里"]);
  const bad = ["怎么", "这么", "都", "来", "心", "所", "点", "和", "里", "就", "又", "被", "把", "跟", "对", "向", "于", "从", "到", "开口", "淡淡", "林羽", "林老", "经过", "如果", "但是", "因为", "于是", "这个", "那个"];
  const badTail = new Set(["苦", "微", "惊", "怒", "笑", "叹", "失", "沉", "冷"]);
  const patterns = [
    /[”」』]\s*([\u4e00-\u9fa5]{2,3})(?:[，。：“]|问道|说道|笑道|怒道|喝道|叹道)/g,
    /(?:^|[，。\s])([\u4e00-\u9fa5]{2,3})(?:公主|小姐|夫人|前辈|师兄|师姐|女王)/g,
  ];
  const m = new Map();
  for (const re of patterns) {
    for (const g of text.matchAll(re)) {
      const n = (g[1] || "").trim();
      if (!n || n.length < 2 || n.length > 3) continue;
      if (ignore.has(n)) continue;
      if (!surname.includes(n[0])) continue;
      if (bad.some((x) => n.includes(x))) continue;
      if (badTail.has(n[n.length - 1])) continue;
      m.set(n, (m.get(n) || 0) + 1);
    }
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .filter(([, count]) => count >= 2)
    .map(([name, count]) => ({ name, count }));
}

function detectHits(batchText, batchRangeText) {
  const thunder = [];
  const depression = [];
  const risks = [];

  for (const r of THUNDER_STRICT) {
    let matched = "";
    for (const p of r.patterns) {
      if (batchText.includes(p)) {
        matched = p;
        break;
      }
    }
    if (matched) {
      thunder.push({
        rule: r.rule,
        summary: `高特异词命中：${matched}（自动预扫，需人工复核）`,
        evidence_level: "未知待证",
        anchor: batchRangeText,
      });
    }
  }

  for (const r of THUNDER_RISK) {
    let matched = "";
    for (const p of r.patterns) {
      if (batchText.includes(p)) {
        if (r.rule === "送女" || r.rule === "背叛" || r.rule === "绿帽" || r.rule === "死女" || r.rule === "wrq") {
          if (!inFemaleContext(batchText, p)) continue;
        }
        matched = p;
        break;
      }
    }
    if (matched) {
      risks.push({
        risk: r.rule,
        current_evidence: `检测到风险词 ${matched}`,
        missing_evidence: "需要具体情节上下文确认是否构成该雷点",
        impact: "若实锤将显著下调结论并可能直接劝退",
      });
    }
  }

  for (const r of DEPRESSION_RULES) {
    const counts = r.patterns.map((p) => ({ p, c: countMatches(batchText, p) }));
    const total = counts.reduce((s, x) => s + x.c, 0);
    const top = counts.sort((a, b) => b.c - a.c)[0];
    if (total >= (r.minCount || 1) && top && top.c > 0) {
      depression.push({
        rule: r.rule,
        summary: `关键词命中：${top.p} x${top.c}（自动预扫，需人工复核）`,
        severity: r.severity,
        min_defense: r.min_defense,
        evidence_level: "未知待证",
        anchor: batchRangeText,
      });
    }
  }

  return { thunder, depression, risks };
}

function uniqueBy(arr, keyFn) {
  const m = new Map();
  for (const it of arr) m.set(keyFn(it), it);
  return [...m.values()];
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) {
    usage();
    return;
  }

  const input = path.resolve(args.input);
  const output = path.resolve(args.output);
  const loaded = readNovelText(input);
  const text = loaded.text;
  const chapters = parseChapters(text);

  fs.mkdirSync(output, { recursive: true });
  for (const f of fs.readdirSync(output)) {
    if (/^B\d+\.json$/i.test(f)) fs.unlinkSync(path.join(output, f));
  }

  const stride = args.batchSize - args.overlap;
  let batchIndex = 1;
  for (let start = 0; start < chapters.length; start += stride) {
    const end = Math.min(start + args.batchSize, chapters.length);
    const batch = chapters.slice(start, end);
    if (batch.length === 0) continue;

    const first = batch[0].num;
    const last = batch[batch.length - 1].num;
    const batchId = `B${String(batchIndex).padStart(2, "0")}`;
    const range = `第${first}-${last}章`;
    const batchText = batch.map((c) => `${c.title}\n${c.body}`).join("\n");

    const hits = detectHits(batchText, range);
    const events = batch.slice(0, 6).map((c) => c.title);
    const topTags = extractTopTags(batchText, 12);
    const topChars = extractTopCharacters(batchText, 16);
    const topSignals = [
      ...hits.thunder.map((x) => ({ name: `雷点:${x.rule}`, count: 1 })),
      ...hits.depression.map((x) => ({ name: `郁闷:${x.rule}`, count: 1 })),
      ...hits.risks.map((x) => ({ name: `风险:${x.risk}`, count: 1 })),
    ];

    const obj = {
      batch_id: batchId,
      range,
      new_characters: [],
      events,
      metadata: {
        source: "local_heuristic",
        top_tags: topTags,
        top_characters: topChars,
        top_signals: topSignals,
      },
      thunder_hits: uniqueBy(hits.thunder, (x) => `${x.rule}|${x.anchor}`),
      depression_hits: uniqueBy(hits.depression, (x) => `${x.rule}|${x.anchor}`),
      risk_unconfirmed: uniqueBy(hits.risks, (x) => `${x.risk}|${x.current_evidence}`),
      delta_relation: [],
    };

    const outPath = path.join(output, `${batchId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(obj, null, 2), "utf8");
    batchIndex++;

    if (end >= chapters.length) break;
  }

  console.log(`Input encoding: ${loaded.encoding}`);
  console.log(`Chapters: ${chapters.length}`);
  console.log(`Generated batches: ${batchIndex - 1}`);
  console.log(`Output: ${output}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
