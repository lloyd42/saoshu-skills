#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildEventCandidates } from "./lib/event_candidates.mjs";
import { getExitCode } from "./lib/exit_codes.mjs";
import { parseChapters, readNovelText } from "./lib/novel_input.mjs";
import {
  DEPRESSION_RULES,
  FEMALE_CONTEXT_REQUIRED_RULES,
  FEMALE_CONTEXT_WORDS,
  TAG_PATTERNS,
  THUNDER_RISK,
  THUNDER_STRICT,
  TITLE_SIGNAL_RULES,
  hasKeywordInContext,
} from "./lib/rule_catalog.mjs";
import { formatScriptError, scriptUsage } from "./lib/script_feedback.mjs";

function usage() {
  console.log("Usage: node scan_txt_batches.mjs --input <novel.txt> --output <batch-dir> [--batch-size 80] [--overlap 2] [--keyword-rules <json>]");
}

function parseArgs(argv) {
  const out = { input: "", output: "", batchSize: 80, overlap: 2, keywordRules: "" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--input") out.input = v, i++;
    else if (k === "--output") out.output = v, i++;
    else if (k === "--batch-size") out.batchSize = Number(v), i++;
    else if (k === "--overlap") out.overlap = Number(v), i++;
    else if (k === "--keyword-rules") out.keywordRules = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else scriptUsage(`未知参数：${k}`, "示例：node scan_txt_batches.mjs --input ./novel.txt --output ./batches");
  }
  if (!out.input || !out.output) scriptUsage("缺少 `--input` 或 `--output`", "示例：node scan_txt_batches.mjs --input ./novel.txt --output ./batches");
  if (out.batchSize < 10) scriptUsage("`--batch-size` 过小", "建议值不小于 10");
  if (out.overlap < 0 || out.overlap >= out.batchSize) scriptUsage("`--overlap` 超出范围", "要求：0 <= overlap < batch-size");
  return out;
}

function countMatches(text, pattern) {
  if (!pattern) return 0;
  return text.split(pattern).length - 1;
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

function detectHits(batchText, batchRangeText, rules) {
  const thunder = [];
  const depression = [];
  const risks = [];

  for (const r of rules.thunderStrict) {
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

  for (const r of rules.thunderRisk) {
    let matched = "";
    for (const p of r.patterns) {
      if (batchText.includes(p)) {
        if (FEMALE_CONTEXT_REQUIRED_RULES.has(r.rule)) {
          if (!hasKeywordInContext(batchText, p, FEMALE_CONTEXT_WORDS)) continue;
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

  for (const r of rules.depressionRules) {
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

function analyzeChapterTitles(batch, titleSignalRules = TITLE_SIGNAL_RULES) {
  const hits = [];
  for (const chapter of batch) {
    const title = String(chapter.title || "").trim();
    if (!title) continue;
    for (const rule of titleSignalRules) {
      for (const pattern of rule.patterns) {
        if (!title.includes(pattern)) continue;
        hits.push({
          chapter_num: chapter.num,
          chapter_title: title,
          type: rule.type,
          rule: rule.rule,
          matched: pattern,
          weight: rule.weight,
          critical: rule.critical,
        });
        break;
      }
    }
  }

  hits.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.chapter_num - b.chapter_num;
  });

  return {
    score: hits.reduce((sum, hit) => sum + hit.weight, 0),
    critical: hits.some((hit) => hit.critical),
    hit_chapter_count: new Set(hits.map((hit) => hit.chapter_num)).size,
    risk_rules: [...new Set(hits.filter((hit) => hit.type === "risk").map((hit) => hit.rule))],
    depression_rules: [...new Set(hits.filter((hit) => hit.type === "depression").map((hit) => hit.rule))],
    hits: hits.slice(0, 8),
  };
}

function uniqueBy(arr, keyFn) {
  const m = new Map();
  for (const it of arr) m.set(keyFn(it), it);
  return [...m.values()];
}

function mergeRuleRows(baseRows, extraRows, keyFields = ["rule"]) {
  const grouped = new Map();
  for (const row of [...baseRows, ...extraRows]) {
    const key = keyFields.map((field) => String(row?.[field] || "")).join("|");
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, { ...row, patterns: [] });
    const current = grouped.get(key);
    current.patterns.push(...(Array.isArray(row?.patterns) ? row.patterns : []));
    for (const [field, value] of Object.entries(row || {})) {
      if (field === "patterns") continue;
      if (current[field] === undefined || current[field] === "" || current[field] === 0) current[field] = value;
    }
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    patterns: [...new Set((Array.isArray(row.patterns) ? row.patterns : []).map((item) => String(item || "").trim()).filter(Boolean))],
  }));
}

function loadRuleCatalog(extraRulePath) {
  const catalog = {
    thunderStrict: THUNDER_STRICT,
    thunderRisk: THUNDER_RISK,
    depressionRules: DEPRESSION_RULES,
    titleSignalRules: TITLE_SIGNAL_RULES,
  };
  if (!extraRulePath) return catalog;
  const absolutePath = path.resolve(extraRulePath);
  if (!fs.existsSync(absolutePath)) scriptUsage("`--keyword-rules` 文件不存在", `收到：${absolutePath}`);
  const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  return {
    thunderStrict: mergeRuleRows(THUNDER_STRICT, Array.isArray(payload.thunder_strict) ? payload.thunder_strict : []),
    thunderRisk: mergeRuleRows(THUNDER_RISK, Array.isArray(payload.thunder_risk) ? payload.thunder_risk : []),
    depressionRules: mergeRuleRows(DEPRESSION_RULES, Array.isArray(payload.depression_rules) ? payload.depression_rules : []),
    titleSignalRules: mergeRuleRows(TITLE_SIGNAL_RULES, Array.isArray(payload.title_signal_rules) ? payload.title_signal_rules : [], ["type", "rule"]),
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) {
    usage();
    return;
  }

  const input = path.resolve(args.input);
  const output = path.resolve(args.output);
  const rules = loadRuleCatalog(args.keywordRules);
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

    const hits = detectHits(batchText, range, rules);
    const events = batch.slice(0, 6).map((c) => c.title);
    const topTags = extractTopTags(batchText, 12);
    const topChars = extractTopCharacters(batchText, 16);
    const chapterTitleScan = analyzeChapterTitles(batch, rules.titleSignalRules);
    const eventCandidates = buildEventCandidates({
      batchId,
      batchRange: range,
      batchText,
      chapters: batch,
      topCharacters: topChars,
      thunderRules: rules.thunderStrict,
      riskRules: rules.thunderRisk,
      depressionRules: rules.depressionRules,
    });
    const topSignals = [
      ...hits.thunder.map((x) => ({ name: `雷点:${x.rule}`, count: 1 })),
      ...hits.depression.map((x) => ({ name: `郁闷:${x.rule}`, count: 1 })),
      ...hits.risks.map((x) => ({ name: `风险:${x.risk}`, count: 1 })),
      ...eventCandidates.slice(0, 8).map((x) => ({ name: `事件:${x.rule_candidate}:${x.status}`, count: 1 })),
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
        chapter_title_scan: chapterTitleScan,
      },
      thunder_hits: uniqueBy(hits.thunder, (x) => `${x.rule}|${x.anchor}`),
      depression_hits: uniqueBy(hits.depression, (x) => `${x.rule}|${x.anchor}`),
      risk_unconfirmed: uniqueBy(hits.risks, (x) => `${x.risk}|${x.current_evidence}`),
      event_candidates: eventCandidates,
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
  const formatted = formatScriptError(err);
  console.error(formatted.message);
  if (formatted.hint) console.error(formatted.hint);
  process.exit(getExitCode(err));
}
