#!/usr/bin/env node
/*
 * context-tools.cjs — keeps AI-agent context honest. One file, Node 18+, no dependencies.
 * Works on Windows, macOS and Linux. Works with GitHub Copilot and Claude Code.
 *
 * Commands you run yourself (or in CI / git hooks):
 *   check   [--base <git-ref>] [--staged] [--strict]
 *           Broken anchors (error), stale context and size budget (warnings). Exit 1 on errors, or on
 *           warnings with --strict. --staged checks what is about to be committed (used by pre-commit).
 *   status                                  Short summary: context files, anchors, always-on size.
 *   readiness [--json]                      Context readiness score (0-100) over 12 dimensions, from the
 *           deep pages' status headers, anchors, freshness and docs/context/readiness.md ratings.
 *           Weights and bands: .github/context-readiness.json (optional).
 *
 * Agent hooks (read the event JSON on stdin, print one JSON object, never fail the agent):
 *   session-start   Adds a short "context health" note when a chat session starts.
 *   post-edit       After the agent edits a file, names any context line anchored to that file.
 *   stop            When the agent tries to finish: if files IT edited this session broke an anchor or touch
 *                   anchored code whose context line it did not revisit, blocks ONCE with the list.
 *   guard           Refuses edits outside context files (used only for the context-steward agent).
 *
 * Options: --repo <dir> (default: git root of the current folder), --format copilot|claude (default: auto).
 * Anchors: write [anchor: <path>] at the end of any context line that depends on code. <path> can be a
 *   file, a folder (src/main/resources/db/migration/), a glob (with * or **) or several of
 *   these separated by commas. Backticks, #L12 / :12 line suffixes and Windows backslashes are fine.
 *   Paths outside the repo (../product-context/...) are not checked.
 * Budgets (env vars): CONTEXT_MAX_AGENTS_LINES (default 150), CONTEXT_ALWAYS_ON_TOKENS (default 2000).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

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
  '.github/skills/**', '.claude/skills/**', '.github/agents/**', '.claude/agents/**',
  'openspec/**', 'CHANGELOG.md', 'docs/context/**',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', 'out', '.angular', 'coverage', '.gradle', '.idea', '.vscode']);

// ---------------------------------------------------------------- helpers
const toPosix = p => p.split(path.sep).join('/').replace(/\\/g, '/');
const escapeRe = s => s.replace(/[.+^$()|[\]\\]/g, '\\$&');
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

// Files changed in the working tree (and since --base, if given).
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
  return { items, tokens: items.reduce((s, i) => s + i.tokens, 0) };
}

function analyse(repo, base) {
  const files = listFiles(repo);
  const fileSet = files;
  const ctx = readContext(repo, files);
  const changed = changedFiles(repo, base);
  const broken = ctx.anchors.filter(a => !fileSet.some(f => a.re.test(f)));
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

// ---------------------------------------------------------------- CLI commands
function cmdCheck() {
  const repo = resolveRepo({});
  const base = opt('--base');
  if (base && git(repo, ['rev-parse', '--verify', '--quiet', base + '^{commit}']) === null) {
    console.log(`Context check: --base "${base}" is not a branch or commit here. Try "git fetch", or use origin/main, origin/master or origin/develop.`);
    process.exitCode = 2;
    return;
  }
  const a = analyse(repo, base);
  const errors = [], warnings = [];
  for (const b of a.broken) errors.push(`${b.file}:${b.line}  anchor points at a file that does not exist: ${b.pattern}`);
  for (const s of a.stale) warnings.push(`${s.file}:${s.line}  anchored code changed (${s.hit}) but this context file did not — is the line still true?`);
  if (!a.agentsMd) warnings.push('No AGENTS.md at the repo root. Run the context-bootstrap skill to create one.');
  else if (a.agentsMd.lines > MAX_AGENTS_LINES) warnings.push(`AGENTS.md has ${a.agentsMd.lines} lines (budget ${MAX_AGENTS_LINES}). Move detail into docs/context/ or a skill.`);
  const o = orgState(repo);
  if (o && o.outdated.length) warnings.push(`Org rules are older than your local ${o.name} clone (${o.outdated.join(', ')}). Re-sync: node <kit>/kit/install.mjs . --org ${o.path}`);
  if (o && o.editedHere.length) warnings.push(`Org rules edited in this repo (${o.editedHere.join(', ')}). Change them in the org context repo instead; the next sync replaces local edits.`);
  if (a.agents.tokens > ALWAYS_ON_TOKENS) warnings.push(`Always-on context is about ${a.agents.tokens} tokens (budget ${ALWAYS_ON_TOKENS}): ${a.agents.items.map(i => i.file).join(', ')}.`);

  console.log(`Context check: ${path.basename(repo)}${base ? ` (changes since ${base})` : ''}${STAGED ? ' (staged for commit)' : ''}`);
  console.log(`  ${a.ctx.contextFiles.length} context files, ${a.ctx.anchors.length} anchors, always-on ≈ ${a.agents.tokens} tokens`);
  errors.forEach(e => console.log('  ERROR  ' + e));
  warnings.forEach(w => console.log('  WARN   ' + w));
  console.log(`  Result: ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length || (flag('--strict') && warnings.length)) process.exitCode = 1;
}

// ---------------------------------------------------------------- organisation layer
// Rules synced from the org context repo by install.mjs --org; recorded in .github/ai-kit.json.
const ORG_DIRS = ['.github/instructions/org/', '.claude/rules/org/'];
const isOrgRule = rel => ORG_DIRS.some(d => rel.startsWith(d));
function orgState(repo) {
  let stamp = null;
  for (const f of ['.github/ai-kit.json', '.claude/ai-kit.json']) { try { stamp = JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8')); break; } catch { /* next */ } }
  const org = stamp && stamp.org;
  if (!org) return null;
  const h = s => require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  const editedHere = [], outdated = [];
  for (const [f, rec] of Object.entries(org.files || {})) {
    try { if (h(fs.readFileSync(path.join(repo, org.rulesDir, f), 'utf8')) !== rec.copy) editedHere.push(f); } catch { editedHere.push(f + ' (missing)'); }
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

function cmdStatus() {
  const repo = resolveRepo({});
  const a = analyse(repo);
  console.log(`Context status: ${path.basename(repo)}`);
  console.log(`  Context files (${a.ctx.contextFiles.length}): ${a.ctx.contextFiles.join(', ') || 'none'}`);
  console.log(`  Anchored facts: ${a.ctx.anchors.length} (${a.broken.length} broken)`);
  console.log(`  Always-on: ≈ ${a.agents.tokens} tokens of ${ALWAYS_ON_TOKENS} budget`);
  a.agents.items.forEach(i => console.log(`    ${i.file}: ${i.lines} lines, ≈ ${i.tokens} tokens`));
  const active = activeChanges(repo);
  console.log(`  Active OpenSpec changes: ${active.length ? active.join(', ') : 'none'}`);
  const g = graphState(repo);
  console.log(`  Code map (Graphify): ${!g ? 'not built' : g.stale ? `stale (built ${g.built}, HEAD ${g.head}) — run: graphify update .` : `up to date${g.built ? ` (${g.built})` : ''}`}`);
  const o = orgState(repo);
  console.log(`  ${orgLine(o) || 'Org rules: none synced (install.mjs <repo> --org <org-context> adds them)'}`);
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

// ---------------------------------------------------------------- hooks
function readStdin() {
  try { const raw = fs.readFileSync(0, 'utf8'); return raw.trim() ? JSON.parse(raw) : {}; } catch { return {}; }
}
const emit = obj => process.stdout.write(JSON.stringify(obj));
function addContext(event, text) {
  if (format === 'copilot') emit({ additionalContext: text });
  else emit({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

// Collect every file path mentioned in a tool call, whatever the tool calls the field.
function editedPaths(input) {
  const found = [];
  const visit = (v, depth) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') {
      // apply_patch style payloads
      for (const m of v.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) found.push(m[1].trim());
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
  addContext('SessionStart', lines.join('\n'));
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
  const id = String(input.session_id || input.sessionId || 'no-session');
  return path.join(os.tmpdir(), 'context-tools-session-' + require('crypto').createHash('sha1').update(id).digest('hex') + '.json');
}
function loadTouched(input) { try { return JSON.parse(fs.readFileSync(sessionFile(input), 'utf8')); } catch { return []; } }
function saveTouched(input, list) { try { fs.writeFileSync(sessionFile(input), JSON.stringify(list)); } catch { /* ignore */ } }

function hookPostEdit(input) {
  if (!looksLikeEdit(input.tool_name || input.toolName)) return;
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
}

function hookStop(input) {
  if (input.stop_hook_active) return;            // never block twice in a row: the agent cannot loop
  const touched = loadTouched(input);
  if (!touched.length) return;                   // the agent edited nothing: nothing to check
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
  if (!items.length) return;
  const marker = sessionFile(input) + '.stopped-' + require('crypto').createHash('sha1').update(items.join('|')).digest('hex').slice(0, 12);
  if (fs.existsSync(marker)) return;             // same list already shown in this session
  try { fs.writeFileSync(marker, String(Date.now())); } catch { /* ignore */ }
  emit({ decision: 'block', reason: 'Context check before finishing (files you edited in this session):\n' + items.slice(0, 10).join('\n') +
    '\nFix BROKEN anchors. For CHECK items, update the line only if its meaning changed, otherwise say it is still true. This check runs once.' });
}

function hookGuard(input) {
  if (!looksLikeEdit(input.tool_name || input.toolName)) return;
  const repo = resolveRepo(input);
  const bad = editedPaths(input).map(p => relTo(repo, p)).filter(rel => isOrgRule(rel) || !STEWARD_RES.some(r => r.test(rel)));
  if (!bad.length) return;
  const org = bad.filter(isOrgRule);
  const reason = org.length && org.length === bad.length
    ? `organisation rules change in the org context repo, not here; refused: ${org.join(', ')}`
    : `context-steward may only edit context files (not organisation rules); refused: ${bad.join(', ')}`;
  if (format === 'copilot') emit({ permissionDecision: 'deny', permissionDecisionReason: reason });
  else emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
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
  for (const f of ['.github/context-readiness.json', 'context-readiness.json']) {
    try { return { ...READINESS_DEFAULT, ...JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8')), source: f }; } catch { /* next */ }
  }
  return { ...READINESS_DEFAULT, source: 'default' };
}

// "> Dimension: data · Status: reviewed · Last verified: 2026-11-12 by A · Independent review: no"
function pageHeader(text) {
  const head = text.split(/\r?\n/).slice(0, 8).join('\n');
  const dim = /Dimension:\s*([a-z-]+)/i.exec(head);
  if (!dim) return null;
  const status = (/Status:\s*([a-z]+)/i.exec(head) || [])[1] || 'draft';
  const verified = (/Last verified:\s*(\d{4}-\d{2}-\d{2})/i.exec(head) || [])[1] || null;
  const independent = /Independent review:\s*yes/i.test(head);
  return { dimension: dim[1].toLowerCase(), status: status.toLowerCase(), verified, independent };
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
  if (!changedSinceCache.has(date)) {
    const log = git(repo, ['log', `--since=${date}T23:59:59`, '--name-only', '--format=']) || '';
    changedSinceCache.set(date, new Set(log.split(/\r?\n/).filter(Boolean).map(toPosix)));
  }
  return changedSinceCache.get(date);
}

// Share of claim lines (bullets, numbered steps, table rows) that carry an anchor, directly or via a
// "Source: [anchor: …]" line in the same section. Lines under "Unverified" are not claims.
function anchoredShare(text) {
  let claims = 0, anchored = 0, sectionSourced = false, unverified = false, prev = '';
  for (const line of text.split(/\r?\n/)) {
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

function cmdReadiness() {
  const repo = resolveRepo({});
  const cfg = readinessConfig(repo);
  const a = analyse(repo);
  const now = Date.now();
  const ratings = assessedRatings(repo);
  const pages = [];
  let claims = 0, anchoredClaims = 0;
  for (const f of a.ctx.contextFiles) {
    let text = ''; try { text = readText(repo, f); } catch { continue; }
    const h = pageHeader(text);
    if (f === 'AGENTS.md' || h) { const s = anchoredShare(text); claims += s.claims; anchoredClaims += s.anchored; }
    if (!h) continue;
    const anchors = a.ctx.anchors.filter(x => x.file === f);
    const broken = a.broken.filter(x => x.file === f).length;
    const age = h.verified ? Math.floor((now - Date.parse(h.verified)) / DAY) : null;
    const since = h.verified ? changedSince(repo, h.verified) : null;
    const stale = since ? anchors.filter(x => [...since].some(c => x.re.test(c))).length : 0;
    let cap = 2;
    if (h.status !== 'draft' && h.verified) cap = age > cfg.reviewMaxAgeDays ? 3 : (h.independent ? 5 : 4);
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
    let evidence = mine.map(p => `${p.file} (${p.status}${p.verified ? ' ' + p.verified : ''})`);
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
      : r.id === 'freshness' ? 'fix broken anchors, run /context-refresh, re-review old pages'
      : r.cap === 0 ? (r.id === 'code-understanding' ? 'run /context-bootstrap and build the code map' : 'no page yet: run /context-baseline')
      : r.cap <= 2 ? 'page is a draft or has broken anchors: owner reviews it and sets Last verified'
      : r.cap === 3 ? 'unanchored, stale or old review: add anchors, /context-refresh, re-review'
      : r.cap === 4 ? 'independent review by a second person (needed for 5)'
      : 'run /context-assess';
    return { ...r, how };
  });
  const result = { repo: path.basename(repo), config: cfg.source, total, band: band.name, rows, gaps,
    alwaysOnTokens: a.agents.tokens, alwaysOnBudget: ALWAYS_ON_TOKENS, pages };
  if (flag('--json')) { console.log(JSON.stringify(result, null, 2)); return; }
  console.log(`Context readiness: ${result.repo}  (weights: ${cfg.source})`);
  console.log('');
  console.log('| Dimension | Weight | Evidence | Cap | Rating | Points |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(`| ${r.label} | ${r.weight}% | ${r.evidence.join('; ') || 'none'} | ${r.cap === null ? 'measured' : r.cap} | ${r.rating}${r.provisional ? '*' : ''} | ${r.points} |`);
  console.log('');
  console.log(`Total: ${total} / 100 · ${band.name}`);
  if (rows.some(r => r.provisional)) console.log('* not assessed yet: provisional, at most 3 (run /context-assess)');
  console.log(`Always-loaded context: ≈ ${a.agents.tokens} tokens (budget ${ALWAYS_ON_TOKENS}). A high score with a large always-loaded size is a warning sign.`);
  if (gaps.length) { console.log('Biggest gaps:'); gaps.forEach(r => console.log(`  - ${r.label}: ${r.points} of ${r.weight} points. ${r.how}`)); }
}

// ---------------------------------------------------------------- main
const hooks = { 'session-start': hookSessionStart, 'post-edit': hookPostEdit, stop: hookStop, guard: hookGuard };
if (command === 'check') cmdCheck();
else if (command === 'status') cmdStatus();
else if (command === 'readiness') cmdReadiness();
else if (hooks[command]) {
  try {
    const input = readStdin();
    if (format === 'auto') format = ('hook_event_name' in input || 'tool_input' in input) ? 'claude' : 'copilot';
    hooks[command](input);
  } catch (e) {
    if (process.env.CONTEXT_TOOLS_DEBUG) process.stderr.write(String(e && e.stack || e) + '\n');
  }
  process.exitCode = 0; // a hook must never break the agent
} else {
  console.log('Usage: node context-tools.cjs check [--base <ref>] [--staged] [--strict] | status | readiness [--json] | session-start | post-edit | stop | guard');
  process.exitCode = command ? 2 : 0;
}
