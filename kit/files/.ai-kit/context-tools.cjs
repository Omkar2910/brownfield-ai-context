#!/usr/bin/env node
/*
 * context-tools.cjs: keeps AI-agent context honest. One file, Node 18+, no dependencies.
 * Works on Windows, macOS and Linux, with GitHub Copilot, Claude Code, OpenAI Codex and in CI.
 *
 * Commands you run yourself (or in CI / git hooks):
 *   check   [--base <git-ref>] [--staged] [--strict]
 *           Broken anchors (error), stale context and size budget (warnings). Exit 1 on errors, or on
 *           warnings with --strict. --staged checks what is about to be committed (used by pre-commit).
 *   status                         Short summary: kit version, context files, anchors, always-on size, hooks.
 *   doctor                         Is the kit wired up? Hook files, git hook, harness settings, last hook runs.
 *   readiness [--json]             Context readiness score (0-100) over 12 dimensions.
 *   pages-for <file> [<file> ...]  Context lines and pages that describe these files (anchored to them).
 *   migrate [--dry-run]            Upgrade context pages to the current kit format (no AI, no tokens).
 *   schema-import <schema.json> [--out docs/context/data] [--dry-run]
 *                                  Build or refresh one page per table from a tbls schema.json. Only the
 *                                  generated part of each page is replaced; what people wrote is kept.
 *   ci [--base <git-ref>] [--strict]  The pull request check: check + story check + readiness summary.
 *   mcp                            MCP server on stdio, so any MCP-capable agent can query the context.
 *
 * Agent hooks (read the event JSON on stdin, print one JSON object, never fail the agent):
 *   session-start   Adds a short "context health" note when a chat session starts.
 *   post-edit       After the agent edits a file, names any context line anchored to that file.
 *   stop            When the agent tries to finish: if files IT edited this session broke an anchor or touch
 *                   anchored code whose context line it did not revisit, blocks ONCE with the list.
 *   guard           Refuses edits outside context files (used only for the context-steward agent).
 *   Every hook run is logged in <git dir>/ai-kit/hook-log.jsonl (never committed); "doctor" reads it.
 *
 * Options: --repo <dir> (default: git root of the current folder), --format copilot|claude (default: auto).
 * Anchors: write [anchor: <path>] at the end of any context line that depends on code. <path> can be a
 *   file, a folder (src/main/resources/db/migration/), a glob (with * or **) or several of
 *   these separated by commas. Backticks, #L12 / :12 line suffixes and Windows backslashes are fine.
 *   Paths outside the repo (../product-context/...) and repo-name:path anchors are not checked here.
 * Page metadata: YAML frontmatter in the shape of the Open Knowledge Format: type, status, verified (list of
 *   { by, at }), generated, plus the kit's dimension and owner. The 1.x "> Dimension: ... · Status: ..." line
 *   is still read; "migrate" converts it.
 * Budgets (env vars): CONTEXT_MAX_AGENTS_LINES (default 150), CONTEXT_ALWAYS_ON_TOKENS (default 2000).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const KIT_TOOL = '.ai-kit/context-tools.cjs';
const argv = process.argv.slice(2);
const command = argv[0];
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = name => argv.includes(name);
let format = opt('--format') || 'auto';

const MAX_AGENTS_LINES = Number(process.env.CONTEXT_MAX_AGENTS_LINES || 150);
const ALWAYS_ON_TOKENS = Number(process.env.CONTEXT_ALWAYS_ON_TOKENS || 2000);

// Files that count as "context". Anything else is code or docs for humans.
const CONTEXT_GLOBS = [
  'AGENTS.md', '**/AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md',
  '.github/instructions/**/*.md', '.claude/rules/**/*.md', 'docs/context/**/*.md',
  'context/**/*.md',
];
// What the context-steward agent may edit.
const STEWARD_GLOBS = CONTEXT_GLOBS.concat([
  '.github/skills/**', '.claude/skills/**', '.agents/skills/**', '.github/agents/**', '.claude/agents/**',
  'openspec/**', 'CHANGELOG.md', 'docs/context/**',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', 'out', '.angular', 'coverage', '.gradle', '.idea', '.vscode']);
const OLD_TOOL_PATHS = ['.github/hooks/scripts/context-tools.cjs', '.claude/hooks/context-tools.cjs'];

// ---------------------------------------------------------------- helpers
const toPosix = p => p.split(path.sep).join('/').replace(/\\/g, '/');
const escapeRe = s => s.replace(/[.+^$()|[\]\\]/g, '\\$&');
const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) { re += '\\{'; continue; }
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')';
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp('^' + re + '$');
}
const CONTEXT_RES = CONTEXT_GLOBS.map(globToRegex);
const STEWARD_RES = STEWARD_GLOBS.map(globToRegex);
const isContextFile = rel => CONTEXT_RES.some(r => r.test(rel));

function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  } catch { return null; }
}

function resolveRepo(input) {
  const start = opt('--repo') || (input && input.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const top = git(start, ['rev-parse', '--show-toplevel']);
  return top ? path.resolve(top.trim()) : path.resolve(start);
}
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };

function walk(dir, root, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), root, out); }
    else out.push(toPosix(path.relative(root, path.join(dir, e.name))));
  }
  return out;
}

const STAGED = flag('--staged');
// All files that exist now (tracked + untracked, minus deleted), repo-relative, forward slashes.
// With --staged: the files in the commit being made (the index), not the working tree.
function listFiles(repo) {
  if (STAGED) { const idx = git(repo, ['ls-files', '-z', '--cached']); if (idx !== null) return idx.split('\0').filter(Boolean); }
  const listed = git(repo, ['ls-files', '-z', '-co', '--exclude-standard']);
  if (listed === null) return walk(repo, repo, []);
  const deleted = new Set((git(repo, ['ls-files', '-z', '-d']) || '').split('\0').filter(Boolean));
  return [...new Set(listed.split('\0').filter(Boolean))].filter(f => !deleted.has(f));
}

// Files changed in the working tree (and since base, if given).
function changedFiles(repo, base) {
  const out = new Set();
  if (STAGED) {
    (git(repo, ['diff', '--cached', '--name-only', '-z']) || '').split('\0').filter(Boolean).forEach(f => out.add(toPosix(f)));
    return [...out];
  }
  const status = git(repo, ['status', '--porcelain=v1', '-z', '-uall']);
  if (status) {
    const parts = status.split('\0');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      if (!entry) continue;
      const code = entry.slice(0, 2);
      out.add(entry.slice(3));
      if (code[0] === 'R' || code[0] === 'C') out.add(parts[++i]); // old name follows a rename
    }
  }
  if (base) {
    const diff = git(repo, ['diff', '--name-only', '-z', base + '...HEAD']);
    if (diff) diff.split('\0').filter(Boolean).forEach(f => out.add(f));
  }
  return [...out].map(toPosix);
}

function readText(repo, rel) {
  if (STAGED) { const t = git(repo, ['show', ':' + rel]); if (t !== null) return t; }
  return fs.readFileSync(path.join(repo, rel), 'utf8');
}

// One anchor can hold several paths. Accepts files, folders (trailing / or an existing folder), globs,
// backticks or quotes, #L12 or :12 suffixes and backslashes. Returns [{ pattern, re }] to check.
function anchorPatterns(repo, raw) {
  const out = [];
  for (let p of raw.split(',')) {
    p = p.trim().replace(/^[`'"]+|[`'"]+$/g, '').replace(/\\/g, '/').replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '').replace(/^\.\//, '').trim();
    if (!p || /[<>]/.test(p)) continue;                 // empty or a template placeholder such as <path>
    if (p.startsWith('../') || path.isAbsolute(p)) continue; // outside this repo (e.g. the product hub): not checked
    if (/^[A-Za-z0-9_.-]{2,}:[^/\\]/.test(p)) continue;     // repo-name:path points into another repo: the hub checks it
    let glob = p;
    if (p.endsWith('/')) glob = p + '**';
    else if (!/[*?{]/.test(p)) { try { if (fs.statSync(path.join(repo, p)).isDirectory()) glob = p + '/**'; } catch { /* file or missing */ } }
    out.push({ pattern: p, re: globToRegex(glob) });
  }
  return out;
}

function readContext(repo, files) {
  const contextFiles = files.filter(isContextFile);
  const anchors = [];
  for (const cf of contextFiles) {
    let text = '';
    try { text = readText(repo, cf); } catch { continue; }
    text.split(/\r?\n/).forEach((line, idx) => {
      for (const m of line.matchAll(/\[anchor:\s*([^\]]+)\]/g)) {
        for (const { pattern, re } of anchorPatterns(repo, m[1])) {
          anchors.push({ file: cf, line: idx + 1, text: line.trim().slice(0, 140), pattern, re });
        }
      }
    });
  }
  return { contextFiles, anchors };
}

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return m ? m[1] : '';
}
const fmGet = (fm, k) => { const m = new RegExp('^' + k + ':[ \\t]*(.*)$', 'm').exec(fm); return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : ''; };

function alwaysOn(repo, contextFiles) {
  const items = [];
  for (const f of ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md']) {
    try { const t = fs.readFileSync(path.join(repo, f), 'utf8'); items.push({ file: f, lines: t.split(/\r?\n/).length, tokens: Math.round(t.length / 4) }); } catch { /* absent */ }
  }
  for (const f of contextFiles.filter(c => c.startsWith('.github/instructions/') || c.startsWith('.claude/rules/'))) {
    let t = ''; try { t = readText(repo, f); } catch { continue; }
    const fm = frontmatter(t);
    const everywhere = f.startsWith('.claude/')
      ? !/^paths:/m.test(fm)                                        // Claude rules without paths: load always
      : /applyTo:\s*['"]?\*\*(\/\*(\.\*)?)?['"]?\s*$/m.test(fm);   // applyTo: '**', '**/*' or '**/*.*'
    if (everywhere) items.push({ file: f, lines: t.split(/\r?\n/).length, tokens: Math.round(t.length / 4) });
  }
  // Each tool loads only its own rule folder, so count the larger of the two, not both.
  const sum = pred => items.filter(pred).reduce((s, i) => s + i.tokens, 0);
  const base = sum(i => !i.file.startsWith('.github/instructions/') && !i.file.startsWith('.claude/rules/'));
  return { items, tokens: base + Math.max(sum(i => i.file.startsWith('.github/instructions/')), sum(i => i.file.startsWith('.claude/rules/'))) };
}

function analyse(repo, base) {
  const files = listFiles(repo);
  const ctx = readContext(repo, files);
  const changed = changedFiles(repo, base);
  const broken = ctx.anchors.filter(a => !files.some(f => a.re.test(f)));
  const stale = [];
  for (const a of ctx.anchors) {
    if (changed.includes(a.file)) continue;
    const hit = changed.find(c => a.re.test(c));
    if (hit) stale.push({ ...a, hit });
  }
  const agents = alwaysOn(repo, ctx.contextFiles);
  const agentsMd = agents.items.find(i => i.file === 'AGENTS.md');
  return { files, ctx, changed, broken, stale, agents, agentsMd };
}

// Kit stamp: .ai-kit/kit.json (2.x) or .github/ai-kit.json / .claude/ai-kit.json (1.x).
function kitStamp(repo) {
  for (const f of ['.ai-kit/kit.json', '.github/ai-kit.json', '.claude/ai-kit.json']) {
    const j = readJson(path.join(repo, f));
    if (j) return { ...j, _file: f };
  }
  return null;
}
const toolCmd = 'node ' + KIT_TOOL;

// ---------------------------------------------------------------- check
function runCheck(repo, { base, strict } = {}) {
  const errors = [], warnings = [];
  if (base && git(repo, ['rev-parse', '--verify', '--quiet', base + '^{commit}']) === null) {
    return { fatal: `--base "${base}" is not a branch or commit here. Try "git fetch", or use origin/main, origin/master or origin/develop.` };
  }
  const a = analyse(repo, base);
  for (const b of a.broken) errors.push(`${b.file}:${b.line}  anchor points at a file that does not exist: ${b.pattern}`);
  for (const s of a.stale) warnings.push(`${s.file}:${s.line}  anchored code changed (${s.hit}) but this context file did not: is the line still true?`);
  if (!a.agentsMd) warnings.push('No AGENTS.md at the repo root. Run /context-create to create one.');
  else if (a.agentsMd.lines > MAX_AGENTS_LINES) warnings.push(`AGENTS.md has ${a.agentsMd.lines} lines (budget ${MAX_AGENTS_LINES}). Move detail into docs/context/ or a skill.`);
  const o = orgState(repo);
  if (o && o.outdated.length) warnings.push(`Org rules are older than your local ${o.name} clone (${o.outdated.join(', ')}). Re-sync: node <kit>/kit/install.mjs . --org ${o.path}`);
  if (o && o.editedHere.length) warnings.push(`Org rules edited in this repo (${o.editedHere.join(', ')}). Change them in the org context repo instead; the next sync replaces local edits.`);
  if (a.agents.tokens > ALWAYS_ON_TOKENS) warnings.push(`Always-on context is about ${a.agents.tokens} tokens (budget ${ALWAYS_ON_TOKENS}): ${a.agents.items.map(i => i.file).join(', ')}.`);
  const old = oldFormatPages(repo, a.ctx.contextFiles);
  if (old.length) warnings.push(`${old.length} page(s) use the 1.x status line (${old.slice(0, 3).join(', ')}${old.length > 3 ? ' …' : ''}). Run: ${toolCmd} migrate`);
  return { a, errors, warnings, failed: errors.length > 0 || (strict && warnings.length > 0) };
}
function printCheck(repo, r, { base } = {}) {
  const out = [];
  if (r.fatal) { out.push(`Context check: ${r.fatal}`); return out; }
  out.push(`Context check: ${path.basename(repo)}${base ? ` (changes since ${base})` : ''}${STAGED ? ' (staged for commit)' : ''}`);
  out.push(`  ${r.a.ctx.contextFiles.length} context files, ${r.a.ctx.anchors.length} anchors, always-on ≈ ${r.a.agents.tokens} tokens`);
  r.errors.forEach(e => out.push('  ERROR  ' + e));
  r.warnings.forEach(w => out.push('  WARN   ' + w));
  out.push(`  Result: ${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
  return out;
}
function cmdCheck() {
  const repo = resolveRepo({});
  const base = opt('--base');
  const r = runCheck(repo, { base, strict: flag('--strict') });
  console.log(printCheck(repo, r, { base }).join('\n'));
  process.exitCode = r.fatal ? 2 : r.failed ? 1 : 0;
}

// ---------------------------------------------------------------- organisation layer
// Rules synced from the org context repo by install.mjs --org; recorded in the kit stamp.
const ORG_DIRS = ['.github/instructions/org/', '.claude/rules/org/'];
const isOrgRule = rel => ORG_DIRS.some(d => rel.startsWith(d));
function orgState(repo) {
  const stamp = kitStamp(repo);
  const org = stamp && stamp.org;
  if (!org) return null;
  const h = s => sha1(s).slice(0, 12);
  const editedHere = [], outdated = [];
  const dirs = org.rulesDirs || [org.rulesDir];
  for (const [f, rec] of Object.entries(org.files || {})) {
    for (const d of dirs) {
      const copies = rec.copies || { [d]: rec.copy };
      try { if (h(fs.readFileSync(path.join(repo, d, f), 'utf8')) !== copies[d]) editedHere.push(`${d}/${f}`); } catch { editedHere.push(`${d}/${f} (missing)`); }
    }
  }
  const orgDir = org.path ? path.resolve(repo, org.path) : null;
  let clone = false;
  if (orgDir && fs.existsSync(path.join(orgDir, 'rules'))) {
    clone = true;
    const now = fs.readdirSync(path.join(orgDir, 'rules')).filter(n => n.endsWith('.md'));
    for (const f of now) {
      const src = fs.readFileSync(path.join(orgDir, 'rules', f), 'utf8').replace(/\r\n/g, '\n');
      if (!org.files[f] || h(src) !== org.files[f].source) outdated.push(f);
    }
    for (const f of Object.keys(org.files || {})) if (!now.includes(f)) outdated.push(f + ' (removed in org)');
  }
  return { ...org, count: Object.keys(org.files || {}).length, editedHere, outdated, clone };
}
function orgLine(o) {
  if (!o) return null;
  let s = `Org rules: ${o.count} file(s) from ${o.name} @ ${o.commit} (synced ${o.synced}).`;
  if (o.outdated.length) s += ` Out of date with your local ${o.name} clone: ${o.outdated.join(', ')}.`;
  return s;
}

function activeChanges(repo) {
  try {
    return fs.readdirSync(path.join(repo, 'openspec', 'changes'), { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'archive').map(d => d.name);
  } catch { return []; }
}

// Graphify code map: present? built from which commit? (read from its report, no Graphify needed)
function graphState(repo) {
  const graph = path.join(repo, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graph)) return null;
  let built = null;
  try { const m = /Built from commit:\s*`([0-9a-f]+)`/.exec(fs.readFileSync(path.join(repo, 'graphify-out', 'GRAPH_REPORT.md'), 'utf8')); if (m) built = m[1]; } catch { /* no report */ }
  const head = (git(repo, ['rev-parse', 'HEAD']) || '').trim();
  const stale = built && head && !head.startsWith(built);
  return { built, head: head.slice(0, 8), stale };
}
function graphLine(repo) {
  const g = graphState(repo);
  if (!g) return null;
  return g.stale
    ? `Code map (Graphify) is older than HEAD (built ${g.built}, now ${g.head}): run "graphify update ." before relying on it.`
    : 'Code map (Graphify) available: use the graphify MCP tools (query_graph, get_neighbors, shortest_path) or "graphify query/affected/path" before reading many files.';
}

function statusLines(repo) {
  const a = analyse(repo);
  const out = [];
  const st = kitStamp(repo);
  out.push(`Context status: ${path.basename(repo)}${st ? `  (kit ${st.version}${st.tools ? ', ' + [].concat(st.tools).join('+') : st.tool ? ', ' + st.tool : ''})` : ''}`);
  out.push(`  Context files (${a.ctx.contextFiles.length}): ${a.ctx.contextFiles.join(', ') || 'none'}`);
  out.push(`  Anchored facts: ${a.ctx.anchors.length} (${a.broken.length} broken)`);
  out.push(`  Always-on: ≈ ${a.agents.tokens} tokens of ${ALWAYS_ON_TOKENS} budget`);
  a.agents.items.forEach(i => out.push(`    ${i.file}: ${i.lines} lines, ≈ ${i.tokens} tokens`));
  const active = activeChanges(repo);
  out.push(`  Active OpenSpec changes: ${active.length ? active.join(', ') : 'none'}`);
  const g = graphState(repo);
  out.push(`  Code map (Graphify): ${!g ? 'not built' : g.stale ? `stale (built ${g.built}, HEAD ${g.head}): run graphify update .` : `up to date${g.built ? ` (${g.built})` : ''}`}`);
  out.push(`  ${orgLine(orgState(repo)) || 'Org rules: none synced (install.mjs <repo> --org <org-context> adds them)'}`);
  const last = lastHookRuns(repo);
  out.push(`  Agent hooks: ${Object.keys(last).length ? Object.entries(last).map(([e, r]) => `${e} ${ago(r.t)} (${r.harness})`).join(', ') : `no run recorded in this clone (run: ${toolCmd} doctor)`}`);
  return out;
}
function cmdStatus() { console.log(statusLines(resolveRepo({})).join('\n')); }

// ---------------------------------------------------------------- hook log
function gitDir(repo) {
  const d = git(repo, ['rev-parse', '--absolute-git-dir']);
  return d ? d.trim() : null;
}
function hookLogPath(repo) { const d = gitDir(repo); return d ? path.join(d, 'ai-kit', 'hook-log.jsonl') : null; }
function logHook(repo, entry) {
  const p = hookLogPath(repo);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');
    const st = fs.statSync(p);
    if (st.size > 200 * 1024) { const lines = fs.readFileSync(p, 'utf8').trim().split('\n'); fs.writeFileSync(p, lines.slice(-400).join('\n') + '\n'); }
  } catch { /* never fail a hook */ }
}
function readHookLog(repo) {
  const p = hookLogPath(repo);
  if (!p) return [];
  try { return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
function lastHookRuns(repo) {
  const last = {};
  for (const e of readHookLog(repo)) if (e.event && e.event !== 'self-test') last[e.event] = e;
  return last;
}
function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
}

// ---------------------------------------------------------------- hooks
function readStdin() {
  try { const raw = fs.readFileSync(0, 'utf8'); return raw.trim() ? JSON.parse(raw) : {}; } catch { return {}; }
}
const emit = obj => process.stdout.write(JSON.stringify(obj));
// additionalContext goes to the model. systemMessage is shown to the person where the harness supports it
// (Claude Code does); harnesses that do not know the field ignore it.
function addContext(event, text, userMessage) {
  const extra = userMessage ? { systemMessage: userMessage } : {};
  if (format === 'copilot') emit({ additionalContext: text, ...extra });
  else emit({ hookSpecificOutput: { hookEventName: event, additionalContext: text }, ...extra });
}

// Collect every file path mentioned in a tool call, whatever the tool calls the field.
function editedPaths(input) {
  const found = [];
  const visit = (v, depth) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') {
      for (const m of v.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) found.push(m[1].trim()); // apply_patch payloads
      return;
    }
    if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return; }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && /^(file_?path|filePath|path|notebook_path|filename|uri)$/i.test(k)) found.push(val.replace(/^file:\/\//, ''));
        else visit(val, depth + 1);
      }
    }
  };
  let args = input.tool_input !== undefined ? input.tool_input : input.toolArgs;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { /* keep string */ } }
  visit(args, 0);
  return [...new Set(found)];
}
const looksLikeEdit = name => !name || /edit|write|create|replace|patch|insert|notebook/i.test(name);
function relTo(repo, p) {
  const abs = path.isAbsolute(p) ? p : path.join(repo, p);
  return toPosix(path.relative(repo, abs));
}
const sessionId = input => String(input.session_id || input.sessionId || 'no-session');

// When a repo is set up for several tools, one harness can read two hook files (VS Code's Copilot harness
// also reads .claude/settings.json). The second identical call within a few seconds does nothing.
function duplicateCall(event, input) {
  const key = sha1([event, sessionId(input), JSON.stringify(editedPaths(input)), input.cwd || ''].join('|')).slice(0, 16);
  const marker = path.join(os.tmpdir(), `context-tools-dedupe-${key}`);
  try {
    const st = fs.statSync(marker);
    if (Date.now() - st.mtimeMs < 5000) return true;
  } catch { /* first call */ }
  try { fs.writeFileSync(marker, String(Date.now())); } catch { /* ignore */ }
  return false;
}

function hookSessionStart(input) {
  const repo = resolveRepo(input);
  const a = analyse(repo);
  const lines = [`Context health for ${path.basename(repo)}: ${a.ctx.contextFiles.length} context files, ${a.ctx.anchors.length} anchored facts, always-on ≈ ${a.agents.tokens} tokens.`];
  if (a.broken.length) lines.push(`Broken anchors: ${a.broken.slice(0, 3).map(b => `${b.file}:${b.line} -> ${b.pattern}`).join('; ')}${a.broken.length > 3 ? ' …' : ''}`);
  const active = activeChanges(repo);
  if (active.length) lines.push(`Active OpenSpec changes: ${active.join(', ')}.`);
  const gl = graphLine(repo);
  if (gl) lines.push(gl);
  const ol = orgLine(orgState(repo));
  if (ol) lines.push(ol);
  lines.push('Context files describe this code; when an edit changes what a context line says, the line is updated in the same change.');
  const user = `AI context kit: ${a.ctx.contextFiles.length} context files, ${a.ctx.anchors.length} anchors, ${a.broken.length} broken${active.length ? `, active change: ${active.join(', ')}` : ''}.`;
  addContext('SessionStart', lines.join('\n'), user);
  return { notes: lines.length, broken: a.broken.length };
}

// The git repository a file belongs to. In a multi-root VS Code window (UI + service side by side)
// an edited file can live in a different repo from the one the chat session started in.
function repoOfFile(abs) {
  let dir = path.dirname(abs);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir); // new file in a new folder
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  return top ? path.resolve(top.trim()) : null;
}

// Files the agent edited in this chat session, remembered between hook calls (in the temp folder,
// never in the repo) so the stop hook judges the agent's own edits, not the developer's.
function sessionFile(input) {
  return path.join(os.tmpdir(), 'context-tools-session-' + sha1(sessionId(input)) + '.json');
}
function loadTouched(input) { try { return JSON.parse(fs.readFileSync(sessionFile(input), 'utf8')); } catch { return []; } }
function saveTouched(input, list) { try { fs.writeFileSync(sessionFile(input), JSON.stringify(list)); } catch { /* ignore */ } }

function hookPostEdit(input) {
  if (!looksLikeEdit(input.tool_name || input.toolName)) return { skipped: 'not an edit' };
  const sessionRepo = resolveRepo(input);
  const contexts = new Map(); // repo -> anchors, read once per repo
  const notes = [];
  const touched = loadTouched(input);
  for (const p of editedPaths(input)) {
    const abs = path.isAbsolute(p) ? p : path.join(sessionRepo, p);
    const repo = repoOfFile(abs) || sessionRepo;
    const rel = toPosix(path.relative(repo, abs));
    if (rel.startsWith('..')) continue;
    if (!touched.some(x => x.repo === repo && x.rel === rel)) touched.push({ repo, rel });
    if (isOrgRule(rel)) { notes.push(`${rel} is an organisation rule copied from the org context repo. Do not change it here: propose the change in the org context repo; the next sync would undo a local edit.`); continue; }
    if (isContextFile(rel)) continue;
    if (!contexts.has(repo)) contexts.set(repo, readContext(repo, listFiles(repo)));
    const label = repo === sessionRepo ? rel : `${path.basename(repo)}/${rel}`;
    for (const a of contexts.get(repo).anchors.filter(x => x.re.test(rel))) {
      notes.push(`${label} is referenced by ${repo === sessionRepo ? '' : path.basename(repo) + '/'}${a.file}:${a.line} ("${a.text}").`);
    }
  }
  saveTouched(input, touched.slice(-500));
  if (notes.length) addContext('PostToolUse', notes.slice(0, 5).join('\n') + '\nIf this edit changed what that line describes, update the line in the same change; otherwise no action is needed.');
  return { notes: notes.length };
}

function hookStop(input) {
  if (input.stop_hook_active) return { skipped: 'already blocked once' }; // never block twice in a row
  const touched = loadTouched(input);
  if (!touched.length) return { notes: 0 };       // the agent edited nothing: nothing to check
  const items = [];
  const repos = [...new Set(touched.map(x => x.repo))];
  const sessionRepo = resolveRepo(input);
  for (const repo of repos) {
    const mine = new Set(touched.filter(x => x.repo === repo).map(x => x.rel));
    const files = listFiles(repo);
    const ctx = readContext(repo, files);
    const label = f => repo === sessionRepo ? f : `${path.basename(repo)}/${f}`;
    for (const a of ctx.anchors) {
      if (!files.some(f => a.re.test(f))) {
        // broken: report it when the agent touched its context file or (likely) moved/deleted its target
        if (mine.has(a.file) || [...mine].some(r => a.re.test(r))) items.push(`- BROKEN ${label(a.file)}:${a.line} anchors ${a.pattern}, which no longer exists.`);
        continue;
      }
      if (mine.has(a.file)) continue;            // the agent already revisited this context file
      const hit = [...mine].find(r => !isContextFile(r) && a.re.test(r));
      if (hit) items.push(`- CHECK ${label(a.file)}:${a.line} ("${a.text.slice(0, 80)}") is anchored to ${label(hit)}, which you edited.`);
    }
  }
  if (!items.length) return { notes: 0 };
  const marker = sessionFile(input) + '.stopped-' + sha1(items.join('|')).slice(0, 12);
  if (fs.existsSync(marker)) return { skipped: 'same list already shown' };
  try { fs.writeFileSync(marker, String(Date.now())); } catch { /* ignore */ }
  emit({ decision: 'block', reason: 'Context check before finishing (files you edited in this session):\n' + items.slice(0, 10).join('\n') +
    '\nFix BROKEN anchors. For CHECK items, update the line only if its meaning changed, otherwise say it is still true. This check runs once.' +
    '\nThen end your reply with the kit\'s "What changed · Checks · Next" block.' });
  return { notes: items.length, blocked: true };
}

function hookGuard(input) {
  if (!looksLikeEdit(input.tool_name || input.toolName)) return { skipped: 'not an edit' };
  const repo = resolveRepo(input);
  const bad = editedPaths(input).map(p => relTo(repo, p)).filter(rel => isOrgRule(rel) || !STEWARD_RES.some(r => r.test(rel)));
  if (!bad.length) return { notes: 0 };
  const org = bad.filter(isOrgRule);
  const reason = org.length && org.length === bad.length
    ? `organisation rules change in the org context repo, not here; refused: ${org.join(', ')}`
    : `context-steward may only edit context files (not organisation rules); refused: ${bad.join(', ')}`;
  if (format === 'copilot') emit({ permissionDecision: 'deny', permissionDecisionReason: reason });
  else emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
  return { denied: bad.length };
}

// ---------------------------------------------------------------- page metadata
// Frontmatter in the shape of the Open Knowledge Format (OKF v0.3): `type` (required), `status` (draft |
// stable | deprecated), `verified` (a list of { by, at } events; `human:` actors count as a review) and
// `generated` ({ by, at }) for machine-written pages. Verifications older than `generated.at` no longer count.
// Kit extensions: `dimension`, `owner`. Kit 1.x pages used "> Dimension: data · Status: reviewed · ..." instead.
function fmBlock(fm, key) {
  const lines = fm.split(/\r?\n/);
  const i = lines.findIndex(l => new RegExp('^' + key + ':').test(l));
  if (i < 0) return '';
  const out = [lines[i].replace(new RegExp('^' + key + ':'), '')];
  for (let j = i + 1; j < lines.length && /^(\s|-)/.test(lines[j]); j++) out.push(lines[j]);
  return out.join('\n');
}
function actorEvents(block) {
  const items = block.replace(/^\s*\[\s*\]\s*$/, '').split(/^\s*-\s+|\},\s*\{/m).filter(s => /by:/.test(s));
  return items.map(s => ({
    by: ((/by:\s*["']?([^"',}\n]+)/.exec(s) || [])[1] || '').trim(),
    at: ((/at:\s*["']?(\d{4}-\d{2}-\d{2}[^"',}\s]*)/.exec(s) || [])[1] || '').trim(),
  })).filter(e => e.by);
}
function pageMeta(text) {
  const fm = frontmatter(text);
  const dim = fm && fmGet(fm, 'dimension').toLowerCase();
  if (dim) {
    let status = (fmGet(fm, 'status') || 'draft').toLowerCase();
    if (status === 'reviewed') status = 'stable';
    const gen = actorEvents(fmBlock(fm, 'generated').replace(/^\s*\{/, '- {'))[0] || null;
    const genAt = gen && /^\d{4}-\d{2}-\d{2}/.test(gen.at) ? gen.at.slice(0, 10) : null;
    const current = actorEvents(fmBlock(fm, 'verified'))
      .filter(e => /^human:/.test(e.by) && /^\d{4}-\d{2}-\d{2}/.test(e.at) && (!genAt || e.at.slice(0, 10) >= genAt));
    const verified = current.length ? current.map(e => e.at.slice(0, 10)).sort().pop() : null;
    return { dimension: dim, type: fmGet(fm, 'type') || 'Context Page', status, verified, reviewers: [...new Set(current.map(e => e.by))],
      reviewed: status !== 'draft' && !!verified, independent: new Set(current.map(e => e.by)).size >= 2,
      generated: !!gen, owner: fmGet(fm, 'owner'), format: 'frontmatter' };
  }
  const old = oldStatusLine(text);
  if (!old) return null;
  const m = old.meta;
  return { ...m, reviewed: m.status !== 'draft' && !!m.verified, generated: m.status === 'generated', format: 'status-line' };
}
function oldStatusLine(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    if (!/^>\s*Dimension:/i.test(lines[i])) continue;
    const fields = {};
    for (const part of lines[i].replace(/^>\s*/, '').split('·')) {
      const m = /^\s*([A-Za-z ]+):\s*(.*?)\s*$/.exec(part);
      if (m) fields[m[1].trim().toLowerCase()] = m[2];
    }
    const lv = fields['last verified'] || '';
    const verified = (/(\d{4}-\d{2}-\d{2})/.exec(lv) || [])[1] || null;
    const by = (/\bby\s+(.+)$/.exec(lv) || [])[1] || '';
    return { index: i, meta: { dimension: (fields.dimension || '').toLowerCase(), status: (fields.status || 'draft').toLowerCase(),
      verified, verifiedBy: by, independent: /^yes/i.test(fields['independent review'] || ''), owner: fields.owner || '' } };
  }
  return null;
}
function oldFormatPages(repo, contextFiles) {
  const out = [];
  for (const f of contextFiles) {
    let t = ''; try { t = readText(repo, f); } catch { continue; }
    if (!frontmatter(t) && oldStatusLine(t)) out.push(f);
  }
  return out;
}
function pageType(rel) {
  return /\/decisions\//.test(rel) ? 'Decision' : /\/areas\//.test(rel) ? 'Area Guide' : /\/data\/tables\//.test(rel) ? 'Database Table' : 'Context Page';
}
const yq = s => JSON.stringify(String(s));
const actorId = name => 'human:' + String(name).trim().toLowerCase().replace(/[^a-z0-9._@-]+/g, '-').replace(/^-|-$/g, '');
// 1.x status line -> frontmatter. A 1.x "generated" page becomes stable + generated; an independent review
// keeps its rating through a second, labelled verification event.
function frontmatterFor(m, rel) {
  const out = ['---', `type: ${pageType(rel)}`, `status: ${m.status === 'draft' ? 'draft' : 'stable'}`, `dimension: ${m.dimension}`, `owner: ${yq(m.owner || '')}`];
  if (m.status === 'generated') out.push(`generated: { by: ${yq(m.verifiedBy || 'process:unknown')}, at: ${yq(m.verified || '')} }`, 'verified: []');
  else if (m.verified && m.status !== 'draft') {
    out.push('verified:', `  - { by: ${yq(actorId(m.verifiedBy || 'unknown'))}, at: ${yq(m.verified)} }`);
    if (m.independent) out.push(`  - { by: "human:independent-reviewer", at: ${yq(m.verified)}, note: "independent review recorded in kit 1.x; replace with the reviewer's name" }`);
  } else out.push('verified: []');
  out.push('---');
  return out.join('\n');
}

// ---------------------------------------------------------------- migrate
function cmdMigrate() {
  const repo = resolveRepo({});
  const dry = flag('--dry-run');
  const files = listFiles(repo).filter(isContextFile);
  const changed = [];
  for (const f of files) {
    let text = ''; try { text = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
    if (frontmatter(text)) continue;
    const old = oldStatusLine(text);
    if (!old || !old.meta.dimension) continue;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    lines.splice(old.index, 1);
    if (old.index > 0 && lines[old.index - 1] !== undefined && lines[old.index - 1].trim() === '' && (lines[old.index] || '').trim() === '') lines.splice(old.index, 1);
    const out = frontmatterFor(old.meta, f).split('\n').join(eol) + eol + lines.join(eol);
    if (!dry) fs.writeFileSync(path.join(repo, f), out);
    changed.push(f);
  }
  console.log(`Context migrate: ${path.basename(repo)}${dry ? ' (dry run)' : ''}`);
  if (!changed.length) console.log('  Nothing to migrate: every page already uses the current format.');
  else { console.log(`  ${dry ? 'Would convert' : 'Converted'} ${changed.length} page(s) from the 1.x status line to frontmatter:`); changed.forEach(f => console.log('    ~ ' + f)); }
  console.log('  Review the diff, then commit. Ratings and review dates are unchanged.');
}

// ---------------------------------------------------------------- readiness
const READINESS_DEFAULT = {
  dimensions: [
    { id: 'code-understanding', label: 'Code understanding', weight: 15 },
    { id: 'architecture', label: 'Architecture', weight: 10 },
    { id: 'domain', label: 'Business/domain', weight: 10 },
    { id: 'data', label: 'Data', weight: 10 },
    { id: 'api', label: 'API/integration', weight: 10 },
    { id: 'dependencies', label: 'Dependencies', weight: 10 },
    { id: 'security', label: 'Security', weight: 10 },
    { id: 'testing', label: 'Testing', weight: 5 },
    { id: 'operations', label: 'Runtime/operations', weight: 5 },
    { id: 'decisions', label: 'Decision history', weight: 5 },
    { id: 'provenance', label: 'Provenance', weight: 5 },
    { id: 'freshness', label: 'Freshness', weight: 5 },
  ],
  bands: [
    { min: 0, name: 'Context poor' }, { min: 21, name: 'Context emerging' }, { min: 41, name: 'Discoverable' },
    { min: 51, name: 'AI assisted' }, { min: 71, name: 'AI ready' }, { min: 86, name: 'Agent ready' },
  ],
  reviewMaxAgeDays: 180,
};
const MEASURED = new Set(['provenance', 'freshness']);
const DAY = 864e5;

function readinessConfig(repo) {
  for (const f of ['.ai-kit/readiness.json', '.github/context-readiness.json', 'context-readiness.json']) {
    const j = readJson(path.join(repo, f));
    if (j) return { ...READINESS_DEFAULT, ...j, source: f };
  }
  return { ...READINESS_DEFAULT, source: 'default' };
}

// Ratings written by /context-assess: | dimension | rating | evidence | gaps | independent |
function assessedRatings(repo) {
  const out = {};
  let text = '';
  for (const f of ['docs/context/readiness.md', 'context/readiness.md']) { try { text = fs.readFileSync(path.join(repo, f), 'utf8'); break; } catch { /* next */ } }
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 4) continue;
    const id = (cells[1] || '').toLowerCase(), r = Number(cells[2]);
    if (/^[a-z-]+$/.test(id) && cells[2] !== '' && r >= 0 && r <= 5) out[id] = { rating: Math.round(r), independent: /^yes/i.test(cells[cells.length - 2] || '') };
  }
  return out;
}

const changedSinceCache = new Map();
function changedSince(repo, date) {
  const key = repo + '|' + date;
  if (!changedSinceCache.has(key)) {
    const log = git(repo, ['log', `--since=${date}T23:59:59`, '--name-only', '--format=']) || '';
    changedSinceCache.set(key, new Set(log.split(/\r?\n/).filter(Boolean).map(toPosix)));
  }
  return changedSinceCache.get(key);
}

// Share of claim lines (bullets, numbered steps, table rows) that carry an anchor, directly or via a
// "Source: [anchor: …]" line in the same section. Lines under "Unverified" are not claims.
function anchoredShare(text) {
  let claims = 0, anchored = 0, sectionSourced = false, unverified = false, prev = '';
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
  for (const line of body.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) { sectionSourced = false; unverified = /unverified/i.test(line); prev = line; continue; }
    if (/^\s*(Source|Sources):.*\[anchor:/i.test(line)) sectionSourced = true;
    const isRow = /^\s*\|/.test(line) && !/^\s*\|\s*:?-{3}/.test(line);
    const isHeaderRow = isRow && !/^\s*\|/.test(prev);
    const isClaim = !unverified && !/^\s*>/.test(line) && !/<[^>]+>/.test(line) &&
      (/^\s*([-*]|\d+\.)\s+\S/.test(line) || (isRow && !isHeaderRow));
    if (isClaim) { claims++; if (/\[anchor:/.test(line) || sectionSourced) anchored++; }
    prev = line;
  }
  return { claims, anchored };
}

function computeReadiness(repo) {
  const cfg = readinessConfig(repo);
  const a = analyse(repo);
  const now = Date.now();
  const ratings = assessedRatings(repo);
  const pages = [];
  let claims = 0, anchoredClaims = 0;
  for (const f of a.ctx.contextFiles) {
    let text = ''; try { text = readText(repo, f); } catch { continue; }
    const h = pageMeta(text);
    if (f === 'AGENTS.md' || h) { const s = anchoredShare(text); claims += s.claims; anchoredClaims += s.anchored; }
    if (!h) continue;
    const anchors = a.ctx.anchors.filter(x => x.file === f);
    const broken = a.broken.filter(x => x.file === f).length;
    const age = h.verified ? Math.floor((now - Date.parse(h.verified)) / DAY) : null;
    const since = h.verified ? changedSince(repo, h.verified) : null;
    const stale = since ? anchors.filter(x => [...since].some(c => x.re.test(c))).length : 0;
    let cap = 2;
    if (h.reviewed) cap = age > cfg.reviewMaxAgeDays ? 3 : (h.independent ? 5 : 4);
    else if (h.generated && h.status !== 'draft') cap = 3; // generated from code or schema: traceable, not reviewed
    const anyAnchor = anchors.length || /\[anchor:/.test(text); // repo:path anchors (hub pages) count as traceable
    if (!anyAnchor) cap = Math.min(cap, 3);
    if (stale) cap = Math.min(cap, 3);
    if (broken) cap = Math.min(cap, 2);
    pages.push({ file: f, ...h, age, anchors: anchors.length, broken, stale, cap });
  }
  const specs = (() => { try { return fs.readdirSync(path.join(repo, 'openspec', 'specs'), { withFileTypes: true }).filter(d => d.isDirectory()).length; } catch { return 0; } })();
  const archivedDesigns = (() => { try { return fs.readdirSync(path.join(repo, 'openspec', 'changes', 'archive')).filter(d => fs.existsSync(path.join(repo, 'openspec', 'changes', 'archive', d, 'design.md'))).length; } catch { return 0; } })();
  const ruleFiles = a.ctx.contextFiles.filter(f => f.startsWith('.github/instructions/') || f.startsWith('.claude/rules/')).length;
  const g = graphState(repo);

  const rows = cfg.dimensions.map(d => {
    const mine = pages.filter(p => p.dimension === d.id);
    let cap = mine.length ? Math.max(...mine.map(p => p.cap)) : 0;
    let evidence = mine.length > 4
      ? [`${mine.length} pages (${mine.filter(p => p.reviewed).length} reviewed)`]
      : mine.map(p => `${p.file} (${p.reviewed ? 'reviewed ' + p.verified : p.generated && p.status !== 'draft' ? 'generated' : 'draft'})`);
    let measured = null;
    if (d.id === 'code-understanding') {
      const agents = a.agentsMd;
      cap = !agents ? 0 : (ruleFiles || g) ? 3 : 2;
      if (agents && ruleFiles && g && !g.stale && a.ctx.anchors.some(x => x.file === 'AGENTS.md')) cap = 4;
      if (agents && agents.lines > MAX_AGENTS_LINES) cap = Math.min(cap, 3);
      if (cap === 4 && ratings[d.id] && ratings[d.id].independent) cap = 5;
      evidence = [agents ? `AGENTS.md ${agents.lines} lines` : 'no AGENTS.md', `${ruleFiles} rule file(s)`, g ? (g.stale ? 'code map stale' : 'code map current') : 'no code map'];
    }
    if (d.id === 'domain' && specs) { cap = Math.max(cap, 3); evidence.push(`${specs} OpenSpec spec(s)`); }
    if (d.id === 'decisions' && archivedDesigns) { cap = Math.max(cap, 2); evidence.push(`${archivedDesigns} archived design(s)`); }
    if (d.id === 'provenance') {
      const share = claims ? anchoredClaims / claims : 0;
      measured = !claims ? 0 : share < 0.1 ? 1 : share < 0.25 ? 2 : share < 0.45 ? 3 : share < 0.65 ? 4 : 5;
      evidence = [`${anchoredClaims} of ${claims} statements anchored (${Math.round(share * 100)}%)`];
    }
    if (d.id === 'freshness') {
      const verified = pages.filter(p => p.verified);
      const oldest = verified.length ? Math.max(...verified.map(p => p.age)) : null;
      const staleAll = pages.reduce((n, p) => n + p.stale, 0);
      measured = !a.ctx.contextFiles.length ? 0 : a.broken.length ? 1 : !verified.length ? 2 : (staleAll || oldest > 180) ? 3 : oldest > 90 ? 4 : 5;
      evidence = [`${a.broken.length} broken anchor(s)`, `${staleAll} line(s) whose code changed since review`, verified.length ? `oldest review ${oldest} day(s) ago` : 'no page reviewed yet'];
    }
    const assessed = ratings[d.id] ? ratings[d.id].rating : null;
    const rating = measured !== null ? measured : assessed !== null ? Math.min(assessed, cap) : Math.min(cap, 3);
    const points = Math.round(rating / 5 * d.weight * 10) / 10;
    return { id: d.id, label: d.label, weight: d.weight, cap: measured !== null ? null : cap, assessed, provisional: measured === null && assessed === null, rating, points, lost: d.weight - points, evidence };
  });
  const total = Math.round(rows.reduce((n, r) => n + r.points, 0));
  const band = [...cfg.bands].reverse().find(b => total >= b.min) || cfg.bands[0];
  const gaps = [...rows].sort((x, y) => y.lost - x.lost).filter(r => r.lost > 0).slice(0, 3).map(r => {
    const how = r.id === 'provenance' ? 'add [anchor: …] to statements in the deep pages'
      : r.id === 'freshness' ? 'fix broken anchors, run /context-update, re-review old pages'
      : r.cap === 0 ? (r.id === 'code-understanding' ? 'run /context-create and build the code map' : 'no page yet: run /context-create deep')
      : r.cap <= 2 ? 'page is a draft or has broken anchors: owner reviews it, sets status: stable and adds a verified entry'
      : r.cap === 3 ? 'unanchored, stale or old review: add anchors, /context-update, re-review'
      : r.cap === 4 ? 'independent review by a second person (needed for 5)'
      : 'run /context-assess';
    return { ...r, how };
  });
  return { repo: path.basename(repo), config: cfg.source, total, band: band.name, rows, gaps,
    alwaysOnTokens: a.agents.tokens, alwaysOnBudget: ALWAYS_ON_TOKENS, pages };
}
function readinessLines(result) {
  const out = [`Context readiness: ${result.repo}  (weights: ${result.config})`, '',
    '| Dimension | Weight | Evidence | Cap | Rating | Points |', '| --- | --- | --- | --- | --- | --- |'];
  for (const r of result.rows) out.push(`| ${r.label} | ${r.weight}% | ${r.evidence.join('; ') || 'none'} | ${r.cap === null ? 'measured' : r.cap} | ${r.rating}${r.provisional ? '*' : ''} | ${r.points} |`);
  out.push('', `Total: ${result.total} / 100 · ${result.band}`);
  if (result.rows.some(r => r.provisional)) out.push('* not assessed yet: provisional, at most 3 (run /context-assess)');
  out.push(`Always-loaded context: ≈ ${result.alwaysOnTokens} tokens (budget ${result.alwaysOnBudget}). A high score with a large always-loaded size is a warning sign.`);
  if (result.gaps.length) { out.push('Biggest gaps:'); result.gaps.forEach(r => out.push(`  - ${r.label}: ${r.points} of ${r.weight} points. ${r.how}`)); }
  return out;
}
function cmdReadiness() {
  const result = computeReadiness(resolveRepo({}));
  console.log(flag('--json') ? JSON.stringify(result, null, 2) : readinessLines(result).join('\n'));
}

// ---------------------------------------------------------------- pages-for
function pagesFor(repo, files) {
  const ctx = readContext(repo, listFiles(repo));
  const out = [];
  for (const raw of files) {
    const rel = relTo(repo, raw);
    const hits = ctx.anchors.filter(a => a.re.test(rel));
    const pages = [...new Set(hits.map(h => h.file))];
    out.push({ file: rel, pages, lines: hits.map(h => ({ file: h.file, line: h.line, text: h.text })) });
  }
  return out;
}
function cmdPagesFor() {
  const repo = resolveRepo({});
  const files = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--repo');
  if (!files.length) { console.log('Usage: node .ai-kit/context-tools.cjs pages-for <file> [<file> ...]'); process.exitCode = 2; return; }
  const res = pagesFor(repo, files);
  if (flag('--json')) { console.log(JSON.stringify(res, null, 2)); return; }
  for (const r of res) {
    console.log(`${r.file}: ${r.pages.length ? r.pages.join(', ') : 'no context page anchors this file'}`);
    r.lines.slice(0, 10).forEach(l => console.log(`  ${l.file}:${l.line}  ${l.text}`));
  }
}

// ---------------------------------------------------------------- schema-import (tbls schema.json)
const GEN_START = '<!-- generated:start schema-import: do not edit between these markers -->';
const GEN_END = '<!-- generated:end -->';
function replaceGenerated(text, block) {
  const s = text.indexOf('<!-- generated:start'), e = text.indexOf(GEN_END);
  if (s >= 0 && e > s) return text.slice(0, s) + block + text.slice(e + GEN_END.length);
  return null;
}
const cell = v => String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const safeName = n => n.replace(/[^A-Za-z0-9_.-]/g, '_');
function cmdSchemaImport() {
  const repo = resolveRepo({});
  const file = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
  if (!file) { console.log('Usage: node .ai-kit/context-tools.cjs schema-import <schema.json from tbls> [--out docs/context/data] [--dry-run]'); process.exitCode = 2; return; }
  const schema = readJson(path.resolve(file));
  if (!schema || !Array.isArray(schema.tables)) { console.log(`schema-import: ${file} is not a tbls schema.json (expected a "tables" list). Create one with: tbls out -t json -o schema.json <dsn>`); process.exitCode = 2; return; }
  const dry = flag('--dry-run');
  const outDir = toPosix(opt('--out') || 'docs/context/data');
  const absFile = path.resolve(file);
  const relFile = toPosix(path.relative(repo, absFile));
  const inRepo = !relFile.startsWith('..') && !path.isAbsolute(relFile);
  const sourceLine = inRepo ? `Source: [anchor: ${relFile}]` : `Source: ${path.basename(file)} (outside the repo: copy it in and import again to make this traceable)`;
  const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date()); // local date, like a reviewer's
  const relations = schema.relations || [];
  const created = [], updated = [], same = [];
  const tableNames = new Set(schema.tables.map(t => t.name));

  for (const t of schema.tables) {
    const cols = t.columns || [];
    const fks = relations.filter(r => r.table === t.name);
    const refBy = relations.filter(r => r.parent_table === t.name);
    const fkCols = new Set(fks.flatMap(r => r.columns || []));
    const lookalikes = cols.filter(c => /(_id|Id)$/.test(c.name) && !fkCols.has(c.name) && !(t.constraints || []).some(k => /PRIMARY/i.test(k.type || '') && (k.columns || []).includes(c.name)));
    const g = [GEN_START, sourceLine, '', `${t.type ? `Type: ${t.type}. ` : ''}${t.comment ? `Comment: ${cell(t.comment)}` : ''}`.trim(), '',
      '### Columns', '| Column | Type | Null | Default | Comment |', '| --- | --- | --- | --- | --- |',
      ...cols.map(c => `| ${cell(c.name)} | ${cell(c.type)} | ${c.nullable ? 'yes' : 'no'} | ${cell(c.default)} | ${cell(c.comment)} |`)];
    const cons = (t.constraints || []);
    if (cons.length) g.push('', '### Keys and constraints', ...cons.map(k => `- ${cell(k.name)} (${cell(k.type)}): ${cell(k.def)}`));
    if (fks.length) g.push('', '### References', ...fks.map(r => `- (${(r.columns || []).join(', ')}) → ${r.parent_table} (${(r.parent_columns || []).join(', ')})${r.virtual ? ' (declared in tbls, no foreign key)' : ''}`));
    if (refBy.length) g.push('', '### Referenced by', ...refBy.map(r => `- ${r.table} (${(r.columns || []).join(', ')})`));
    if (lookalikes.length) g.push('', '### Look like references but have no foreign key', ...lookalikes.map(c => `- ${c.name}`));
    if ((t.indexes || []).length) g.push('', '### Indexes', ...t.indexes.map(i => `- ${cell(i.name)}: ${cell(i.def)}`));
    if ((t.triggers || []).length) g.push('', '### Triggers', ...t.triggers.map(x => `- ${cell(x.name)}: ${cell(x.def)}`));
    if (t.def) g.push('', '### Definition', '```sql', String(t.def).trim(), '```');
    g.push(GEN_END);
    const block = g.join('\n');

    const rel = `${outDir}/tables/${safeName(t.name)}.md`;
    const abs = path.join(repo, ...rel.split('/'));
    let text;
    if (exists(abs)) {
      const cur = fs.readFileSync(abs, 'utf8');
      const next = replaceGenerated(cur, block);
      if (next === null) { same.push(rel + ' (no generated markers: left unchanged)'); continue; }
      if (next === cur) { same.push(rel); continue; }
      // The structure changed: record when, so reviews older than this stop counting (OKF rule).
      text = next.replace(/^generated:.*$/m, `generated: { by: "context-tools/schema-import", at: ${JSON.stringify(today)} }`);
      updated.push(rel);
    } else {
      text = ['---', 'type: Database Table', `title: ${JSON.stringify(t.name)}`, 'status: draft', 'dimension: data', 'owner: ""',
        `generated: { by: "context-tools/schema-import", at: ${JSON.stringify(today)} }`, 'verified: []', '---',
        `# ${t.name}`, '', '## Meaning', '<What one row represents, who writes it, who reads it. People write this part.>', '',
        '## Generated from the schema', block, '',
        '## Rules and traps', '<Values with special meaning, soft deletes, status lifecycles, columns that must change together.>', '',
        '## Code that reads or writes it', '- <Repository, entity, query constant or migration> [anchor: <path>]', '',
        '## Unverified', '- <Anything believed but not confirmed in code.>', ''].join('\n');
      created.push(rel);
    }
    if (!dry) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); }
  }
  // Pages for tables that are no longer in the schema are reported, never deleted.
  const tablesDir = path.join(repo, ...outDir.split('/'), 'tables');
  const gone = [];
  try { for (const f of fs.readdirSync(tablesDir)) if (f.endsWith('.md') && ![...tableNames].some(n => safeName(n) + '.md' === f)) gone.push(`${outDir}/tables/${f}`); } catch { /* none */ }
  // Index of tables, regenerated between markers.
  const idxRel = `${outDir}/index.md`;
  const idxAbs = path.join(repo, ...idxRel.split('/'));
  // OKF index style: no frontmatter, headings grouping bulleted links with a short description.
  const list = [GEN_START, sourceLine, '',
    ...schema.tables.map(t => {
      const refs = relations.filter(r => r.table === t.name).map(r => r.parent_table), by = relations.filter(r => r.parent_table === t.name).map(r => r.table);
      return `- [${t.name}](tables/${safeName(t.name)}.md): ${(t.columns || []).length} columns${refs.length ? `; references ${refs.join(', ')}` : ''}${by.length ? `; referenced by ${by.join(', ')}` : ''}${t.comment ? `. ${cell(t.comment)}` : ''}`;
    }),
    GEN_END].join('\n');
  let idx = exists(idxAbs) ? fs.readFileSync(idxAbs, 'utf8') : null;
  const idxNext = idx === null
    ? ['# Data: tables', '', 'One page per table. The generated part of each page comes from the schema file; the rest is written by people.', '',
      '## Tables', list, ''].join('\n')
    : replaceGenerated(idx, list);
  if (idxNext !== null && idxNext !== idx) { if (!dry) { fs.mkdirSync(path.dirname(idxAbs), { recursive: true }); fs.writeFileSync(idxAbs, idxNext); } (idx === null ? created : updated).push(idxRel); }

  console.log(`Schema import: ${schema.tables.length} table(s) from ${file}${dry ? ' (dry run)' : ''}`);
  if (created.length) { console.log('  Added:'); created.forEach(f => console.log('    + ' + f)); }
  if (updated.length) { console.log('  Generated part refreshed:'); updated.forEach(f => console.log('    ~ ' + f)); }
  if (same.length) console.log(`  Unchanged: ${same.length}`);
  if (gone.length) { console.log('  Pages for tables no longer in the schema (kept; check and remove by hand):'); gone.forEach(f => console.log('    ? ' + f)); }
  console.log('  Next: fill "Meaning", "Rules and traps" and "Code that reads or writes it" for the tables your flows use (/context-create deep data does this with you).');
}

// ---------------------------------------------------------------- doctor
function cmdDoctor() {
  const repo = resolveRepo({});
  const rows = [];
  const ok = (area, msg) => rows.push(['OK  ', area, msg]);
  const warn = (area, msg) => rows.push(['WARN', area, msg]);
  const fail = (area, msg) => rows.push(['FAIL', area, msg]);
  const info = (area, msg) => rows.push(['INFO', area, msg]);

  const major = Number(process.versions.node.split('.')[0]);
  major >= 18 ? ok('node', `Node ${process.versions.node}`) : fail('node', `Node ${process.versions.node}: the kit needs Node 18 or newer`);
  const st = kitStamp(repo);
  if (!st) warn('kit', 'No kit stamp (.ai-kit/kit.json). Was the kit installed here? node <kit>/kit/install.mjs <repo>');
  else if (st._file !== '.ai-kit/kit.json') warn('kit', `Kit ${st.version} uses the 1.x layout (${st._file}). Upgrade: node <kit>/kit/install.mjs <repo> --upgrade`);
  else ok('kit', `Kit ${st.version} for ${[].concat(st.tools || st.tool || []).join(', ') || 'unknown tools'}`);
  for (const p of OLD_TOOL_PATHS) if (exists(path.join(repo, p))) warn('kit', `Old copy of the context tool at ${p}. Run install.mjs --upgrade (it removes it).`);

  // Agent hook files
  const copilotHooks = path.join(repo, '.github', 'hooks', 'ai-context.json');
  const claudeSettings = path.join(repo, '.claude', 'settings.json');
  const hookFiles = [];
  if (exists(copilotHooks)) {
    const j = readJson(copilotHooks);
    if (!j || !j.hooks) fail('hooks', '.github/hooks/ai-context.json is not valid JSON with a "hooks" object');
    else {
      const cmds = Object.values(j.hooks).flat().map(h => h.command || h.bash || '');
      const missing = cmds.filter(c => /context-tools\.cjs/.test(c) && !c.includes(KIT_TOOL));
      missing.length ? warn('hooks', '.github/hooks/ai-context.json points at an old script path: run install.mjs --upgrade') : ok('hooks', `.github/hooks/ai-context.json: ${Object.keys(j.hooks).join(', ')} (Copilot)`);
      hookFiles.push('copilot');
    }
  }
  if (exists(claudeSettings)) {
    const j = readJson(claudeSettings);
    const text = (() => { try { return fs.readFileSync(claudeSettings, 'utf8'); } catch { return ''; } })();
    if (!j) fail('hooks', '.claude/settings.json is not valid JSON');
    else if (!/context-tools\.cjs/.test(text)) info('hooks', '.claude/settings.json has no kit hooks (fine if you do not use Claude Code here)');
    else if (!text.includes(KIT_TOOL)) warn('hooks', '.claude/settings.json points at an old script path: run install.mjs --upgrade');
    else { ok('hooks', `.claude/settings.json: ${Object.keys(j.hooks || {}).join(', ')} (Claude Code)`); hookFiles.push('claude'); }
  }
  if (!hookFiles.length) warn('hooks', 'No agent hook file found. The skills and the git hook still work; hooks only add notes for the agent.');
  if (hookFiles.length === 2) info('hooks', 'Both hook files present: VS Code\'s Copilot harness reads both, so each event can arrive twice. The tool ignores the second call.');

  // VS Code settings that switch hooks off
  const vs = (() => { try { return fs.readFileSync(path.join(repo, '.vscode', 'settings.json'), 'utf8'); } catch { return ''; } })();
  if (/"chat\.useHooks"\s*:\s*false/.test(vs)) warn('vscode', '.vscode/settings.json sets chat.useHooks to false: hooks are off for Local-harness sessions');
  if (/"chat\.useClaudeHooks"\s*:\s*false/.test(vs)) info('vscode', 'chat.useClaudeHooks is false: Local-harness sessions ignore .claude/settings.json');

  // Self-test: run the hooks the way an agent would.
  for (const [ev, payload] of [['session-start', { cwd: repo, sessionId: 'kit-doctor' }], ['post-edit', { cwd: repo, sessionId: 'kit-doctor', toolName: 'editFiles', toolArgs: JSON.stringify({ filePath: 'AGENTS.md' }) }]]) {
    const r = spawnSync(process.execPath, [__filename, ev, '--repo', repo, '--format', 'copilot', '--self-test'], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 15000 });
    try { if (r.stdout) JSON.parse(r.stdout); r.status === 0 ? ok('self-test', `${ev} hook runs (${r.stdout ? 'returns JSON' : 'no output needed'})`) : fail('self-test', `${ev} exited with ${r.status}`); }
    catch { fail('self-test', `${ev} printed something that is not JSON: ${String(r.stdout).slice(0, 80)}`); }
  }

  // Did any agent actually call the hooks in this clone?
  const last = lastHookRuns(repo);
  if (Object.keys(last).length) for (const [e, r] of Object.entries(last)) ok('hook runs', `${e}: last run ${ago(r.t)} from ${r.harness}${r.duplicate ? ' (duplicate ignored)' : ''}`);
  else if (hookFiles.length) warn('hook runs', 'No agent has called the hooks in this clone yet. If you have used agent chat here, hooks are not running. In VS Code: check the session target (Copilot harness reads .github/hooks), that "chat.useHooks" is on for Local sessions, that your organisation allows hooks, and look in "Developer: Open Agent Debug Logs". In Claude Code: run /hooks.');

  // Git hook (the backstop that works with every tool)
  const hooksPath = (git(repo, ['config', '--get', 'core.hooksPath']) || '').trim();
  const pre = hooksPath ? path.join(repo, hooksPath, 'pre-commit') : path.join(gitDir(repo) || path.join(repo, '.git'), 'hooks', 'pre-commit');
  const preText = (() => { try { return fs.readFileSync(pre, 'utf8'); } catch { return ''; } })();
  if (!preText) warn('git hook', `No pre-commit hook${hooksPath ? ` in ${hooksPath}` : ''}. Teammates run once: git config core.hooksPath .githooks`);
  else if (!/context-tools\.cjs/.test(preText)) warn('git hook', `${toPosix(path.relative(repo, pre))} does not run the context check. Add: node ${KIT_TOOL} check --staged || exit 1`);
  else {
    let x = true; try { fs.accessSync(pre, fs.constants.X_OK); } catch { x = process.platform === 'win32'; }
    x ? ok('git hook', `${toPosix(path.relative(repo, pre))} runs the context check`) : warn('git hook', `${toPosix(path.relative(repo, pre))} is not executable: chmod +x it (and git update-index --chmod=+x)`);
  }

  // Skills per tool
  const skillDirs = { copilot: '.github/skills', claude: '.claude/skills', codex: '.agents/skills' };
  const OLD = ['context-bootstrap', 'context-baseline', 'context-refresh', 'story-to-change'];
  for (const [t, d] of Object.entries(skillDirs)) {
    let names = []; try { names = fs.readdirSync(path.join(repo, d)).filter(n => exists(path.join(repo, d, n, 'SKILL.md'))); } catch { continue; }
    const old = names.filter(n => OLD.includes(n));
    old.length ? warn('skills', `${d}: 1.x skills still present (${old.join(', ')}): run install.mjs --upgrade`) : ok('skills', `${d}: ${names.length} skill(s) (${t})`);
  }

  // CI, OpenSpec, code map
  const ci = ['.github/workflows/ai-context.yml', 'azure-pipelines.ai-context.yml', '.ai-kit/ci/azure-pipelines.yml'].filter(p => exists(path.join(repo, p)));
  ci.some(p => p.startsWith('.github/workflows')) ? ok('ci', 'GitHub workflow present') : ci.length ? info('ci', `Pipeline template at ${ci[0]}: create a pipeline from it and add it as a pull request check`) : warn('ci', 'No pull request check. Install with --ci azure or --ci github');
  if (exists(path.join(repo, 'openspec'))) {
    const cfg = (() => { try { return fs.readFileSync(path.join(repo, 'openspec', 'config.yaml'), 'utf8'); } catch { return ''; } })();
    /^schema:\s*story-tdd/m.test(cfg) ? ok('openspec', 'schema: story-tdd') : info('openspec', 'OpenSpec present but not using the story-tdd schema');
  }
  const g = graphState(repo);
  if (g) g.stale ? warn('code map', `Graphify map is older than HEAD: graphify update .`) : ok('code map', 'Graphify map current');

  console.log(`Kit doctor: ${path.basename(repo)}`);
  for (const [s, a, m] of rows) console.log(`  ${s}  ${a.padEnd(10)} ${m}`);
  const fails = rows.filter(r => r[0] === 'FAIL').length, warns = rows.filter(r => r[0] === 'WARN').length;
  console.log(`  Result: ${fails} problem(s), ${warns} warning(s)`);
  process.exitCode = fails ? 1 : 0;
}

// ---------------------------------------------------------------- ci (pull request check)
const isTestOrDoc = f => /(^|\/)(test|tests|__tests__|spec|e2e)\//i.test(f) || /\.(spec|test)\.[a-z]+$/i.test(f) || /\.(md|txt|png|jpg|svg)$/i.test(f);
function cmdCi() {
  const repo = resolveRepo({});
  const base = opt('--base');
  const r = runCheck(repo, { base, strict: flag('--strict') });
  const out = printCheck(repo, r, { base });
  if (!r.fatal && base) {
    // Story check: code changed but no OpenSpec change folder was touched (only if the repo uses OpenSpec).
    const diff = (git(repo, ['diff', '--name-only', base + '...HEAD']) || '').split(/\r?\n/).filter(Boolean);
    const code = diff.filter(f => !isContextFile(f) && !f.startsWith('openspec/') && !f.startsWith('.ai-kit/') && !f.startsWith('.github/') && !isTestOrDoc(f));
    if (exists(path.join(repo, 'openspec')) && code.length && !diff.some(f => f.startsWith('openspec/changes/'))) {
      out.push(`  NOTE   ${code.length} code file(s) changed and no openspec/changes/ folder is part of this pull request. Fine for small fixes; a story should carry its change.`);
    }
  }
  if (!r.fatal) {
    const res = computeReadiness(repo);
    out.push('', `Readiness: ${res.total} / 100 · ${res.band}${res.gaps.length ? ` · biggest gap: ${res.gaps[0].label} (${res.gaps[0].how})` : ''}`);
  }
  const text = out.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### AI context check\n\n```\n' + text + '\n```\n'); } catch { /* ignore */ } }
  process.exitCode = r.fatal ? 2 : r.failed ? 1 : 0;
}

// ---------------------------------------------------------------- mcp (stdio server, newline-delimited JSON-RPC)
const MCP_TOOLS = [
  { name: 'context_for_files', description: 'Context pages and lines that describe the given files (anchored to them). Call before editing a file to learn its rules, and after editing to know which context lines to re-check.',
    inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Repo-relative file paths' } }, required: ['files'] } },
  { name: 'context_check', description: 'Run the context check: broken anchors (errors), context whose code changed (warnings), size budget.',
    inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'Optional git ref to compare with, e.g. origin/main' } } } },
  { name: 'context_readiness', description: 'Context readiness score (0-100) over 12 dimensions, with evidence, caps and the biggest gaps.', inputSchema: { type: 'object', properties: {} } },
  { name: 'context_status', description: 'Short summary: kit version, context files, anchors, always-on size, active OpenSpec changes, code map, org rules.', inputSchema: { type: 'object', properties: {} } },
];
function cmdMcp() {
  const repo = resolveRepo({});
  const send = m => process.stdout.write(JSON.stringify(m) + '\n');
  const text = t => ({ content: [{ type: 'text', text: t }] });
  const call = (name, args) => {
    if (name === 'context_for_files') return text(JSON.stringify(pagesFor(repo, [].concat(args.files || [])), null, 2));
    if (name === 'context_check') { const r = runCheck(repo, { base: args.base }); return { ...text(printCheck(repo, r, { base: args.base }).join('\n')), isError: !!r.fatal }; }
    if (name === 'context_readiness') return text(readinessLines(computeReadiness(repo)).join('\n'));
    if (name === 'context_status') return text(statusLines(repo).join('\n'));
    return null;
  };
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      const { id, method, params = {} } = msg;
      if (id === undefined) continue; // notifications (e.g. notifications/initialized)
      try {
        if (method === 'initialize') send({ jsonrpc: '2.0', id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ai-context', version: (kitStamp(repo) || {}).version || '2' } } });
        else if (method === 'ping') send({ jsonrpc: '2.0', id, result: {} });
        else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } });
        else if (method === 'tools/call') {
          const res = call(params.name, params.arguments || {});
          res ? send({ jsonrpc: '2.0', id, result: res }) : send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params.name}` } });
        } else send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      } catch (e) { send({ jsonrpc: '2.0', id, result: { ...text('Error: ' + (e && e.message || e)), isError: true } }); }
    }
  });
}

// ---------------------------------------------------------------- main
const hooks = { 'session-start': hookSessionStart, 'post-edit': hookPostEdit, stop: hookStop, guard: hookGuard };
const commands = { check: cmdCheck, status: cmdStatus, readiness: cmdReadiness, migrate: cmdMigrate, doctor: cmdDoctor,
  'pages-for': cmdPagesFor, 'schema-import': cmdSchemaImport, ci: cmdCi, mcp: cmdMcp };
if (commands[command]) commands[command]();
else if (hooks[command]) {
  let input = {}, repo = null, result = null, duplicate = false;
  try {
    input = readStdin();
    if (format === 'auto') format = ('hook_event_name' in input || 'tool_input' in input) ? 'claude' : 'copilot';
    repo = resolveRepo(input);
    duplicate = command !== 'guard' && !flag('--self-test') && duplicateCall(command, input);
    if (!duplicate) result = hooks[command](input);
  } catch (e) {
    result = { error: String(e && e.message || e).slice(0, 200) };
    if (process.env.CONTEXT_TOOLS_DEBUG) process.stderr.write(String(e && e.stack || e) + '\n');
  }
  if (repo) logHook(repo, { event: flag('--self-test') ? 'self-test' : command, harness: format, duplicate: duplicate || undefined, ...(result || {}) });
  process.exitCode = 0; // a hook must never break the agent
} else {
  console.log('Usage: node .ai-kit/context-tools.cjs check [--base <ref>] [--staged] [--strict] | status | doctor | readiness [--json]\n' +
    '       | pages-for <file>... | migrate [--dry-run] | schema-import <schema.json> [--out <dir>] | ci [--base <ref>] | mcp\n' +
    '       | session-start | post-edit | stop | guard   (agent hooks)');
  process.exitCode = command ? 2 : 0;
}
