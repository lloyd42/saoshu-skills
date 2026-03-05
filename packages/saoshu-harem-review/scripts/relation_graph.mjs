#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node relation_graph.mjs --report <merged-report.json> --output <relation-graph.html> [--review-dir <review-pack-dir>] [--top-chars 20] [--top-signals 16] [--min-edge-weight 2] [--max-links 220] [--min-name-freq 2]");
}

function parseArgs(argv) {
  const out = {
    report: "",
    output: "",
    reviewDir: "",
    topChars: 20,
    topSignals: 16,
    minEdgeWeight: 2,
    maxLinks: 220,
    minNameFreq: 2,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--report") out.report = v, i++;
    else if (k === "--output") out.output = v, i++;
    else if (k === "--review-dir") out.reviewDir = v, i++;
    else if (k === "--top-chars") out.topChars = Number(v), i++;
    else if (k === "--top-signals") out.topSignals = Number(v), i++;
    else if (k === "--min-edge-weight") out.minEdgeWeight = Number(v), i++;
    else if (k === "--max-links") out.maxLinks = Number(v), i++;
    else if (k === "--min-name-freq") out.minNameFreq = Number(v), i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.report || !out.output) throw new Error("--report and --output are required");
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

const SURNAME = new Set("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹喻柏窦章云苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费岑薛雷贺倪汤殷罗毕郝邬安常乐于傅卞齐康伍余元顾孟黄穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万柯管卢莫房裘缪解应宗丁宣邓单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊惠甄曲家封储靳汲邴松井段富巫乌焦巴弓牧山车侯班仰秋仲伊宫宁仇栾甘厉戎祖武符刘景詹束龙叶司黎薄印宿白蒲邰从鄂索籍赖卓蔺屠蒙池乔阴郁胥苍双闻莘翟谭贡劳姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀浦尚温别庄晏柴瞿阎慕连茹习艾鱼容向古易慎戈廖庾居衡步都耿满弘匡国文寇广阙东欧沃利蔚越隆师巩聂晁敖融冷辛阚简饶曾沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖桓".split(""));
const IGNORE = new Set(["当前", "证据", "章节", "关键词", "复核", "结论", "规则", "需要", "自动", "风险词", "情节", "上下文", "检测到", "构成", "该雷", "片段", "未知章节", "主角", "女主", "男主", "角色"]);

function normalizeName(name) {
  let n = String(name || "").trim();
  if (!n) return "";
  n = n.replace(/[“”"'`~!@#$%^&*()_\-+=\[\]{}|\\;:,.<>/?，。！？；：、（）【】《》]/g, "");
  n = n.replace(/(说|道|问|笑|看|想|听|忙|来|去|着|了|呢|吗|吧|呀|啊)$/g, "");
  if (n.length < 2 || n.length > 4) return "";
  return n;
}

function parseReviewPack(reviewDir) {
  const abs = path.resolve(reviewDir || "");
  if (!abs || !fs.existsSync(abs)) return [];
  const files = fs.readdirSync(abs).filter((f) => /-review\.md$/i.test(f));
  const out = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(abs, f), "utf8");
    const lines = text.split(/\r?\n/);
    let signal = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const m = /^###\s*\[[^\]]+\]\s*(.+)$/.exec(line);
      if (m) {
        signal = String(m[1] || "").trim();
        continue;
      }
      if (/^-\s*证据\d+：/.test(line)) {
        const next = (lines[i + 1] || "").trim();
        if (next && !next.startsWith("-")) out.push({ signal, snippet: next });
      }
    }
  }
  return out;
}

function extractNames(text, seedNames = new Set()) {
  const names = new Set();
  const ms = text.match(/[\u4e00-\u9fa5]{2,3}/g) || [];
  for (const n of ms) {
    const cleaned = normalizeName(n);
    if (!cleaned) continue;
    if (seedNames.has(cleaned)) {
      names.add(cleaned);
      continue;
    }
    if (!SURNAME.has(cleaned[0])) continue;
    if (IGNORE.has(cleaned)) continue;
    if (/[的了着这那你我他她它们]/.test(cleaned)) continue;
    names.add(cleaned);
  }
  return [...names];
}

function pruneLinks(links, minEdgeWeight, maxLinks) {
  const keep = [];
  for (const l of links) {
    const isMcp = /metadata_summary\.relationships/.test(String(l.evidence || ""));
    if (isMcp || Number(l.weight || 0) >= minEdgeWeight) keep.push(l);
  }
  keep.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  if (maxLinks > 0 && keep.length > maxLinks) return keep.slice(0, maxLinks);
  return keep;
}

function buildGraph(report, opts) {
  const { topChars, topSignals, reviewDir, minEdgeWeight, maxLinks, minNameFreq } = opts;
  const chars = arr(report.metadata_summary?.top_characters).slice(0, topChars);
  const signals = arr(report.metadata_summary?.top_signals).slice(0, topSignals);
  const protagonist = normalizeName(chars[0]?.name || "") || "主角";

  const seedNames = new Set(chars.map((x) => normalizeName(x?.name || "")).filter(Boolean));
  for (const r of arr(report.metadata_summary?.relationships)) {
    const a = normalizeName(r?.from || "");
    const b = normalizeName(r?.to || "");
    if (a) seedNames.add(a);
    if (b) seedNames.add(b);
  }

  const nodes = [];
  const edgeMap = new Map();
  const byId = new Map();
  let idSeq = 1;
  const addNode = (label, type, value = 1, meta = {}) => {
    const key = `${type}:${label}`;
    if (byId.has(key)) return byId.get(key);
    const node = { id: `N${idSeq++}`, label, type, value, ...meta };
    byId.set(key, node);
    nodes.push(node);
    return node;
  };

  const addEdge = (source, target, relation, evidence, weight = 1, sourceType = "heuristic") => {
    const key = `${source}|${target}|${relation}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { source, target, relation, evidence, weight: 0, source_type: sourceType });
    edgeMap.get(key).weight += Number(weight || 1);
  };

  const hero = addNode(protagonist, "character", Number(chars[0]?.count || 1), { role: "protagonist" });
  for (const c of chars.slice(1)) {
    const name = normalizeName(c.name || "");
    if (!name) continue;
    const n = addNode(name, "character", Number(c.count || 1), { role: "candidate" });
    addEdge(hero.id, n.id, "同场高频（启发式）", "来自 metadata_summary.top_characters", Number(c.count || 1), "heuristic");
  }
  for (const s of signals) {
    const n = addNode(String(s.name || "风险信号"), "signal", Number(s.count || 1), { role: "signal" });
    addEdge(hero.id, n.id, "信号关联（启发式）", "来自 metadata_summary.top_signals", Number(s.count || 1), "heuristic");
  }

  const reviewItems = reviewDir ? parseReviewPack(reviewDir) : [];
  const hotCharSet = new Set(chars.map((x) => normalizeName(x.name || "")).filter(Boolean));
  const reviewNameCount = new Map();
  for (const it of reviewItems) {
    for (const n of extractNames(it.snippet || "", seedNames)) {
      reviewNameCount.set(n, (reviewNameCount.get(n) || 0) + 1);
    }
  }
  const allowedReviewNames = new Set(
    [...reviewNameCount.entries()]
      .filter(([name, c]) => c >= minNameFreq || hotCharSet.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([name]) => name)
  );
  for (const it of reviewItems) {
    if (!it.signal || !it.snippet) continue;
    const signalNode = addNode(it.signal, "signal", 1, { role: "review_signal" });
    const names = extractNames(it.snippet, seedNames).filter((n) => allowedReviewNames.has(n));
    for (const name of names) {
      const n = addNode(name, "character", Number(reviewNameCount.get(name) || 1), { role: "review_candidate" });
      addEdge(hero.id, n.id, "复核片段共现", "review-pack", 1, "review");
      addEdge(n.id, signalNode.id, "片段命中信号", "review-pack", 1, "review");
    }
  }

  const rels = arr(report.metadata_summary?.relationships);
  for (const r of rels) {
    const from = normalizeName(String(r.from || "")) || "未知A";
    const to = normalizeName(String(r.to || "")) || "未知B";
    const a = addNode(from, "character", 1, { role: "mcp" });
    const b = addNode(to, "character", 1, { role: "mcp" });
    addEdge(a.id, b.id, String(r.type || "关系"), String(r.evidence || "metadata_summary.relationships"), Number(r.weight || 1), "mcp");
  }

  const allLinks = [...edgeMap.values()];
  const links = pruneLinks(allLinks, minEdgeWeight, maxLinks);

  return {
    title: report.novel?.title || "关系图",
    subtitle: `作者：${report.novel?.author || "-"} ｜ 结论：${report.overall?.verdict || "-"}`,
    mode: rels.length ? (reviewItems.length ? "mcp+review+heuristic" : "mcp+heuristic") : (reviewItems.length ? "review+heuristic" : "heuristic_only"),
    disclaimer: "该图用于辅助理解，不等于实锤关系结论；请结合原文和复核证据。",
    nodes,
    links,
    stats: {
      raw_links: allLinks.length,
      rendered_links: links.length,
      min_edge_weight: minEdgeWeight,
      max_links: maxLinks,
      min_name_freq: minNameFreq,
    },
  };
}

function renderHtml(graph) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(graph.title)} - 角色关系图</title>
<style>
body{margin:0;font:14px/1.45 "Noto Sans SC","PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;background:#f4f1ea;color:#222}
.wrap{max-width:1200px;margin:18px auto;padding:0 14px}
.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:10px}
h1{margin:0 0 6px}
.muted{color:#666}
.legend{display:flex;gap:10px;flex-wrap:wrap}
.chip{display:inline-block;padding:4px 8px;border-radius:999px;background:#f7ead8}
#cv{width:100%;height:720px;border:1px solid #e7dccd;border-radius:10px;background:#fff}
.tools{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
label{display:inline-flex;align-items:center;gap:6px}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${esc(graph.title)} 角色关系图</h1>
    <div>${esc(graph.subtitle)}</div>
    <div class="muted">模式：${esc(graph.mode)} ｜ ${esc(graph.disclaimer)}</div>
    <div class="muted">边数：${Number(graph.stats?.rendered_links || 0)} / 原始 ${Number(graph.stats?.raw_links || 0)}（最小权重=${Number(graph.stats?.min_edge_weight || 0)}, 名字最小频次=${Number(graph.stats?.min_name_freq || 0)}）</div>
    <div class="legend" style="margin-top:8px">
      <span class="chip">蓝色：角色</span>
      <span class="chip">橙色：风险/剧情信号</span>
      <span class="chip">连线越粗：权重越高</span>
    </div>
    <div class="tools">
      <label><input type="checkbox" id="show-char-char" checked /> 角色-角色</label>
      <label><input type="checkbox" id="show-char-signal" checked /> 角色-信号</label>
      <label>前端最小权重 <input type="range" id="min-weight" min="1" max="10" value="1" /></label>
      <span id="min-weight-value" class="muted">1</span>
    </div>
  </div>
  <canvas id="cv"></canvas>
</div>
<script>
const graph = ${JSON.stringify(graph)};
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const DPR = window.devicePixelRatio || 1;
function resize() {
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  cv.width = Math.floor(w * DPR);
  cv.height = Math.floor(h * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
resize();
window.addEventListener("resize", resize);

const nodes = graph.nodes.map((n, i) => ({
  ...n,
  x: 80 + (i % 8) * 130 + Math.random() * 20,
  y: 90 + Math.floor(i / 8) * 100 + Math.random() * 20,
  vx: 0, vy: 0,
}));
const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
const links = graph.links.map((e) => ({ ...e, a: byId[e.source], b: byId[e.target] })).filter((e) => e.a && e.b);
const showCharChar = document.getElementById("show-char-char");
const showCharSignal = document.getElementById("show-char-signal");
const minWeight = document.getElementById("min-weight");
const minWeightValue = document.getElementById("min-weight-value");
minWeight.addEventListener("input", () => { minWeightValue.textContent = String(minWeight.value); });

function edgeKind(e){
  const a = e.a.type, b = e.b.type;
  if (a === "character" && b === "character") return "char-char";
  return "char-signal";
}
function edgeVisible(e){
  const kind = edgeKind(e);
  if (kind === "char-char" && !showCharChar.checked) return false;
  if (kind === "char-signal" && !showCharSignal.checked) return false;
  if (Number(e.weight || 0) < Number(minWeight.value || 1)) return false;
  return true;
}
function nodeColor(n){
  if(n.type === "signal") return "#d08a3c";
  if(n.role === "protagonist") return "#2a73c5";
  return "#4a93dd";
}
function nodeRadius(n){ return Math.max(8, Math.min(24, 6 + Math.log2((n.value || 1) + 1) * 4)); }
function step() {
  const w = cv.clientWidth, h = cv.clientHeight;
  for (const e of links.filter(edgeVisible)) {
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
    const d = Math.sqrt(dx*dx + dy*dy) + 0.001;
    const target = 120;
    const k = 0.004 * (Number(e.weight || 1) + 1);
    const f = (d - target) * k;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    e.a.vx += fx; e.a.vy += fy;
    e.b.vx -= fx; e.b.vy -= fy;
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx*dx + dy*dy + 0.01;
      const rep = 1300 / d2;
      a.vx -= dx * rep * 0.0002; a.vy -= dy * rep * 0.0002;
      b.vx += dx * rep * 0.0002; b.vy += dy * rep * 0.0002;
    }
  }
  for (const n of nodes) {
    n.vx *= 0.92; n.vy *= 0.92;
    n.x += n.vx; n.y += n.vy;
    const r = nodeRadius(n);
    n.x = Math.max(r + 4, Math.min(w - r - 4, n.x));
    n.y = Math.max(r + 4, Math.min(h - r - 4, n.y));
  }
}
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  ctx.clearRect(0,0,w,h);
  for (const e of links.filter(edgeVisible)) {
    ctx.strokeStyle = "#d9c8b1";
    ctx.lineWidth = Math.max(1, Math.min(6, Math.log2((e.weight || 1) + 1)));
    ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
  }
  for (const n of nodes) {
    const r = nodeRadius(n);
    ctx.fillStyle = nodeColor(n);
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "12px 'Noto Sans SC','PingFang SC','Microsoft YaHei',Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(n.label, n.x, n.y + r + 14);
  }
}
function tick(){
  step();
  draw();
  requestAnimationFrame(tick);
}
tick();
</script>
</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const report = readJson(args.report);
  const graph = buildGraph(report, {
    topChars: args.topChars,
    topSignals: args.topSignals,
    reviewDir: args.reviewDir,
    minEdgeWeight: args.minEdgeWeight,
    maxLinks: args.maxLinks,
    minNameFreq: args.minNameFreq,
  });
  const out = path.resolve(args.output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, renderHtml(graph), "utf8");
  console.log(`Relation graph: ${out}`);
  console.log(`Nodes: ${graph.nodes.length}, Links: ${graph.links.length}/${graph.stats.raw_links}, Mode: ${graph.mode}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
