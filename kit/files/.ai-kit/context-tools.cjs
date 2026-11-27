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
 *   pages-for <file> [<file> ...]  Context lines and pages that describe these files (anchored to them, or naming them).
 *   names [--json] [--all]         Code names the pages mention in backticks, and the ones the code does not have.
 *   schemas [--write] [--json]     Which repo changes each database schema and which only read it (from migrations,
 *                                  entities and SQL); --write records it in the home repo's catalog.json.
 *   migrate [--dry-run]            Upgrade context pages to the current kit format (no AI, no tokens).
 *   schema-import <schema.sql|schema.json> [--out docs/context/data] [--dry-run]
 *                                  Build or refresh one page per table from a DDL dump or a tbls schema.json. Only the
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
 * Names: pages name the code they describe in backticks (`OrderService.remove`, `OrderVoided`, `deleted_at`,
 *   `orders.id`, a file path). check warns about names the code does not have; at commit and in a pull request,
 *   about names the change removes, on this repo's pages and (in a workspace) the home repo's. A page lists
 *   names that are deliberately not in this code with <!-- names: ignore A, B -->. --no-names skips it.
 * Anchors (optional): [anchor: <path>] at the end of a context line points it at a file. <path> can be a
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

// With --staged, a file without unstaged edits is the same on disk as in the commit: read it from disk
// (one git call per file made the commit check slow with hundreds of table pages).
const unstagedCache = new Map();
function readText(repo, rel) {
  if (STAGED) {
    if (!unstagedCache.has(repo)) unstagedCache.set(repo, new Set((git(repo, ['diff', '--name-only', '-z']) || '').split('\0').filter(Boolean).map(toPosix)));
    if (unstagedCache.get(repo).has(rel) || !exists(path.join(repo, rel))) { const t = git(repo, ['show', ':' + rel]); if (t !== null) return t; }
  }
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
    let gen = false;   // inside a block a tool writes (schema-import): the tool keeps it current, not people
    text.split(/\r?\n/).forEach((line, idx) => {
      if (line.includes('<!-- generated:start')) gen = true;
      for (const m of line.matchAll(/\[anchor:\s*([^\]]+)\]/g)) {
        for (const { pattern, re } of anchorPatterns(repo, m[1])) {
          anchors.push({ file: cf, line: idx + 1, text: line.trim().slice(0, 140), pattern, re, generated: gen });
        }
      }
      if (line.includes('<!-- generated:end')) gen = false;
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
    if (changed.includes(a.file) || a.generated) continue;   // generated anchors: see dataFreshness
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

// ---------------------------------------------------------------- product workspace
// Workspace mode: one home repo holds the kit's tools and the product context; each member repo holds only
// its own knowledge (AGENTS.md, rule files, docs/context, openspec) and a small stamp pointing at the home.
function workspaceHome(repo) {
  const st = kitStamp(repo);
  if (st && st.mode === 'workspace') return repo;
  if (st && st.mode === 'member' && st.workspace) { const h = path.resolve(repo, st.workspace); if (exists(path.join(h, '.ai-kit', 'kit.json'))) return h; }
  return null;
}
function members(home) {
  const cat = readJson(path.join(home, 'catalog.json'));
  if (!cat || !Array.isArray(cat.repos)) return [];
  const base = path.resolve(home, cat.reposDir || '..');
  return cat.repos.map(r => ({ name: r.name, dir: r.path ? path.resolve(home, r.path) : path.join(base, r.name) }));
}
// Folders in product.code-workspace that are git repos but not in catalog.json yet.
function unregistered(home) {
  const ws = readJson(path.join(home, 'product.code-workspace'));
  if (!ws || !Array.isArray(ws.folders)) return [];
  const known = new Set(members(home).map(m => path.resolve(m.dir)));
  return ws.folders.map(f => path.resolve(home, f.path)).filter(d => d !== path.resolve(home) && !known.has(d) && exists(path.join(d, '.git')));
}

// ---------------------------------------------------------------- names
// Pages name the code they describe in backticks: `OrderService.remove`, `OrderVoided`, `deleted_at`,
// `orders.id`, `src/main/.../Order.java`. The check looks each name up in the code (git grep) and in the
// schema exports, and warns when a page names something the code no longer has. It needs no anchors.
const NAME_EXT = /\.(md|mdc|json|ya?ml|java|kt|kts|ts|tsx|js|jsx|mjs|cjs|sql|ddl|xml|html|scss|css|properties|txt|sh|ps1|py|gradle|toml)$/i;
function nameKind(raw) {
  const t = raw.replace(/\(\)$/, '');
  if (t.length < 4 || t.length > 160 || /[\s<>{}"'=,;|*$@\\]/.test(t) || /^[a-z]+:\/\//i.test(t) || /^[-.]/.test(t)) return null;
  if (t.includes('/')) return NAME_EXT.test(t) && !t.includes('...') && !t.startsWith('/') && !/^[A-Za-z0-9_.-]+:/.test(t) ? 'path' : null;
  if (NAME_EXT.test(t)) return /^[A-Za-z0-9_.-]+$/.test(t) ? 'file' : null;
  if (/^[A-Z][A-Za-z0-9]*\.[a-z_][A-Za-z0-9_]*$/.test(t)) return 'member';                 // OrderService.remove
  if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,2}$/.test(t)) return 'dotted';                // orders.id, billing.invoices.order_id, a.config.key
  if (/^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+$/.test(t)) return 'word';                         // OrderVoided, OrderService
  if (/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(t)) return 'word';                           // cancelledAt
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(t)) return 'word';                               // deleted_at
  return null;
}
// Names a page mentions: backticked spans outside fenced code and generated blocks; a page can list names
// that are deliberately not in this code (another team's event, a planned class): <!-- names: ignore A, B -->
function pageNames(text) {
  const ignore = new Set();
  for (const m of text.matchAll(/<!--\s*names:\s*ignore\s+([^>]*?)-->/gi)) m[1].split(/[,\s]+/).filter(Boolean).forEach(x => ignore.add(x.replace(/`/g, '')));
  const out = [];
  let fence = false, gen = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return; }
    if (line.includes('<!-- generated:start')) gen = true;
    if (line.includes('<!-- generated:end')) { gen = false; return; }
    if (fence || gen) return;
    for (const m of line.replace(/\[anchor:[^\]]*\]/g, '').matchAll(/`([^`\n]+)`/g)) {
      const name = m[1].trim().replace(/\(\)$/, ''), kind = nameKind(name);
      if (kind && !ignore.has(name)) out.push({ name, kind, line: i + 1, text: line.trim().slice(0, 140) });
    }
  });
  return out;
}
const CODE_SPEC = ['--', '.', ':(exclude,glob)**/*.md', ':(exclude,glob)**/*.mdc', ':(exclude).ai-kit', ':(exclude).github', ':(exclude).claude', ':(exclude).agents', ':(exclude)openspec', ':(exclude)graphify-out'];
// rev: null = working tree (with untracked files), ':' = the index (the commit being made), else a commit.
const revArgs = rev => rev === null ? ['--untracked'] : rev === ':' ? ['--cached'] : [rev];
// One git grep for all the words: which files each one occurs in (a Map of word → Set of files).
function wordsFound(repo, words, rev) {
  const found = new Map();
  if (!words.length) return found;
  const tmp = path.join(os.tmpdir(), `ai-kit-names-${process.pid}-${Date.now()}.txt`);
  const prefix = rev && rev !== ':' ? rev + ':' : '';
  try {
    for (const [flags, list] of [[['-w'], words.filter(w => !w.includes('.') && !w.includes('/'))], [[], words.filter(w => w.includes('.') || w.includes('/'))]]) {
      if (!list.length) continue;
      fs.writeFileSync(tmp, list.join('\n') + '\n');
      const out = git(repo, ['grep', '-I', '-o', '-F', ...flags, '-f', tmp, ...revArgs(rev), ...CODE_SPEC]);
      for (let line of (out || '').split('\n')) {
        if (!line) continue;
        if (prefix && line.startsWith(prefix)) line = line.slice(prefix.length);
        const i = line.lastIndexOf(':'); if (i < 0) continue;
        const w = line.slice(i + 1).trim(), f = line.slice(0, i);
        if (!found.has(w)) found.set(w, new Set());
        found.get(w).add(f);
      }
    }
  } finally { try { fs.unlinkSync(tmp); } catch { /* gone */ } }
  return found;
}
const shareFile = (found, a, b) => { const x = found.get(a), y = found.get(b); if (!x || !y) return false; for (const f of x) if (y.has(f)) return true; return false; };
function filesAt(repo, rev) {
  if (rev === null) return listFiles(repo);
  const out = rev === ':' ? git(repo, ['ls-files', '-z', '--cached']) : git(repo, ['ls-tree', '-r', '-z', '--name-only', rev]);
  return (out || '').split('\0').filter(Boolean);
}
const showAt = (repo, rev, rel) => rev === null ? (() => { try { return fs.readFileSync(path.join(repo, rel), 'utf8'); } catch { return null; } })() : git(repo, ['show', (rev === ':' ? ':' : rev + ':') + rel]);
// Columns from every schema export a repo has imported: "table.column" and "schema.table.column".
function schemaColumns(repo, rev, files) {
  const cols = new Set(), tables = new Set();
  const ctxFiles = (files || filesAt(repo, rev)).filter(isContextFile);
  const srcs = [];
  for (const f of ctxFiles.filter(x => /(^|\/)index\.md$/.test(x))) {
    const t = showAt(repo, rev, f) || '';
    const m = /<!-- generated:start schema-import[^\n]*\n\s*Source:\s*\[anchor:\s*([^\]]+)\]/.exec(t);
    if (m) srcs.push(m[1].trim());
  }
  for (const s of srcs) {
    const text = showAt(repo, rev, s); if (!text) continue;
    let schema = null;
    if (/\.(sql|ddl)$/i.test(s)) schema = parseDdl(text); else { try { schema = JSON.parse(text); } catch { /* not json */ } }
    for (const t of (schema && schema.tables) || []) {
      const full = t.name.toLowerCase(), bare = bareName(t.name).toLowerCase();
      tables.add(full); tables.add(bare);
      for (const c of t.columns || []) { const cn = c.name.toLowerCase(); cols.add(`${bare}.${cn}`); cols.add(`${full}.${cn}`); }
    }
  }
  return { cols, tables, exports: srcs };
}
// Which of these names the code (in any of the repos) has, at a revision. Returns a Set of names.
function namesPresent(scopes, names) {
  const present = new Set();
  const uniq = [...new Map(names.map(n => [n.name, n])).values()];
  for (const { repo, rev } of scopes) {
    const todo = uniq.filter(n => !present.has(n.name));
    if (!todo.length) break;
    const files = filesAt(repo, rev);
    const sc = todo.some(n => n.kind === 'dotted') ? schemaColumns(repo, rev, files) : null;
    const words = new Set();
    for (const n of todo) {
      if (n.kind === 'path') { if (files.some(f => f === n.name || f.endsWith('/' + n.name))) present.add(n.name); }
      else if (n.kind === 'file') { if (files.some(f => path.posix.basename(f) === n.name)) present.add(n.name); }
      else if (n.kind === 'dotted') {
        const k = n.name.toLowerCase(), tbl = k.split('.').slice(0, -1).join('.');
        if (sc.cols.has(k) || sc.tables.has(k)) present.add(n.name);
        else if (!sc.tables.has(tbl)) { words.add(n.name); words.add(tbl); words.add(k.split('.').pop()); }   // an export has this table but not the column: missing
      }
      else if (n.kind === 'member') { const [c, m] = n.name.split('.'); words.add(c); words.add(m); }
      else words.add(n.name);
    }
    const found = wordsFound(repo, [...words], rev);
    for (const n of todo) {
      if (present.has(n.name)) continue;
      if (n.kind === 'word') { if (found.has(n.name)) present.add(n.name); }
      else if (n.kind === 'dotted') {   // no export has the table: the literal (a config key, a package), or table and column in one file (a migration)
        if (!words.has(n.name)) continue;
        const parts = n.name.toLowerCase().split('.'), col = parts.pop(), tbl = parts.join('.');
        if (found.has(n.name) || shareFile(found, tbl, col)) present.add(n.name);
      }
      else if (n.kind === 'member') { const [c, m] = n.name.split('.'); if (shareFile(found, c, m)) present.add(n.name); }
    }
  }
  return present;
}
// Lines removed by this change (commit: staged; pull request: since the merge base); null when no change.
function removedText(repo, base) {
  if (STAGED) return git(repo, ['diff', '--cached', '-U0', '--no-color']) || '';
  if (base) { const mb = (git(repo, ['merge-base', base, 'HEAD']) || '').trim(); return mb ? (git(repo, ['diff', '-U0', '--no-color', mb]) || '') : null; }
  return null;
}
// The names check. Without a change (plain `check`): every name the code does not have. With a change
// (commit or pull request): only names this change removed, and names in pages this change edits.
// `pages` are [{ repo, file, text }]: this repo's pages, and in a workspace the home repo's pages too.
function nameFindings(repo, pages, { base, changed = [], home = null } = {}) {
  const findings = [];
  const all = [];
  for (const p of pages) for (const n of pageNames(p.text)) all.push({ ...n, page: p });
  if (!all.length) return findings;
  const scopeNow = [{ repo, rev: STAGED ? ':' : null }];
  const others = home ? [home, ...members(home).map(m => m.dir)].filter(d => path.resolve(d) !== path.resolve(repo) && exists(path.join(d, '.git'))) : [];
  const diff = removedText(repo, base);
  if (diff === null) {   // plain check: everything, looking in this repo and (in a workspace) the others
    const present = namesPresent(scopeNow.concat(others.map(d => ({ repo: d, rev: null }))), all);
    for (const n of all) if (!present.has(n.name)) findings.push({ ...n, why: 'missing' });
    return findings;
  }
  const minus = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).join('\n');
  const touched = all.filter(n => n.name.split(/[./]/).some(part => part.length > 1 && minus.includes(part)));
  const baseRev = STAGED ? 'HEAD' : (git(repo, ['merge-base', base, 'HEAD']) || '').trim();
  if (touched.length && baseRev) {
    const before = namesPresent([{ repo, rev: baseRev }], touched);
    const now = namesPresent(scopeNow, touched.filter(n => before.has(n.name)));
    for (const n of touched) if (before.has(n.name) && !now.has(n.name)) findings.push({ ...n, why: 'removed' });
  }
  const edited = all.filter(n => n.page.repo === repo && changed.includes(n.page.file) && !findings.some(f => f.name === n.name));
  if (edited.length) {
    const present = namesPresent(scopeNow.concat(others.map(d => ({ repo: d, rev: null }))), edited);
    for (const n of edited) if (!present.has(n.name)) findings.push({ ...n, why: 'missing' });
  }
  return findings;
}
function namePages(repo, contextFiles, home) {
  const pages = [];
  for (const f of contextFiles.filter(x => x.endsWith('.md') || x.endsWith('.mdc'))) { try { pages.push({ repo, file: f, text: readText(repo, f) }); } catch { /* unreadable */ } }
  if (home && path.resolve(home) !== path.resolve(repo)) {
    for (const f of listFilesPlain(home).filter(isContextFile).filter(x => x.endsWith('.md'))) {
      try { pages.push({ repo: home, file: f, text: fs.readFileSync(path.join(home, f), 'utf8'), home: true }); } catch { /* unreadable */ }
    }
  }
  return pages;
}
function listFilesPlain(repo) { const o = git(repo, ['ls-files', '-z', '-co', '--exclude-standard']); return o === null ? walk(repo, repo, []) : o.split('\0').filter(Boolean); }
const nameWhere = (n, repo) => (n.page.repo === repo ? '' : path.basename(n.page.repo) + ':') + `${n.page.file}:${n.line}`;
function nameMessage(n, repo) {
  const where = nameWhere(n, repo);
  if (n.why === 'removed') return `${where}  names \`${n.name}\`, which this change removes from the code${n.page.repo !== repo ? ' (a product page: update it in the home repo, and tell the teams that rely on it)' : ''}: update the page, or keep the name`;
  return `${where}  names \`${n.name}\`, which the code does not have${n.kind === 'dotted' ? ' (nor any imported schema)' : ''}. Fix the page, or mark it: <!-- names: ignore ${n.name} -->`;
}

// ---------------------------------------------------------------- check
function runCheck(repo, { base, strict } = {}) {
  const errors = [], warnings = [];
  if (base && git(repo, ['rev-parse', '--verify', '--quiet', base + '^{commit}']) === null) {
    return { fatal: `--base "${base}" is not a branch or commit here. Try "git fetch", or use origin/main, origin/master or origin/develop.` };
  }
  const a = analyse(repo, base);
  for (const b of a.broken) errors.push(`${b.file}:${b.line}  anchor points at a file that does not exist: ${b.pattern}`);
  for (const s of a.stale) warnings.push(`${s.file}:${s.line}  anchored code changed (${s.hit}) but this context file did not: is the line still true?`);
  // Home-repo pages (flows, platform rules, data across services) that anchor into this repo.
  const home = workspaceHome(repo);
  if (home && path.resolve(home) !== path.resolve(repo)) {
    for (const p of productAnchors(repo)) if (!a.files.some(f => p.re.test(f))) warnings.push(`${p.file}:${p.line}  a product page anchors a file this repo no longer has: update the page in the home repo`);
  }
  for (const w of ownershipFindings(repo, home, a.changed)) warnings.push(w);
  if (!flag('--no-names')) {
    const nf = nameFindings(repo, namePages(repo, a.ctx.contextFiles, home), { base, changed: a.changed, home });
    const shown = nf.slice(0, base || STAGED ? 30 : 12);
    for (const n of shown) warnings.push(nameMessage(n, repo));
    if (nf.length > shown.length) warnings.push(`${nf.length - shown.length} more page name(s) not found in the code. List them all: ${toolCmd} names`);
  }
  if (!a.agentsMd) warnings.push('No AGENTS.md at the repo root. Run /context-create to create one.');
  else if (a.agentsMd.lines > MAX_AGENTS_LINES) warnings.push(`AGENTS.md has ${a.agentsMd.lines} lines (budget ${MAX_AGENTS_LINES}). Move detail into docs/context/ or a skill.`);
  const o = orgState(repo);
  if (o && o.outdated.length) warnings.push(`Org rules are older than your local ${o.name} clone (${o.outdated.join(', ')}). Re-sync: node <kit>/kit/install.mjs . --org ${o.path}`);
  if (o && o.editedHere.length) warnings.push(`Org rules edited in this repo (${o.editedHere.join(', ')}). Change them in the org context repo instead; the next sync replaces local edits.`);
  if (a.agents.tokens > ALWAYS_ON_TOKENS) warnings.push(`Always-on context is about ${a.agents.tokens} tokens (budget ${ALWAYS_ON_TOKENS}): ${a.agents.items.map(i => i.file).join(', ')}.`);
  const old = oldFormatPages(repo, a.ctx.contextFiles);
  if (old.length) warnings.push(`${old.length} page(s) use the 1.x status line (${old.slice(0, 3).join(', ')}${old.length > 3 ? ' …' : ''}). Run: ${toolCmd} migrate`);
  for (const d of dataFreshness(repo, a, { changedOnly: !!(STAGED || base) })) warnings.push(...(d.warn ? [d.warn] : d.warns));
  if (STAGED) for (const f of conventionFindings(repo, { branch: (git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim() })) (f.block ? errors : warnings).push(`Naming: ${f.text}. Run: ${toolCmd} conventions name --type <type> --id <id> --summary "<what changed>"`);
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
  let user = `AI context kit: ${a.ctx.contextFiles.length} context files, ${a.ctx.anchors.length} anchors, ${a.broken.length} broken${active.length ? `, active change: ${active.join(', ')}` : ''}.`;
  if (workspaceHome(repo) === repo) {
    const ms = members(repo).filter(m => exists(path.join(m.dir, '.git')));
    const noContext = [];
    const parts = ms.map(m => {
      const ma = analyse(m.dir);
      if (!ma.agentsMd) noContext.push(m.name);
      const act = activeChanges(m.dir);
      return `${m.name}: ${ma.agentsMd ? `${ma.ctx.contextFiles.length} context files, ${ma.broken.length} broken` : 'no context yet'}${act.length ? `, changes: ${act.join(', ')}` : ''}`;
    });
    lines.splice(1, 0, `Product workspace (this is the home repo: kit tools and product context). Repos: ${parts.join('; ') || 'none registered'}.`,
      'Each repo keeps its own AGENTS.md, rule files and docs/context; read a repo\'s AGENTS.md before working in it. Run OpenSpec commands inside the repo that changes, never in the home repo.');
    if (noContext.length) lines.push(`No context yet in: ${noContext.join(', ')}. Suggest /context-create for each.`);
    const extra = unregistered(repo);
    if (extra.length) lines.push(`Open in the workspace but not registered: ${extra.map(d => path.basename(d)).join(', ')}. Register with: node <kit>/install.mjs <repo> --workspace ${path.basename(repo)}`);
    user = `AI context kit (product workspace): ${ms.length} repo(s)${noContext.length ? `, no context yet: ${noContext.join(', ')}` : ''}${extra.length ? `, not registered: ${extra.map(d => path.basename(d)).join(', ')}` : ''}.`;
  }
  lines.push('Context files describe this code; when an edit changes what a context line says, the line is updated in the same change.');
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

// Which context pages agents actually open: one line per read in the page's own repo (.git/ai-kit/reads.jsonl),
// so `usage` can show the pages that help and the ones nobody opens.
const looksLikeRead = name => !!name && /^(read|view|open)|read_?file|readfile|view_?file/i.test(name);
function readsLogPath(repo) { const d = gitDir(repo); return d ? path.join(d, 'ai-kit', 'reads.jsonl') : null; }
// A shell command an agent ran (Claude Code Bash, Copilot bash/powershell, VS Code run_in_terminal).
function shellCommand(input) {
  let args = input.tool_input !== undefined ? input.tool_input : input.toolArgs;
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return null; } }
  const c = args && (args.command || args.cmd || args.script);
  return typeof c === 'string' ? c : null;
}
// Files a shell command prints: cat, head, tail, less, sed, nl, bat, type, Get-Content and friends, with
// `cd <dir> &&` and a simple * in the last path segment understood. Agents often read pages this way.
function shellReadPaths(command, baseDir) {
  const found = [];
  let dir = baseDir;
  for (const part of command.split(/&&|;|\|\||\n/)) {
    const words = part.trim().match(/"[^"]*"|'[^']*'|\S+/g) || [];
    const clean = words.map(w => w.replace(/^["']|["']$/g, ''));
    if (clean[0] === 'cd' && clean[1]) { dir = path.resolve(dir, clean[1].replace(/^~(?=\/)/, os.homedir())); continue; }
    if (!clean.some(w => /^(cat|head|tail|less|more|bat|sed|nl|awk|type|Get-Content|gc)$/i.test(w))) continue;
    if (clean.includes('sed') && clean.some(w => /^-i/.test(w))) continue; // an in-place edit, not a read
    for (const [i, w] of clean.entries()) {
      if (/^>/.test(w) || /^>>?$/.test(clean[i - 1] || '')) continue; // written to, not read
      if (w.startsWith('-') || !/\.(md|mdc|json|ya?ml)$/i.test(w)) continue;
      const abs = path.resolve(dir, w);
      if (!w.includes('*')) { found.push(abs); continue; }
      const d = path.dirname(abs), re = new RegExp('^' + path.basename(abs).split('*').map(escRe).join('.*') + '$');
      try { for (const f of fs.readdirSync(d)) if (re.test(f)) found.push(path.join(d, f)); } catch { /* no such folder */ }
    }
  }
  return [...new Set(found)];
}
function logReads(input, paths) {
  const sessionRepo = resolveRepo(input);
  const logged = [];
  for (const p of paths || editedPaths(input)) {
    const abs = path.isAbsolute(p) ? p : path.join(sessionRepo, p);
    const repo = repoOfFile(abs) || sessionRepo;
    const rel = toPosix(path.relative(repo, abs));
    if (rel.startsWith('..') || !isContextFile(rel)) continue;
    const lp = readsLogPath(repo); if (!lp) continue;
    try {
      fs.mkdirSync(path.dirname(lp), { recursive: true });
      fs.appendFileSync(lp, JSON.stringify({ t: new Date().toISOString(), page: rel, session: sessionId(input) }) + '\n');
      const st = fs.statSync(lp);
      if (st.size > 1024 * 1024) { const lines = fs.readFileSync(lp, 'utf8').trim().split('\n'); fs.writeFileSync(lp, lines.slice(-5000).join('\n') + '\n'); }
      logged.push(rel);
    } catch { /* never fail a hook */ }
  }
  return { reads: logged };
}
function hookPostEdit(input) {
  const cmd = shellCommand(input);
  if (cmd !== null) return logReads(input, shellReadPaths(cmd, input.cwd ? path.resolve(input.cwd) : resolveRepo(input)));
  if (looksLikeRead(input.tool_name || input.toolName)) return logReads(input);
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
      if (a.generated) {
        const src = schemaSources(repo, contexts.get(repo).contextFiles).find(x => a.file.startsWith(x.outDir + '/'));
        const n = `${label} appears in the generated part of ${a.file}. If this edit changes entities, columns, queries or migrations, run ${toolCmd} schema-import ${src ? src.file : '<schema file>'} before you finish (it rewrites only the generated parts). Never edit between the generated markers.`;
        if (!notes.some(x => x.startsWith(`${label} appears in the generated part`))) notes.push(n);
        continue;
      }
      notes.push(`${label} is referenced by ${repo === sessionRepo ? '' : path.basename(repo) + '/'}${a.file}:${a.line} ("${a.text}").`);
    }
  }
  saveTouched(input, touched.slice(-500));
  if (notes.length) addContext('PostToolUse', notes.slice(0, 5).join('\n') + (notes.some(n => / is referenced by /.test(n)) ? '\nIf this edit changed what that line describes, update the line in the same change; otherwise no action is needed.' : ''));
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
      if (a.generated && !mine.has(a.file)) continue;
      if (!files.some(f => a.re.test(f))) {
        // broken: report it when the agent touched its context file or (likely) moved/deleted its target
        if (mine.has(a.file) || [...mine].some(r => a.re.test(r))) items.push(`- BROKEN ${label(a.file)}:${a.line} anchors ${a.pattern}, which no longer exists.`);
        continue;
      }
      if (a.generated) continue;                 // schema-import keeps these; see the data check below
      if (mine.has(a.file)) continue;            // the agent already revisited this context file
      const hit = [...mine].find(r => !isContextFile(r) && a.re.test(r));
      if (hit) items.push(`- CHECK ${label(a.file)}:${a.line} ("${a.text.slice(0, 80)}") is anchored to ${label(hit)}, which you edited.`);
    }
    // Table pages: re-plan the import for the files this session changed (no writing).
    for (const d of dataFreshness(repo, { files, ctx, changed: [...mine] }, { changedOnly: true })) {
      if (d.stale && d.stale.length) items.push(`- RUN ${toolCmd} schema-import ${d.src.file}${repo === sessionRepo ? '' : ` --repo ${path.basename(repo)}`}: ${d.stale.length} table page(s) no longer match the code you changed. It rewrites only the generated parts; show the diff.`);
      for (const x of (d.mismatches || []).filter(m => mine.has(m.file)).slice(0, 3)) items.push(`- MISMATCH ${x.text}: fix the mapping, or tell the user the schema file may be out of date.`);
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
  const home = workspaceHome(repo);
  if (home && home !== repo) { const j = readJson(path.join(home, '.ai-kit', 'readiness.json')); if (j) return { ...READINESS_DEFAULT, ...j, source: path.basename(home) + '/.ai-kit/readiness.json' }; }
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
  let claims = 0, anchored = 0, sectionSourced = false, unverified = false, prev = '', inGen = false, genSourced = false;
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
  for (const line of body.split(/\r?\n/)) {
    // A generated block is traceable as a whole when its Source line is anchored (schema-import writes one).
    if (line.includes('<!-- generated:start')) { inGen = true; genSourced = false; continue; }
    if (line.includes('<!-- generated:end')) { inGen = false; continue; }
    if (inGen && /^\s*(Source|Sources):.*\[anchor:/i.test(line)) genSourced = true;
    if (/^#{1,6}\s/.test(line)) { sectionSourced = false; unverified = /unverified/i.test(line); prev = line; continue; }
    if (/^\s*(Source|Sources):.*\[anchor:/i.test(line)) sectionSourced = true;
    const isRow = /^\s*\|/.test(line) && !/^\s*\|\s*:?-{3}/.test(line);
    const isHeaderRow = isRow && !/^\s*\|/.test(prev);
    const isClaim = !unverified && !/^\s*>/.test(line) && !/<[^>]+>/.test(line) &&
      (/^\s*([-*]|\d+\.)\s+\S/.test(line) || (isRow && !isHeaderRow));
    // Traceable: the line names the code it is about in backticks (the names check keeps that true), or anchors it.
    const named = [...line.matchAll(/`([^`\n]+)`/g)].some(m => nameKind(m[1].trim()));
    if (isClaim) { claims++; if (named || /\[anchor:/.test(line) || sectionSourced || (inGen && genSourced)) anchored++; }
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
    const stale = since ? anchors.filter(x => !x.generated && [...since].some(c => x.re.test(c))).length : 0;
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
      evidence = [`${anchoredClaims} of ${claims} statements name the code they describe, or anchor it (${Math.round(share * 100)}%)`];
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
    const how = r.id === 'provenance' ? 'name the code each statement is about in backticks (`OrderService.cancel`, `orders.status`), or anchor it'
      : r.id === 'freshness' ? 'fix broken anchors, run /context-update, re-review old pages'
      : r.cap === 0 ? (r.id === 'code-understanding' ? 'run /context-create and build the code map' : 'no page yet: run /context-create deep')
      : r.cap <= 2 ? 'page is a draft or has broken anchors: owner reviews it, sets status: stable and adds a verified entry'
      : r.cap === 3 ? 'statements without code names, stale or old review: name the code, /context-update, re-review'
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
// In a product workspace, the home repo's pages (flows, platform rules) anchor into member repos as
// `<repo>:<path>`. These are the product lines about a member repo's files.
function productAnchors(repo) {
  const home = workspaceHome(repo);
  if (!home || path.resolve(home) === path.resolve(repo)) return [];
  const me = members(home).find(m => path.resolve(m.dir) === path.resolve(repo));
  const name = me ? me.name : path.basename(repo);
  const out = [];
  for (const cf of listFiles(home).filter(isContextFile)) {
    let text; try { text = fs.readFileSync(path.join(home, cf), 'utf8'); } catch { continue; }
    text.split(/\r?\n/).forEach((line, idx) => {
      for (const m of line.matchAll(/\[anchor:\s*([^\]]+)\]/g)) {
        for (let p of m[1].split(',')) {
          p = p.trim().replace(/^[`'"]+|[`'"]+$/g, '').replace(/\\/g, '/').replace(/#.*$/, '');
          const mm = /^([A-Za-z0-9_.-]{2,}):(.+)$/.exec(p);
          if (!mm || mm[1] !== name) continue;
          let g = mm[2].replace(/:\d+(-\d+)?$/, '').replace(/^\.\//, '');
          if (g.endsWith('/')) g += '**';
          out.push({ file: toPosix(path.relative(repo, path.join(home, cf))), line: idx + 1, text: line.trim().slice(0, 140), re: globToRegex(g), product: true });
        }
      }
    });
  }
  return out;
}
// The names a file goes by on a page: OrderService.java → OrderService; order-details.component.ts →
// OrderDetailsComponent; the file name and its path.
function fileNames(rel) {
  const base = path.posix.basename(rel), stem = base.replace(/\.[^.]+$/, '');
  const pascal = stem.split(/[-_.]/).filter(Boolean).map(x => x[0].toUpperCase() + x.slice(1)).join('');
  return { base, rel, words: [...new Set([stem, pascal].filter(w => /^[A-Za-z][A-Za-z0-9]{3,}$/.test(w) && /[A-Z]/.test(w)))] };
}
function pagesFor(repo, files) {
  const list = listFiles(repo);
  const ctx = readContext(repo, list);
  const all = ctx.anchors.concat(productAnchors(repo));
  const home = workspaceHome(repo);
  let named = null;   // pages that name a file's class or path in backticks, without an anchor
  const out = [];
  for (const raw of files) {
    const rel = relTo(repo, raw);
    const hits = all.filter(a => a.re.test(rel));
    const pages = [...new Set(hits.map(h => h.file))];
    if (!named) { named = []; for (const p of namePages(repo, ctx.contextFiles, home)) for (const n of pageNames(p.text)) named.push({ ...n, shown: p.repo === repo ? p.file : toPosix(path.relative(repo, path.join(p.repo, p.file))) }); }
    const fn = fileNames(rel);
    const mentioned = named.filter(n => !pages.includes(n.shown) && (n.name === fn.rel || n.name === fn.base || n.name.endsWith('/' + fn.base) ||
      fn.words.some(w => n.name === w || n.name.startsWith(w + '.'))));
    const seen = new Set();
    const ment = mentioned.filter(m => { const k = m.shown + ':' + m.line; if (seen.has(k)) return false; seen.add(k); return true; });
    out.push({ file: rel, pages: pages.concat([...new Set(ment.map(m => m.shown))].filter(x => !pages.includes(x))), lines: hits.map(h => ({ file: h.file, line: h.line, text: h.text })).concat(ment.map(m => ({ file: m.shown, line: m.line, text: m.text, mentioned: true }))) });
  }
  return out;
}
// ---------------------------------------------------------------- conventions (branch and pull request names)
// .ai-kit/conventions.json in the repo, else the workspace home's copy. Each type maps a kind of work item to a
// branch pattern and a title prefix, so an engineering-metrics tool can read what kind of work a PR is.
function loadConventions(repo) {
  for (const dir of [repo, workspaceHome(repo)].filter(Boolean)) {
    const c = readJson(path.join(dir, '.ai-kit', 'conventions.json'));
    if (c && Array.isArray(c.types)) return c;
  }
  return null;
}
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wildRe = w => new RegExp('^' + w.split('*').map(escRe).join('.*') + '$');
const patternRe = (tpl, anchorEnd = true) => new RegExp('^' + escRe(tpl).replace(/\\\{id\\\}/g, '[A-Za-z]*-?\\d+').replace(/\\\{slug\\\}/g, '[a-z0-9]+(-[a-z0-9]+)*').replace(/\\\{summary\\\}/g, '\\S.*').replace(/\\\{(from|to)\\\}/g, '\\S+') + (anchorEnd ? '$' : ''));
const slugify = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => !/^(a|an|the|to|of|for|and|in|on|from|with)$/.test(w)).slice(0, 6).join('-').slice(0, 48).replace(/-+$/, '');
function typeFor(c, { workItemType, foundIn, tags }) {
  const tagList = String(tags || '').split(/[;,]/).map(t => t.trim().toLowerCase()).filter(Boolean);
  const wit = String(workItemType || '').toLowerCase(), found = String(foundIn || '').toLowerCase();
  const tagged = c.types.find(t => t.tag && tagList.includes(t.tag.toLowerCase()) && (!t.workItemTypes || !wit || t.workItemTypes.some(w => w.toLowerCase() === wit)));
  if (tagged) return tagged;
  const byType = c.types.filter(t => !t.tag && (t.workItemTypes || []).some(w => w.toLowerCase() === wit));
  if (byType.length <= 1) return byType[0] || null;
  return byType.find(t => (t.foundIn || []).some(f => f.toLowerCase() === found)) || null;   // a Bug: decided by Found In
}
function checkBranch(c, branch) {
  if (!branch || branch === 'HEAD') return { ok: true, note: 'no branch (detached)' };
  const b = branch.replace(/^refs\/heads\//, '');
  if ((c.exempt && c.exempt.branches || []).some(w => wildRe(w).test(b))) return { ok: true, exempt: true };
  const t = c.types.find(x => patternRe(x.branch).test(b));
  return t ? { ok: true, type: t.type } : { ok: false, problem: `branch "${b}" does not follow the naming convention (${c.types.map(x => x.branch).join(', ')})` };
}
function checkTitle(c, title) {
  if (!title) return { ok: true };
  if ((c.exempt && c.exempt.titles || []).some(w => wildRe(w).test(title))) return { ok: true, exempt: true };
  const t = c.types.find(x => patternRe(x.title).test(title));
  return t ? { ok: true, type: t.type } : { ok: false, problem: `pull request title "${title}" does not follow the convention (${c.types.map(x => x.title).join(', ')})` };
}
function conventionFindings(repo, { branch, title }) {
  const c = loadConventions(repo);
  if (!c || c.check === 'off') return [];
  const out = [];
  const b = checkBranch(c, branch); if (!b.ok) out.push(b.problem);
  const t = checkTitle(c, title); if (!t.ok) out.push(t.problem);
  if (b.ok && t.ok && b.type && t.type && b.type !== t.type) out.push(`branch says ${b.type} but the title says ${t.type}`);
  return out.map(text => ({ text, block: c.check === 'block' }));
}
function cmdConventions() {
  const repo = resolveRepo({});
  const c = loadConventions(repo);
  if (!c) { console.log('No .ai-kit/conventions.json here (or in the workspace home repo). Copy the kit\'s default and edit it.'); process.exitCode = 2; return; }
  const sub = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'show';
  if (sub === 'show') {
    console.log(`Branch and pull request convention (check: ${c.check || 'warn'}, branch creation: ${c.createBranch || 'ask'})`);
    for (const t of c.types) console.log(`  ${t.type.padEnd(8)} ${t.branch.padEnd(24)} ${t.title.padEnd(26)} ${t.when}`);
    if (c.exempt && c.exempt.note) console.log(`  Promotion: ${c.exempt.note}`);
    (c.rules || []).forEach(r => console.log(`  - ${r}`));
    return;
  }
  if (sub === 'type') {
    const t = typeFor(c, { workItemType: opt('--work-item-type'), foundIn: opt('--found-in'), tags: opt('--tags') });
    console.log(t ? t.type : `unknown: ask the person which it is (${c.types.map(x => x.type).join(', ')})`);
    if (!t) process.exitCode = 1;
    return;
  }
  if (sub === 'name') {
    const id = opt('--id'), summary = opt('--summary');
    const t = c.types.find(x => x.type === opt('--type')) || typeFor(c, { workItemType: opt('--work-item-type'), foundIn: opt('--found-in'), tags: opt('--tags') });
    if (!t || !id || !summary) { console.log(`Usage: conventions name --type ${c.types.map(x => x.type).join('|')} --id <work item id> --summary "<what changed>"`); process.exitCode = 2; return; }
    const fill = tpl => tpl.replace('{id}', id).replace('{slug}', slugify(summary)).replace('{summary}', summary.replace(/\s+/g, ' ').trim());
    const res = { type: t.type, category: t.category, branch: fill(t.branch), title: fill(t.title), link: (c.workItem && c.workItem.link || '#{id}').replace('{id}', id), changeId: `${id}-${slugify(summary)}` };
    if (flag('--json')) console.log(JSON.stringify(res, null, 2));
    else console.log(`type:      ${res.type} (${res.category})\nbranch:    ${res.branch}\ntitle:     ${res.title}\nlink:      ${res.link}  (put it in the pull request description)\nchange id: ${res.changeId}`);
    return;
  }
  if (sub === 'check-branch' || sub === 'check-title') {
    const value = argv[2] && !argv[2].startsWith('--') ? argv[2] : sub === 'check-branch' ? (git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim() : '';
    const r = sub === 'check-branch' ? checkBranch(c, value) : checkTitle(c, value);
    console.log(r.ok ? `ok${r.type ? `: ${r.type}` : r.exempt ? ': exempt (promotion or main branch)' : ''}` : r.problem);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  console.log('Usage: conventions [show] | type --work-item-type <t> [--found-in <v>] [--tags <a;b>] | name --type <t> --id <id> --summary "<text>" [--json] | check-branch [<name>] | check-title "<title>"');
  process.exitCode = 2;
}

// ---------------------------------------------------------------- usage (which pages agents read)
// ---------------------------------------------------------------- schema ownership
// Which repo changes each database schema (its migrations create, alter or fill the tables) and which repos
// only read it (entities, SQL). One schema export and one set of table pages per schema, kept by whoever
// changes it: one repo, a migrations repo, or (several repos, no owner) the home repo.
function defaultSchema(repo, files) {
  for (const f of files.filter(x => /(^|\/)application[^/]*\.(ya?ml|properties)$/i.test(x) && !TEST_RE.test(x)).slice(0, 20)) {
    let t; try { t = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
    const m = /(?:default[-_]schema|flyway[.\w-]*\.schemas|currentSchema)\s*[:=]\s*["']?([A-Za-z_][\w]*)/i.exec(t);
    if (m) return m[1].toLowerCase();
  }
  return null;
}
function schemaUse(repo, name) {
  const files = listFilesPlain(repo);
  const scan = scanCode(repo, files, null);
  const dflt = defaultSchema(repo, files);
  const split = t => { const n = unquoteId(unq(t)).toLowerCase(); const parts = n.split('.'); return parts.length > 1 ? { schema: parts[parts.length - 2], table: parts[parts.length - 1] } : { schema: dflt || 'public', table: n, assumed: !dflt }; };
  const changes = [], reads = [];
  for (const r of scan.refs) for (const t of r.names) {
    if (MIGRATION_TABLES.test(bareName(t))) continue;
    (r.migration ? changes : reads).push({ ...split(t), file: r.file });
  }
  for (const e of scan.entities) reads.push({ ...split(e.schema ? `${e.schema}.${e.table || snakeCase(e.name)}` : (e.table || snakeCase(e.name))), file: e.file });
  return { name, repo, dflt, changes, reads };
}
function schemaOwnership(home) {
  const repos = home && readJson(path.join(home, 'catalog.json')) ? members(home).filter(m => exists(path.join(m.dir, '.git'))) : [];
  const uses = repos.length ? repos.map(m => schemaUse(m.dir, m.name)) : [schemaUse(home, path.basename(home))];
  const by = new Map();
  const get = s => { if (!by.has(s)) by.set(s, { schema: s, changedBy: new Set(), readBy: new Set(), tables: new Set(), assumed: false }); return by.get(s); };
  for (const u of uses) {
    for (const c of u.changes) { const e = get(c.schema); e.changedBy.add(u.name); e.tables.add(c.table); if (c.assumed) e.assumed = true; }
    for (const r of u.reads) { const e = get(r.schema); if (!e.changedBy.has(u.name)) e.readBy.add(u.name); e.tables.add(r.table); if (r.assumed) e.assumed = true; }
  }
  for (const e of by.values()) for (const c of e.changedBy) e.readBy.delete(c);
  return [...by.values()].sort((a, b) => a.schema.localeCompare(b.schema)).map(e => ({
    schema: e.schema, owner: e.changedBy.size === 1 ? [...e.changedBy][0] : null, changedBy: [...e.changedBy].sort(), readBy: [...e.readBy].sort(),
    tables: [...e.tables].sort(), assumed: e.assumed,
    layout: e.changedBy.size === 1 ? 'owned' : e.changedBy.size > 1 ? 'shared' : 'no-migrations',
  }));
}
function cmdSchemas() {
  const repo = resolveRepo({});
  const home = workspaceHome(repo) || repo;
  const found = schemaOwnership(home);
  const catPath = path.join(home, 'catalog.json'), cat = readJson(catPath);
  const recorded = new Map(((cat && cat.schemas) || []).map(x => [x.schema, x]));
  if (flag('--json')) { console.log(JSON.stringify({ schemas: found, recorded: [...recorded.values()] }, null, 2)); return; }
  if (!found.length) { console.log('No tables found in migrations, entities or SQL.'); return; }
  console.log('Schemas, from the migrations (who changes) and the entities and SQL (who reads):');
  for (const e of found) {
    const r = recorded.get(e.schema);
    const where = e.layout === 'owned' ? `owned by ${e.owner}: its export and table pages go in that repo`
      : e.layout === 'shared' ? `changed by ${e.changedBy.join(', ')}: shared, no single owner. Its export and table pages go once in the home repo (context/data/${e.schema}/), or in the one repo you name as owner`
      : 'no repo here has migrations for it: managed elsewhere (a migrations repo, or a database team)? Name its owner';
    console.log(`  ${e.schema}${e.assumed ? ' (unqualified tables, assumed default schema)' : ''}: ${where}`);
    if (e.readBy.length) console.log(`      read by: ${e.readBy.join(', ')}`);
    console.log(`      tables: ${e.tables.slice(0, 8).join(', ')}${e.tables.length > 8 ? ` and ${e.tables.length - 8} more` : ''}`);
    if (r && r.confirmed && (r.owner || null) !== e.owner) console.log(`      recorded owner: ${r.owner || 'shared'} (confirmed). The code now says otherwise: check with the teams.`);
  }
  if (!flag('--write')) { console.log(cat ? '\nConfirm or correct it, then record it: node .ai-kit/context-tools.cjs schemas --write (sets "schemas" in catalog.json; edit "owner" there, and set "confirmed": true).' : '\n(One repo: nothing to record. In a product workspace, run this in the home repo.)'); return; }
  if (!cat) { console.log('No catalog.json: run this in the home repo of a product workspace.'); process.exitCode = 2; return; }
  cat.schemas = found.map(e => { const r = recorded.get(e.schema); return r && r.confirmed ? { ...r, changedBy: e.changedBy, readBy: e.readBy } : { schema: e.schema, owner: e.owner, changedBy: e.changedBy, readBy: e.readBy, confirmed: false }; });
  for (const [k, r] of recorded) if (!found.some(e => e.schema === k)) cat.schemas.push(r);
  fs.writeFileSync(catPath, JSON.stringify(cat, null, 2) + '\n');
  console.log(`\nRecorded ${cat.schemas.length} schema(s) in catalog.json. A person confirms each owner there ("confirmed": true).`);
}
// A migration in this repo that changes a schema the catalogue says another repo owns.
function ownershipFindings(repo, home, changed) {
  const cat = home && readJson(path.join(home, 'catalog.json'));
  if (!cat || !Array.isArray(cat.schemas) || !cat.schemas.length) return [];
  const me = (members(home).find(m => path.resolve(m.dir) === path.resolve(repo)) || {}).name || path.basename(repo);
  const migs = changed.filter(f => MIGRATION_RE.test(f) && !SKIP_CODE_RE.test(f) && !TEST_RE.test(f));
  if (!migs.length) return [];
  const u = schemaUse(repo, me), out = [];
  for (const c of u.changes.filter(x => migs.includes(x.file))) {
    const rec = cat.schemas.find(x => x.schema === c.schema);
    if (rec && !rec.owner && (rec.changedBy || []).length > 1) out.push(`${c.file}  changes ${c.schema}.${c.table}, a schema several repos change (${rec.changedBy.join(', ')}): its export and table pages are in the home repo. Once the migration has run on your dev database, export the schema again into the home repo and run schema-import there`);
    if (rec && rec.owner && rec.owner !== me) out.push(`${c.file}  changes ${c.schema}.${c.table}, but catalog.json says schema "${c.schema}" belongs to ${rec.owner}: agree it with that team (their table pages and export describe it)`);
  }
  return [...new Set(out)];
}
function cmdNames() {
  const repo = resolveRepo({});
  const home = workspaceHome(repo);
  const files = listFiles(repo);
  const pages = namePages(repo, files.filter(isContextFile), home);
  const all = []; for (const p of pages) for (const n of pageNames(p.text)) all.push({ ...n, page: p });
  const others = home ? [home, ...members(home).map(m => m.dir)].filter(d => path.resolve(d) !== path.resolve(repo) && exists(path.join(d, '.git'))) : [];
  const present = namesPresent([{ repo, rev: null }].concat(others.map(d => ({ repo: d, rev: null }))), all);
  const missing = all.filter(n => !present.has(n.name));
  if (flag('--json')) { console.log(JSON.stringify({ names: all.length, unique: new Set(all.map(n => n.name)).size, missing: missing.map(n => ({ name: n.name, kind: n.kind, page: nameWhere(n, repo) })) }, null, 2)); return; }
  console.log(`Names on context pages: ${all.length} (${new Set(all.map(n => n.name)).size} different), ${missing.length} not found in the code${others.length ? ' (this repo, the home repo and the other cloned repos)' : ''}.`);
  for (const n of missing) console.log('  ' + nameMessage({ ...n, why: 'missing' }, repo));
  if (flag('--all')) for (const n of all.filter(x => present.has(x.name))) console.log(`  ok  \`${n.name}\`  ${nameWhere(n, repo)}`);
}
function cmdUsage() {
  const repo = resolveRepo({});
  const days = Number(opt('--days') || 90);
  const since = Date.now() - days * 864e5;
  const pages = listFiles(repo).filter(f => isContextFile(f) && !/(^|\/)(index|README)\.md$/.test(f) && !/^\.github\/instructions\/org\//.test(f));
  const lp = readsLogPath(repo);
  const reads = new Map(), sessions = new Map(); let first = null;
  try {
    for (const l of fs.readFileSync(lp, 'utf8').trim().split('\n')) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      const t = Date.parse(e.t); if (!(t >= since)) continue;
      first = first === null ? t : Math.min(first, t);
      reads.set(e.page, (reads.get(e.page) || 0) + 1);
      if (!sessions.has(e.page)) sessions.set(e.page, new Set());
      sessions.get(e.page).add(e.session);
    }
  } catch { /* no reads yet */ }
  if (flag('--json')) { console.log(JSON.stringify({ days, pages: pages.map(p => ({ page: p, reads: reads.get(p) || 0, sessions: sessions.has(p) ? sessions.get(p).size : 0 })) }, null, 2)); return; }
  console.log(`Context pages read by agents, last ${days} days${first ? ` (log starts ${new Date(first).toISOString().slice(0, 10)})` : ''}`);
  if (!reads.size) { console.log('  No reads recorded yet. Reads are logged by the agent hooks (Copilot, Claude Code) after this kit version.'); return; }
  const used = pages.filter(p => reads.has(p)).sort((a, b) => sessions.get(b).size - sessions.get(a).size);
  for (const p of used) console.log(`  ${String(sessions.get(p).size).padStart(4)} chat(s)  ${p}`);
  const never = pages.filter(p => !reads.has(p) && !/^(AGENTS|CLAUDE)\.md$/.test(p));
  if (never.length) { console.log(`  Never read (${never.length}): candidates to merge, shorten or delete, or to link from AGENTS.md:`); never.forEach(p => console.log(`        ${p}`)); }
  console.log('  AGENTS.md (and CLAUDE.md) are loaded automatically, so they do not show as reads.');
}

function cmdPagesFor() {
  const repo = resolveRepo({});
  const files = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--repo');
  if (!files.length) { console.log('Usage: node .ai-kit/context-tools.cjs pages-for <file> [<file> ...]'); process.exitCode = 2; return; }
  const res = pagesFor(repo, files);
  if (flag('--json')) { console.log(JSON.stringify(res, null, 2)); return; }
  for (const r of res) {
    console.log(`${r.file}: ${r.pages.length ? r.pages.join(', ') : 'no context page anchors or names this file'}`);
    r.lines.slice(0, 12).forEach(l => console.log(`  ${l.file}:${l.line}  ${l.mentioned ? '(names it) ' : ''}${l.text}`));
  }
}

// ---------------------------------------------------------------- DDL reader (.sql schema dumps)
// Reads PostgreSQL schema DDL: pg_dump --schema-only, and "generate DDL" exports from DB viewers (DBeaver,
// pgAdmin, DataGrip). Simple MySQL and SQL Server CREATE TABLE statements mostly work too. It reads tables,
// columns, defaults, keys, foreign keys, unique and check constraints, indexes, comments, views, enum types
// and triggers into the same shape as a tbls schema.json. It never runs SQL.
const MIGRATION_TABLES = /^(flyway_schema_history|databasechangelog|databasechangeloglock|schema_migrations)$/i;
function splitSqlStatements(sql) {
  const out = []; let cur = ''; let i = 0; const n = sql.length;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === '-' && d === '-') { const e = sql.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && d === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; cur += ' '; continue; }
    if (c === "'") { let j = i + 1; while (j < n) { if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; } j++; } cur += sql.slice(i, j + 1); i = j + 1; continue; }
    if (c === '"' || c === '`' || c === '[') { const close = c === '[' ? ']' : c; const e = sql.indexOf(close, i + 1); const end = e < 0 ? n : e + 1; cur += sql.slice(i, end); i = end; continue; }
    if (c === '$') { const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i, i + 64)); if (m) { const e = sql.indexOf(m[0], i + m[0].length); const end = e < 0 ? n : e + m[0].length; cur += sql.slice(i, end); i = end; continue; } }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(s => s.replace(/\s+/g, ' ')).filter(s => !/^GO$/i.test(s));
}
// Same length, with quoted text and the inside of brackets blanked, so keywords can be found at the top level.
function maskSql(s) {
  let out = ''; let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') { const e = s.indexOf(c, i + 1); const end = e < 0 ? s.length - 1 : e; out += c + ' '.repeat(end - i - 1) + (e < 0 ? '' : c); i = end; continue; }
    if (c === '(') { depth++; out += depth === 1 ? '(' : ' '; continue; }
    if (c === ')') { out += depth === 1 ? ')' : ' '; depth = Math.max(0, depth - 1); continue; }
    out += depth > 0 ? ' ' : c;
  }
  return out;
}
function splitTop(s, sep = ',') {
  const m = maskSql(s); const parts = []; let last = 0;
  for (let i = 0; i < m.length; i++) if (m[i] === sep) { parts.push(s.slice(last, i).trim()); last = i + 1; }
  parts.push(s.slice(last).trim());
  return parts.filter(Boolean);
}
function closingParen(s, open) {
  let depth = 0;
  const m = maskSql(s.slice(open)); // depth-1 parens survive the mask
  for (let i = 0; i < m.length; i++) { if (m[i] === '(') depth++; else if (m[i] === ')') { depth--; if (!depth) return open + i; } }
  return -1;
}
const IDENT = '(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|[\\w$]+)';
const QNAME = `${IDENT}(?:\\s*\\.\\s*${IDENT})*`;
const unq = name => name.split(/\s*\.\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim().replace(/^["`[]|["`\]]$/g, '')).join('.');
const bareName = name => unq(name).split('.').pop();
const cols = list => splitTop(list).map(c => unq(c.replace(/\s+(ASC|DESC)\b.*$/i, '')));
const sqlString = s => s.replace(/^E?'/, '').replace(/'$/, '').replace(/''/g, "'");

function parseDdl(sql) {
  const tables = new Map(); const enums = new Map(); const relations = []; const skipped = new Set(); let unread = 0;
  const table = (name, type = 'BASE TABLE') => {
    const key = unq(name);
    if (MIGRATION_TABLES.test(bareName(key))) { skipped.add(key); return null; }
    if (!tables.has(key)) tables.set(key, { name: key, type, comment: '', columns: [], constraints: [], indexes: [], triggers: [] });
    return tables.get(key);
  };
  const addConstraint = (t, text, cname) => {
    const m = /^(?:CONSTRAINT\s+(\S+)\s+)?(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE)\b\s*(.*)$/i.exec(text);
    if (!m) return false;
    const name = unq(m[1] || cname || ''), kind = m[2].toUpperCase().replace(/\s+/g, ' '), rest = m[3];
    const lp = rest.indexOf('('), rp = lp >= 0 ? closingParen(rest, lp) : -1;
    const inner = lp >= 0 && rp > lp ? rest.slice(lp + 1, rp) : '';
    const k = { name: name || `${bareName(t.name)}_${kind.split(' ')[0].toLowerCase()}`, type: kind, def: `${kind} ${rest}`.trim(), table: t.name, columns: [] };
    if (kind === 'PRIMARY KEY' || kind === 'UNIQUE') k.columns = cols(inner);
    if (kind === 'FOREIGN KEY') {
      k.columns = cols(inner);
      const ref = new RegExp(`REFERENCES\\s+(${QNAME})\\s*(?:\\(([^)]*)\\))?`, 'i').exec(rest);
      if (ref) relations.push({ table: t.name, columns: k.columns, parent_table: unq(ref[1]), parent_columns: ref[2] ? cols(ref[2]) : [], def: k.def });
    }
    t.constraints.push(k);
    return true;
  };
  const addColumn = (t, text) => {
    const nm = new RegExp(`^(${IDENT})\\s*(.*)$`).exec(text);
    if (!nm) return;
    const name = unq(nm[1]); const rest = nm[2]; const masked = maskSql(rest);
    const kw = /\b(NOT\s+NULL|NULL|DEFAULT|CONSTRAINT|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK|GENERATED|COLLATE|AUTO_INCREMENT|IDENTITY|COMMENT)\b/i.exec(masked);
    const type = (kw ? rest.slice(0, kw.index) : rest).trim();
    const attrs = kw ? rest.slice(kw.index) : '';
    const am = kw ? masked.slice(kw.index) : '';
    const c = { name, type, nullable: !/\bNOT\s+NULL\b/i.test(am) && !/\bPRIMARY\s+KEY\b/i.test(am), default: null, comment: '' };
    const dm = /(?<!\bBY\s+)\bDEFAULT\s+/i.exec(am); // not the DEFAULT in "GENERATED BY DEFAULT AS IDENTITY"
    if (dm) { const after = am.slice(dm.index + dm[0].length); const stop = /\s(NOT\s+NULL|NULL|CONSTRAINT|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK|GENERATED|COLLATE|COMMENT)\b/i.exec(after); c.default = attrs.slice(dm.index + dm[0].length, dm.index + dm[0].length + (stop ? stop.index : after.length)).trim(); }
    if (/\bGENERATED\b[^,]*\bAS\s+IDENTITY\b|\bAUTO_INCREMENT\b|\bIDENTITY\b/i.test(am)) c.default = c.default || 'identity';
    if (/\b(big|small)?serial\b/i.test(type)) c.default = c.default || 'serial';
    const cm = /\bCOMMENT\s+('(?:[^']|'')*')/i.exec(attrs); if (cm) c.comment = sqlString(cm[1]);
    t.columns.push(c);
    if (/\bPRIMARY\s+KEY\b/i.test(am)) t.constraints.push({ name: `${bareName(t.name)}_pkey`, type: 'PRIMARY KEY', def: `PRIMARY KEY (${name})`, table: t.name, columns: [name] });
    if (/\bUNIQUE\b/i.test(am)) t.constraints.push({ name: `${bareName(t.name)}_${name}_key`, type: 'UNIQUE', def: `UNIQUE (${name})`, table: t.name, columns: [name] });
    const ref = new RegExp(`REFERENCES\\s+(${QNAME})\\s*(?:\\(([^)]*)\\))?`, 'i').exec(attrs);
    if (ref) { const def = `FOREIGN KEY (${name}) ${attrs.slice(ref.index).replace(/\s+(CHECK|DEFAULT|NOT NULL)\b.*$/i, '')}`; relations.push({ table: t.name, columns: [name], parent_table: unq(ref[1]), parent_columns: ref[2] ? cols(ref[2]) : [], def }); t.constraints.push({ name: `${bareName(t.name)}_${name}_fkey`, type: 'FOREIGN KEY', def, table: t.name, columns: [name] }); }
    const ck = /\bCHECK\s*\(/i.exec(am); if (ck) { const lp = attrs.indexOf('(', ck.index); const rp = closingParen(attrs, lp); t.constraints.push({ name: `${bareName(t.name)}_${name}_check`, type: 'CHECK', def: `CHECK ${attrs.slice(lp, rp + 1)}`, table: t.name, columns: [name] }); }
  };

  for (const st of splitSqlStatements(sql)) {
    let m;
    if ((m = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:GLOBAL|LOCAL)\\s+)?(?:TEMP(?:ORARY)?\\s+|UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QNAME})\\s*(.*)$`, 'i').exec(st))) {
      const rest = m[2];
      if (/^PARTITION\s+OF\b/i.test(rest)) { const t = table(m[1], 'PARTITION'); if (t) t.comment = rest.slice(0, 160); continue; }
      if (/^AS\b/i.test(rest)) { table(m[1]); continue; }
      const lp = rest.indexOf('('); const rp = lp >= 0 ? closingParen(rest, lp) : -1;
      const t = table(m[1]); if (!t || rp < 0) continue;
      for (const item of splitTop(rest.slice(lp + 1, rp))) {
        if (/^(LIKE|PERIOD|INDEX|KEY|FULLTEXT|SPATIAL)\b/i.test(item)) { if (/^(INDEX|KEY)\b/i.test(item)) t.indexes.push({ name: (/^\w+\s+(\S+)/.exec(item) || [])[1] || '', def: item }); continue; }
        if (!addConstraint(t, item)) addColumn(t, item);
      }
      const after = rest.slice(rp + 1).trim();
      if (/^PARTITION\s+BY/i.test(after)) t.type = 'BASE TABLE (partitioned)';
      const tc = /COMMENT\s*=?\s*('(?:[^']|'')*')/i.exec(after); if (tc) t.comment = sqlString(tc[1]);
    } else if ((m = new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${QNAME})\\s+(.*)$`, 'i').exec(st))) {
      const t = table(m[1]); if (!t) continue;
      for (const action of splitTop(m[2])) {
        let a;
        if ((a = /^ADD\s+((?:CONSTRAINT\s+\S+\s+)?(?:PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE)\b.*)$/i.exec(action))) addConstraint(t, a[1]);
        else if ((a = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${IDENT})\\s+SET\\s+DEFAULT\\s+(.*)$`, 'i').exec(action))) { const c = t.columns.find(x => x.name === unq(a[1])); if (c) c.default = a[2]; }
        else if ((a = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${IDENT})\\s+ADD\\s+GENERATED\\b`, 'i').exec(action))) { const c = t.columns.find(x => x.name === unq(a[1])); if (c) c.default = 'identity'; }
        else if ((a = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${IDENT})\\s+SET\\s+NOT\\s+NULL`, 'i').exec(action))) { const c = t.columns.find(x => x.name === unq(a[1])); if (c) c.nullable = false; }
        else if ((a = /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(.*)$/i.exec(action))) { if (!addConstraint(t, a[1])) addColumn(t, a[1]); }
      }
    } else if ((m = new RegExp(`^CREATE\\s+(UNIQUE\\s+)?(?:CLUSTERED\\s+|NONCLUSTERED\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QNAME})?\\s*ON\\s+(?:ONLY\\s+)?(${QNAME})`, 'i').exec(st))) {
      const t = table(m[3]); if (t) t.indexes.push({ name: m[2] ? bareName(m[2]) : '', def: st, table: t.name });
    } else if ((m = new RegExp(`^COMMENT\\s+ON\\s+(TABLE|VIEW|MATERIALIZED\\s+VIEW|COLUMN)\\s+(${QNAME})\\s+IS\\s+('(?:[^']|'')*'|NULL)`, 'i').exec(st))) {
      const text = /^NULL$/i.test(m[3]) ? '' : sqlString(m[3]);
      if (/^COLUMN$/i.test(m[1])) { const parts = unq(m[2]).split('.'); const col = parts.pop(); const t = table(parts.join('.')); const c = t && t.columns.find(x => x.name === col); if (c) c.comment = text; }
      else { const t = table(m[2]); if (t) t.comment = text; }
    } else if ((m = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:ALGORITHM|DEFINER|SQL\\s+SECURITY)\\s*=?\\s*\\S+\\s+)*(MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QNAME})`, 'i').exec(st))) {
      const t = table(m[2], m[1] ? 'MATERIALIZED VIEW' : 'VIEW'); if (t) t.def = st;
    } else if ((m = new RegExp(`^CREATE\\s+TYPE\\s+(${QNAME})\\s+AS\\s+ENUM\\s*\\((.*)\\)$`, 'i').exec(st))) {
      enums.set(bareName(m[1]).toLowerCase(), splitTop(m[2]).map(sqlString));
    } else if ((m = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+(${QNAME})\\s.*?\\bON\\s+(${QNAME})`, 'i').exec(st))) {
      const t = table(m[2]); if (t) t.triggers.push({ name: unq(m[1]), def: st });
    } else if (/^(CREATE|ALTER)\s+TABLE\b/i.test(st)) unread++;
  }
  // References written without the schema, or without the column list, are resolved to the tables found.
  const all = [...tables.values()];
  const resolve = n => tables.has(n) ? n : (all.filter(t => bareName(t.name) === bareName(n)).length === 1 ? all.find(t => bareName(t.name) === bareName(n)).name : n);
  for (const r of relations) {
    r.parent_table = resolve(r.parent_table);
    if (!r.parent_columns.length) { const p = tables.get(r.parent_table); const pk = p && p.constraints.find(k => k.type === 'PRIMARY KEY'); r.parent_columns = pk ? pk.columns : []; }
  }
  for (const t of all) for (const c of t.columns) { const e = enums.get(bareName(c.type.replace(/\[\]$/, '')).toLowerCase()); if (e) c.enum = e; }
  return { tables: all, relations, enums: Object.fromEntries(enums), skipped: [...skipped], unread };
}

// ---------------------------------------------------------------- code map for table pages
// Reads code without running it: JPA entities (Java fully; Kotlin entities and properties), Spring Data
// repositories, SQL in string literals, MyBatis mapper XML, and migrations (SQL, Liquibase XML/YAML,
// Flyway Java). Test code is left out. The result goes into the generated part of each table page.
const MIGRATION_RE = /(^|\/)(db\/migration|db\/changelog|migrations?|changelogs?|liquibase|flyway)(\/|$)/i;
const TEST_RE = /(^|\/)(src\/test|src\/it|src\/testFixtures|test|tests|__tests__|e2e)\/|(Test|Tests|IT|Spec)\.(java|kt)$/;
const SKIP_CODE_RE = /(^|\/)(docs|node_modules|target|build|dist|out|graphify-out|\.ai-kit|\.github|\.claude|\.agents|openspec)\//;
const snakeCase = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
const unquoteId = s => String(s || '').replace(/\\"/g, '').replace(/[`"[\]]/g, '');
const JPA_REPO_RE = /\b(?:JpaRepository|CrudRepository|ListCrudRepository|PagingAndSortingRepository|ListPagingAndSortingRepository|ReactiveCrudRepository|R2dbcRepository|CoroutineCrudRepository|JpaSpecificationExecutor|QuerydslPredicateExecutor|Repository)\s*<\s*([\w.]+)/;
const ANN = String.raw`@[\w.:]+(?:\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))?`;
const JAVA_FIELD_RE = new RegExp(String.raw`((?:${ANN}\s*)*)((?:(?:private|protected|public|static|final|transient|volatile)\s+)*)([\w.]+(?:\s*<[^;=(){}]*>)?(?:\s*\[\s*\])*)\s+(\w+)\s*(?:=[^;]*)?;`, 'g');
const KT_PROP_RE = new RegExp(String.raw`((?:${ANN}\s*)*)(?:(?:private|protected|public|internal|override|open|lateinit|final)\s+)*va[lr]\s+(\w+)\s*:\s*([\w.]+)`, 'g');
const SQL_REF_RE = /\b(?:from|join|into|update|table|truncate)\s+(?:only\s+|if\s+(?:not\s+)?exists\s+)?((?:[`"[]?[A-Za-z_][\w$]*[`"\]]?\.)?[`"[]?[A-Za-z_][\w$]*[`"\]]?)/gi;
const TABLE_ATTR_RE = /\b(?:tableName|baseTableName|referencedTableName)\s*[=:]\s*["']?([\w.]+)/g;

// Comments removed; braces and parentheses inside strings blanked, so nesting can be counted.
function maskJvm(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)'/g, m => m.replace(/[{}()]/g, ' '))
    .replace(/(^|[^:"\w])\/\/[^\n]*/g, '$1');
}
const stringLiterals = m => [...m.matchAll(/"""([\s\S]*?)"""|"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1] != null ? x[1] : x[2]).join('\n');
// The text directly inside the first class body after `from`; nested bodies are dropped.
function classLevel(m, from) {
  let i = m.indexOf('{', from); if (i < 0) return '';
  let depth = 0, paren = 0, out = '';
  for (; i < m.length; i++) {
    const ch = m[i];
    if (ch === '(') paren++; else if (ch === ')') paren = Math.max(0, paren - 1);
    if (ch === '{' && paren === 0) { depth++; if (depth === 2) out += ' '; continue; }
    if (ch === '}' && paren === 0) { depth--; if (depth === 0) break; if (depth === 1) out += ';'; continue; }
    if (depth === 1) out += ch;
  }
  return out;
}
// A Kotlin primary constructor: the parentheses right after `class Name`.
function ktConstructor(m, from) {
  const h = /\bclass\s+\w+\s*(?:<[^>]*>)?\s*(?:@\w+\s*)*(?:(?:private|protected|internal|public)\s+)?(?:constructor\s*)?\(/.exec(m.slice(from));
  if (!h) return '';
  let i = from + h.index + h[0].length, d = 1, out = '';
  for (; i < m.length && d > 0; i++) { const ch = m[i]; if (ch === '(') d++; else if (ch === ')') d--; if (d > 0) out += ch === ',' && d === 1 ? ';' : ch; }
  return out;
}
function enumConstants(m, from) {
  let i = m.indexOf('{', from); if (i < 0) return [];
  let depth = 0, paren = 0, s = '';
  for (i++; i < m.length; i++) {
    const ch = m[i];
    if (ch === '(') { paren++; continue; } if (ch === ')') { paren--; continue; }
    if (ch === '{') { depth++; continue; } if (ch === '}') { if (depth === 0) break; depth--; continue; }
    if (ch === ';' && depth === 0 && paren === 0) break;
    if (depth === 0 && paren === 0) s += ch;
  }
  return s.split(',').map(x => x.replace(/@[\w.]+/g, '').trim()).filter(x => /^[A-Za-z_]\w*$/.test(x));
}
function readField(anns, mods, type, name) {
  const has = a => new RegExp(String.raw`@(?:\w+:)?(?:[\w.]*\.)?${a}\b`).test(anns);
  const arg = (a, k) => {
    const m = new RegExp(String.raw`@(?:\w+:)?(?:[\w.]*\.)?${a}\s*\(((?:[^()]|\([^()]*\))*)\)`).exec(anns); if (!m) return null;
    const v = new RegExp(String.raw`\b${k}\s*=\s*"((?:[^"\\]|\\.)*)"`).exec(m[1]) || (k === 'name' ? /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(m[1]) : null);
    return v ? unquoteId(v[1]) : null;
  };
  if (/\b(static|transient)\b/.test(mods) || ['Transient', 'OneToMany', 'ManyToMany', 'ElementCollection', 'Formula'].some(has)) return null;
  const t = type.replace(/<[\s\S]*$/, '').trim().split('.').pop();
  if (has('Embedded') || has('EmbeddedId')) return { name, type: t, embedded: true };
  if (has('ManyToOne') || has('OneToOne') || has('JoinColumn')) {
    if (/mappedBy\s*=/.test(anns)) return null;
    const col = arg('JoinColumn', 'name');
    return { name, type: t, column: col || snakeCase(name) + '_id', explicit: !!col, join: true };
  }
  const col = arg('Column', 'name');
  const f = { name, type: t, column: col || snakeCase(name), alt: col ? null : name, explicit: !!col };
  if (has('Enumerated')) f.enumMode = /ORDINAL/.test(anns) || !/STRING/.test(anns) ? 'ORDINAL' : 'STRING';
  if (has('Convert') || has('Type') || has('JdbcTypeCode')) f.converted = true;
  return f;
}
function scanCode(repo, files, skipFile) {
  const entities = [], supers = new Map(), repos = [], enums = new Map(), refs = [];
  const want = f => !SKIP_CODE_RE.test(f) && !TEST_RE.test(f) && f !== skipFile &&
    (/\.(java|kt|sql)$/i.test(f) || (/\.xml$/i.test(f)) || (MIGRATION_RE.test(f) && /\.ya?ml$/i.test(f)));
  for (const f of files.filter(want).sort().slice(0, 30000)) {
    let src;
    try { if (fs.statSync(path.join(repo, f)).size > 1.5e6) continue; src = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
    const mig = MIGRATION_RE.test(f), jvm = /\.(java|kt)$/i.test(f), xml = /\.xml$/i.test(f);
    if (xml && !mig && !/<mapper\b/.test(src)) continue;      // only MyBatis mappers and migrations
    const m = jvm ? maskJvm(src) : xml ? src.replace(/<!--[\s\S]*?-->/g, ' ') : src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
    if (jvm) {
      for (const e of m.matchAll(/\benum\s+(?:class\s+)?(\w+)/g)) { const c = enumConstants(m, e.index); if (c.length) enums.set(e[1], enums.has(e[1]) ? null : { file: f, values: c }); }
      for (const r of m.matchAll(/\binterface\s+(\w+)(?:\s*<[^>{]*>)?\s*(?:extends|:)\s*([^{]+)/g)) { const e = JPA_REPO_RE.exec(r[2]); if (e) repos.push({ file: f, cls: r[1], entity: e[1].split('.').pop() }); }
      const ei = m.search(/@(?:[\w.]*\.)?(Entity|MappedSuperclass)\b/);
      if (ei >= 0) {
        const rest = m.slice(ei), cm = /\bclass\s+(\w+)/.exec(rest);
        if (cm) {
          const header = rest.slice(0, cm.index), at = ei + cm.index;
          const kw = (s, k) => { const v = s && new RegExp(String.raw`\b${k}\s*=\s*"((?:[^"\\]|\\.)*)"`).exec(s); return v ? unquoteId(v[1]) : null; };
          const tArgs = (/@(?:[\w.]*\.)?Table\s*\(((?:[^()]|\([^()]*\))*)\)/.exec(header) || [])[1];
          const fields = [];
          if (/\.java$/i.test(f)) {
            for (const x of classLevel(m, at).matchAll(JAVA_FIELD_RE)) {
              if (/^(return|throw|new|else|case|package|import|yield)$/.test(x[3])) continue;
              const fl = readField(x[1], x[2], x[3], x[4]); if (fl) fields.push(fl);
            }
          } else {
            for (const x of (ktConstructor(m, at) + ';' + classLevel(m, at)).matchAll(KT_PROP_RE)) { const fl = readField(x[1], '', x[3], x[2]); if (fl) fields.push(fl); }
          }
          const ext = (/\bclass\s+\w+\s*(?:<[^>{]*>)?\s*extends\s+([\w.]+)/.exec(rest) || /\bclass\s+\w+[^{:]*\)\s*:\s*([\w.]+)\s*\(/.exec(rest) || [])[1];
          const rec = { file: f, cls: cm[1], fields, ext: ext ? ext.split('.').pop() : null };
          if (/MappedSuperclass/.test(header) && !/@(?:[\w.]*\.)?Entity\b/.test(header)) supers.set(cm[1], rec);
          else entities.push({ ...rec, name: kw((/@(?:[\w.]*\.)?Entity\s*\(([^)]*)\)/.exec(header) || [])[1], 'name') || cm[1], table: kw(tArgs, 'name'), schema: kw(tArgs, 'schema') });
        }
      }
    }
    const names = new Set();
    const sqlText = jvm ? stringLiterals(m) : m;
    for (const x of sqlText.matchAll(SQL_REF_RE)) names.add(unquoteId(x[1]));
    if (!jvm) for (const x of m.matchAll(TABLE_ATTR_RE)) names.add(unquoteId(x[1]));
    if (names.size) refs.push({ file: f, names: [...names], migration: mig });
  }
  // Fields inherited from a @MappedSuperclass in this repo; a superclass from elsewhere makes the map partial.
  for (const e of entities) {
    let s = e.ext, guard = 0; e.partial = false;
    while (s && guard++ < 5) { const p = supers.get(s); if (!p) { e.partial = !/^(Object|Any)$/.test(s); break; } e.fields = [...p.fields, ...e.fields]; s = p.ext; }
    if (e.fields.some(x => x.embedded)) e.partial = true;
  }
  return { entities, repos, enums, refs };
}

// Matches the code to the schema's tables. Returns, per table name: entities, repositories, SQL files,
// migrations, field names that differ, references and allowed values known only from code, mismatches.
function codeMap(repo, files, schema, skipFile) {
  const scan = scanCode(repo, files, skipFile);
  const byBare = new Map();
  for (const t of schema.tables) { const b = bareName(t.name).toLowerCase(); if (!byBare.has(b)) byBare.set(b, []); byBare.get(b).push(t); }
  const find = (name, sch) => {
    if (!name) return null;
    const c = byBare.get(bareName(name).toLowerCase()) || [];
    const s = sch || (name.includes('.') ? name.split('.')[0] : null);
    if (s) { const x = c.find(t => t.name.toLowerCase() === `${s}.${bareName(name)}`.toLowerCase()); if (x) return x; }
    return c.length === 1 ? c[0] : c.find(t => !t.name.includes('.') || /^public\./i.test(t.name)) || null;
  };
  const per = new Map(schema.tables.map(t => [t.name, { entities: [], repos: [], sql: new Set(), migrations: new Set(), joins: [], values: [], diffs: [], mismatches: [], unmapped: [] }]));
  const entityTable = new Map(), orphanEntities = [];
  for (const e of scan.entities) {
    const t = e.table ? find(e.table, e.schema) : (find(snakeCase(e.name)) || find(e.name));
    if (t) entityTable.set(e.cls, t); else orphanEntities.push({ file: e.file, cls: e.cls, table: e.table || snakeCase(e.name) });
  }
  for (const e of scan.entities) {
    const t = entityTable.get(e.cls); if (!t) continue;
    const p = per.get(t.name); p.entities.push(e);
    const cols = new Map((t.columns || []).map(c => [c.name.toLowerCase(), c]));
    const seen = new Set();
    for (const fl of e.fields.filter(x => !x.embedded)) {
      const col = cols.get(fl.column.toLowerCase()) || (fl.alt && cols.get(fl.alt.toLowerCase()));
      if (!col) { p.mismatches.push(`\`${e.cls}.${fl.name}\` maps column ${fl.column}${fl.explicit ? '' : ' (name taken from the field)'}, which this table does not have [anchor: ${e.file}]`); continue; }
      seen.add(col.name.toLowerCase());
      if (fl.explicit && fl.column.toLowerCase() !== snakeCase(fl.name) + (fl.join ? '_id' : '')) p.diffs.push(`${fl.name} → ${col.name}`);
      if (fl.join) { const tt = entityTable.get(fl.type); p.joins.push({ column: col.name, text: `${col.name} → ${tt ? tt.name : `entity ${fl.type} (its table is not in the schema)`} (\`${e.cls}.${fl.name}\`) [anchor: ${e.file}]` }); }
      const en = scan.enums.get(fl.type);
      if (en && !fl.converted && !fl.join) {
        const mode = fl.enumMode || 'ORDINAL';
        const dbv = Array.isArray(col.enum) ? col.enum : null;
        if (dbv && dbv.join() !== en.values.join() && mode === 'STRING') {
          const onlyCode = en.values.filter(v => !dbv.includes(v)), onlyDb = dbv.filter(v => !en.values.includes(v));
          p.mismatches.push(`column ${col.name}: enum \`${fl.type}\` and the database type differ${onlyCode.length ? `; only in code: ${onlyCode.join(', ')}` : ''}${onlyDb.length ? `; only in the database: ${onlyDb.join(', ')}` : ''} [anchor: ${en.file}]`);
        }
        p.values.push({ column: col.name, text: mode === 'ORDINAL'
          ? `${col.name}: stored as a number, ${en.values.map((v, i) => `${i} = ${v}`).join(', ')} (enum \`${fl.type}\`, ${fl.enumMode ? 'ORDINAL' : 'ORDINAL because there is no @Enumerated'}: reordering or inserting values changes what stored rows mean) [anchor: ${en.file}]`
          : `${col.name}: ${en.values.join(', ')} (enum \`${fl.type}\`, stored as text) [anchor: ${en.file}]` });
      }
    }
    if (!e.partial) p.unmapped.push(...(t.columns || []).map(c => c.name).filter(n => !seen.has(n.toLowerCase())));
  }
  const entityByCls = new Map(scan.entities.map(e => [e.cls, e]));
  for (const r of scan.repos) { const e = entityByCls.get(r.entity); const t = e && entityTable.get(e.cls); if (t) per.get(t.name).repos.push(r); }
  for (const r of scan.refs) {
    for (const n of r.names) {
      const t = find(n) || (entityByCls.get(n) && entityTable.get(n)) || null;   // a table name, or an entity name in JPQL
      if (!t) continue;
      const p = per.get(t.name);
      if (p.entities.some(e => e.file === r.file)) continue;               // the entity itself is listed already
      (r.migration ? p.migrations : p.sql).add(r.file);
    }
  }
  for (const p of per.values()) { for (const x of p.repos) p.sql.delete(x.file); p.unmapped = [...new Set(p.unmapped)].filter(n => !p.entities.length || p.entities.every(e => !e.partial)); }
  return { per, orphanEntities, counts: { entities: scan.entities.length, repos: scan.repos.length, matched: entityTable.size } };
}
const anchorList = (arr, max = 6) => `[anchor: ${arr.slice(0, max).join(', ')}]${arr.length > max ? ` and ${arr.length - max} more` : ''}`;

// ---------------------------------------------------------------- schema-import (tbls schema.json or a .sql DDL dump)
const GEN_START = '<!-- generated:start schema-import: do not edit between these markers -->';
const GEN_END = '<!-- generated:end -->';
function replaceGenerated(text, block) {
  const s = text.indexOf('<!-- generated:start'), e = text.indexOf(GEN_END);
  if (s >= 0 && e > s) return text.slice(0, s) + block + text.slice(e + GEN_END.length);
  return null;
}
const cell = v => String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const safeName = n => n.replace(/[^A-Za-z0-9_.-]/g, '_');
// The part of a generated block that comes from the schema file, without the lines read from code.
const CODE_SECTIONS = /^### (References in code only|Code that maps or queries it|Look like references)/;
function schemaPart(block) {
  const out = []; let skip = false;
  for (const l of block.split(/\r?\n/)) {
    if (/^### /.test(l)) skip = CODE_SECTIONS.test(l);
    if (!skip && !/\(enum `[^`]+`/.test(l) && !l.includes('generated:end')) out.push(l.replace(/ \(database type; enum [^)]*\)$/, ''));
  }
  return out.join('\n').trim();
}
const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Works out every page the import would write, without writing. Used by schema-import, check, the hooks
// and doctor, so they all agree on what "up to date" means.
function planSchemaImport(repo, file, { outDir = 'docs/context/data', code = true, files = null } = {}) {
  let schema, ddlNote = '';
  // A relative path is taken from the current folder, or else from the repo (handy with --repo).
  const absFile = path.isAbsolute(file) ? file : (!exists(path.resolve(file)) && exists(path.join(repo, file)) ? path.join(repo, file) : path.resolve(file));
  if (/\.(sql|ddl)$/i.test(file)) {
    let sql; try { sql = fs.readFileSync(absFile, 'utf8'); } catch { return { error: `cannot read ${file}` }; }
    schema = parseDdl(sql);
    if (!schema.tables.length) return { error: `no CREATE TABLE statements found in ${file}. Export the schema as DDL (pg_dump --schema-only, or your DB viewer's "Generate DDL").` };
    ddlNote = `Read from DDL: ${schema.tables.length} table(s)/view(s), ${schema.relations.length} reference(s), ${Object.keys(schema.enums).length} enum type(s)` +
      (schema.skipped.length ? `; skipped migration-tool tables: ${schema.skipped.join(', ')}` : '') + (schema.unread ? `; ${schema.unread} table statement(s) not understood (check by hand)` : '');
  } else {
    schema = readJson(absFile);
    if (!schema || !Array.isArray(schema.tables)) return { error: `${file} is neither a .sql DDL dump nor a tbls schema.json (expected a "tables" list).` };
  }
  outDir = toPosix(outDir).replace(/\/$/, '');
  const relFile = toPosix(path.relative(repo, absFile));
  const inRepo = !relFile.startsWith('..') && !path.isAbsolute(relFile);
  const sourceLine = inRepo ? `Source: [anchor: ${relFile}]` : `Source: ${path.basename(file)} (outside the repo: copy it in and import again to make this traceable)`;
  const today = localDate(new Date());
  const relations = schema.relations || [];
  const cm = code ? codeMap(repo, files || listFiles(repo), schema, inRepo ? relFile : null) : null;
  const writes = [], same = [], mismatches = [], questions = [];
  const tableNames = new Set(schema.tables.map(t => t.name));
  const pageOf = new Map();

  for (const t of schema.tables) {
    const cols = t.columns || [];
    const c = cm && cm.per.get(t.name);
    const fks = relations.filter(r => r.table === t.name);
    const refBy = relations.filter(r => r.parent_table === t.name);
    const fkCols = new Set(fks.flatMap(r => r.columns || []));
    const joined = new Set(c ? c.joins.map(j => j.column) : []);
    const isPk = n => (t.constraints || []).some(k => /PRIMARY/i.test(k.type || '') && (k.columns || []).includes(n));
    const lookalikes = cols.filter(x => /(_id|Id)$/.test(x.name) && !fkCols.has(x.name) && !isPk(x.name) && !joined.has(x.name));
    const g = [GEN_START, sourceLine, '', `${t.type ? `Type: ${t.type}. ` : ''}${t.comment ? `Comment: ${cell(t.comment)}` : ''}`.trim(), '',
      '### Columns', '| Column | Type | Null | Default | Comment |', '| --- | --- | --- | --- | --- |',
      ...cols.map(x => `| ${cell(x.name)} | ${cell(x.type)} | ${x.nullable ? 'yes' : 'no'} | ${cell(x.default)} | ${cell(x.comment)} |`)];
    const cons = (t.constraints || []);
    if (cons.length) g.push('', '### Keys and constraints', ...cons.map(k => `- ${cell(k.name)} (${cell(k.type)}): ${cell(k.def)}`));
    if (fks.length) g.push('', '### References', ...fks.map(r => `- (${(r.columns || []).join(', ')}) → ${r.parent_table} (${(r.parent_columns || []).join(', ')})${r.virtual ? ' (declared in tbls, no foreign key)' : ''}`));
    const codeJoins = c ? c.joins.filter(j => !fkCols.has(j.column)) : [];
    if (codeJoins.length) g.push('', '### References in code only (no foreign key in the database)', ...codeJoins.map(j => `- ${j.text}`));
    if (refBy.length) g.push('', '### Referenced by', ...refBy.map(r => `- ${r.table} (${(r.columns || []).join(', ')})`));
    if (lookalikes.length) g.push('', '### Look like references but have no foreign key', ...lookalikes.map(x => `- ${x.name}`));
    const codeValues = new Map((c ? c.values : []).map(v => [v.column, v.text]));
    const enumCols = cols.filter(x => Array.isArray(x.enum) && x.enum.length);
    const valueLines = [...enumCols.map(x => codeValues.has(x.name) && !/stored as a number/.test(codeValues.get(x.name)) ? `- ${x.name}: ${x.enum.join(', ')} (database type; enum ${/enum `([^`]+)`/.exec(codeValues.get(x.name))[1]} in code)` : `- ${x.name}: ${x.enum.join(', ')}`),
      ...[...codeValues].filter(([k, v]) => !enumCols.some(x => x.name === k) || /stored as a number/.test(v)).map(([, v]) => `- ${v}`)];
    if (valueLines.length) g.push('', '### Allowed values', ...valueLines);
    if (c && (c.entities.length || c.repos.length || c.sql.size || c.migrations.size || c.mismatches.length)) {
      g.push('', '### Code that maps or queries it (found in the code)');
      for (const e of c.entities) g.push(`- Entity \`${e.cls}\` [anchor: ${e.file}]${c.diffs.length ? `; fields named differently: ${c.diffs.join(', ')}` : ''}${e.partial ? ' (some fields come from code outside this repo or an embedded class: the column check is partial)' : ''}`);
      for (const r of c.repos) g.push(`- Repository \`${r.cls}\` [anchor: ${r.file}]`);
      if (c.sql.size) g.push(`- SQL that names it: ${anchorList([...c.sql])}`);
      if (c.migrations.size) { const ms = [...c.migrations]; g.push(`- Migrations that name it: ${ms.length}, latest \`${path.basename(ms[ms.length - 1])}\` [anchor: ${ms[ms.length - 1]}]`); }
      if (c.unmapped.length && c.entities.length) g.push(`- Columns no entity field maps: ${c.unmapped.join(', ')}`);
      for (const x of c.mismatches) { g.push(`- Does not match the schema: ${x}`); mismatches.push({ text: `${t.name}: ${x.replace(/ \[anchor: [^\]]+\]$/, '')}`, file: (/\[anchor: ([^\]]+)\]$/.exec(x) || [])[1] }); }
    }
    if ((t.indexes || []).length) g.push('', '### Indexes', ...t.indexes.map(i => `- ${cell(i.name)}: ${cell(i.def)}`));
    if ((t.triggers || []).length) g.push('', '### Triggers', ...t.triggers.map(x => `- ${cell(x.name)}: ${cell(x.def)}`));
    if (t.def) g.push('', '### Definition', '```sql', String(t.def).trim(), '```');
    g.push(GEN_END);
    const block = g.join('\n');
    if (lookalikes.length) questions.push(`${t.name}: ${lookalikes.map(x => x.name).join(', ')} (reference without a foreign key?)`);

    // An existing page for this table may be named with or without the schema (public.orders.md or orders.md).
    const candidates = [...new Set([safeName(t.name), safeName(t.name.split('.').pop())])].map(n => `${outDir}/tables/${n}.md`);
    const rel = candidates.find(x => exists(path.join(repo, ...x.split('/')))) || candidates[0];
    const abs = path.join(repo, ...rel.split('/'));
    pageOf.set(t.name, rel.slice(outDir.length + 1));
    if (exists(abs)) {
      const cur = fs.readFileSync(abs, 'utf8');
      let next = replaceGenerated(cur, block);
      if (next === null) {
        // A page people wrote before: add the generated section, keep every word they wrote.
        const at = cur.search(/^## (Rules and traps|Code that reads or writes it|Other code that reads or writes it|Unverified)\b/m);
        const section = `## Generated from the schema\n${block}\n\n`;
        next = at >= 0 ? cur.slice(0, at) + section + cur.slice(at) : cur.replace(/\s*$/, '\n\n') + section;
        if (/^---\r?\n/.test(next) && !/^generated:/m.test(frontmatter(next))) next = next.replace(/^---\r?\n/, `---\ngenerated: { by: "context-tools/schema-import", at: ${JSON.stringify(today)} }\n`);
        writes.push({ rel, abs, text: next, how: 'merged' });
        continue;
      }
      if (next === cur) { same.push(rel); continue; }
      // The table's structure changed: record when, so reviews older than this stop counting (OKF rule).
      // Code lines alone (a new query, a renamed entity) do not reset the review of what people wrote.
      const old = cur.slice(cur.indexOf('<!-- generated:start'), cur.indexOf(GEN_END));
      const structural = schemaPart(old) !== schemaPart(block);
      writes.push({ rel, abs, text: structural ? next.replace(/^generated:.*$/m, `generated: { by: "context-tools/schema-import", at: ${JSON.stringify(today)} }`) : next, how: 'refreshed' });
    } else {
      writes.push({ rel, abs, how: 'added', text: ['---', 'type: Database Table', `title: ${JSON.stringify(t.name)}`, 'status: draft', 'dimension: data', 'owner: ""',
        `generated: { by: "context-tools/schema-import", at: ${JSON.stringify(today)} }`, 'verified: []', '---',
        `# ${t.name}`, '', '## Meaning', '<What one row represents, who writes it, who reads it. People write this part.>', '',
        '## Generated from the schema', block, '',
        '## Rules and traps', '<Values with special meaning, soft deletes, status lifecycles, columns that must change together.>', '',
        '## Other code that reads or writes it', '<Only what the generated part does not show: other services, batch jobs, reports. Delete this line if there is none.>', '',
        '## Unverified', '- <Anything believed but not confirmed in code.>', ''].join('\n') });
    }
  }
  // Pages for tables that are no longer in the schema are reported, never deleted.
  const tablesDir = path.join(repo, ...outDir.split('/'), 'tables');
  const gone = [];
  try { for (const f of fs.readdirSync(tablesDir)) if (f.endsWith('.md') && ![...tableNames].some(n => safeName(n) + '.md' === f || safeName(n.split('.').pop()) + '.md' === f)) gone.push(`${outDir}/tables/${f}`); } catch { /* none */ }
  // Index of tables, regenerated between markers (OKF index style: no frontmatter, bulleted links).
  const idxRel = `${outDir}/index.md`;
  const idxAbs = path.join(repo, ...idxRel.split('/'));
  const orphans = cm ? cm.orphanEntities : [];
  const list = [GEN_START, sourceLine, '',
    ...schema.tables.map(t => {
      const refs = relations.filter(r => r.table === t.name).map(r => r.parent_table), by = relations.filter(r => r.parent_table === t.name).map(r => r.table);
      const c = cm && cm.per.get(t.name);
      return `- [${t.name}](${pageOf.get(t.name) || `tables/${safeName(t.name)}.md`}): ${(t.columns || []).length} columns${refs.length ? `; references ${refs.join(', ')}` : ''}${by.length ? `; referenced by ${by.join(', ')}` : ''}${c && c.entities.length ? `; entity ${c.entities.map(e => e.cls).join(', ')}` : ''}${t.comment ? `. ${cell(t.comment)}` : ''}`;
    }),
    ...(orphans.length ? ['', '### Entities whose table is not in the schema', 'The schema file may be older than the code, or the entity maps a table in another database.',
      ...orphans.map(o => `- \`${o.cls}\` (table ${o.table}) [anchor: ${o.file}]`)] : []),
    GEN_END].join('\n');
  for (const o of orphans) mismatches.push({ text: `entity ${o.cls} maps table ${o.table}, which is not in the schema file`, file: o.file });
  const idx = exists(idxAbs) ? fs.readFileSync(idxAbs, 'utf8') : null;
  const idxNext = idx === null
    ? ['# Data: tables', '', 'One page per table. The generated part of each page comes from the schema file and the code; the rest is written by people.', '',
      '## Tables', list, ''].join('\n')
    : (replaceGenerated(idx, list) ?? idx.replace(/\s*$/, '\n\n') + '## Tables\n' + list + '\n');
  if (idxNext !== idx) writes.push({ rel: idxRel, abs: idxAbs, text: idxNext, how: idx === null ? 'added' : 'refreshed' });
  const codeNote = cm ? `Code: ${cm.counts.entities} entit${cm.counts.entities === 1 ? 'y' : 'ies'} (${cm.counts.matched} matched to a table), ${cm.counts.repos} repositor${cm.counts.repos === 1 ? 'y' : 'ies'}` : '';
  return { schema, ddlNote, codeNote, writes, same, gone, mismatches, questions, relFile: inRepo ? relFile : null, outDir };
}

function cmdSchemaImport() {
  const repo = resolveRepo({});
  const file = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
  if (!file) { console.log('Usage: node .ai-kit/context-tools.cjs schema-import <schema.sql (DDL dump) | schema.json (tbls)> [--out docs/context/data] [--no-code] [--dry-run]'); process.exitCode = 2; return; }
  const dry = flag('--dry-run');
  const p = planSchemaImport(repo, file, { outDir: opt('--out') || 'docs/context/data', code: !flag('--no-code') });
  if (p.error) { console.log(`schema-import: ${p.error}`); process.exitCode = 2; return; }
  if (!dry) for (const w of p.writes) { fs.mkdirSync(path.dirname(w.abs), { recursive: true }); fs.writeFileSync(w.abs, w.text); }
  const added = p.writes.filter(w => w.how === 'added'), changed = p.writes.filter(w => w.how !== 'added');
  console.log(`Schema import: ${p.schema.tables.length} table(s) from ${file}${dry ? ' (dry run)' : ''}`);
  if (p.ddlNote) console.log('  ' + p.ddlNote);
  if (p.codeNote) console.log('  ' + p.codeNote);
  if (added.length) { console.log('  Added:'); added.forEach(w => console.log('    + ' + w.rel)); }
  if (changed.length) { console.log('  Generated part refreshed:'); changed.forEach(w => console.log('    ~ ' + w.rel + (w.how === 'merged' ? ' (generated section added; your text kept)' : ''))); }
  if (p.same.length) console.log(`  Unchanged: ${p.same.length}`);
  if (p.gone.length) { console.log('  Pages for tables no longer in the schema (kept; check and remove by hand):'); p.gone.forEach(f => console.log('    ? ' + f)); }
  if (p.mismatches.length) { console.log('  Code and schema disagree (fix the code, or export the schema again):'); p.mismatches.slice(0, 20).forEach(x => console.log('    ! ' + x.text)); }
  if (p.questions.length) { console.log(`  Questions for people (${p.questions.length} table(s)):`); p.questions.slice(0, 20).forEach(x => console.log('    ? ' + x)); }
  if (!p.relFile) console.log('  The schema file is outside the repo: pages cannot be checked against it. Copy it to docs/context/data/schema.sql and import again.');
  console.log('  Next: people write "Meaning" and "Rules and traps" for the tables the main flows use (/context-create deep data asks the questions above), then the owner runs `review`.');
}

// Every schema import recorded in the repo: an index page whose generated block names its schema file.
function schemaSources(repo, contextFiles) {
  const out = [];
  for (const f of contextFiles.filter(x => /(^|\/)index\.md$/.test(x))) {
    let t; try { t = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
    const m = /<!-- generated:start schema-import[^\n]*\n\s*Source:\s*\[anchor:\s*([^\]]+)\]/.exec(t);
    if (m) out.push({ file: m[1].trim(), outDir: path.posix.dirname(f), index: f });
  }
  return out;
}
const mentionsData = (repo, f) => { try { return /@Entity|@Table|@Column|@JoinColumn|@Query|Repository\b|<mapper\b|\b(select|insert|update|delete)\b/i.test(fs.readFileSync(path.join(repo, f), 'utf8')); } catch { return true; } };
const lastCommit = (repo, paths) => Number((git(repo, ['log', '-1', '--format=%ct', '--', ...paths]) || '0').trim()) || 0;
// Are the table pages still what the schema file and the code say? `changed` limits the work in the commit
// check and CI: nothing runs unless a schema file, table page, migration or data-access code changed.
// With several schema exports in one repo (one per schema), a migration belongs to the exports whose tables or
// schema it names; one that names none of them (a new unqualified table) belongs to all.
function exportTables(repo, file) {
  let text; try { text = fs.readFileSync(path.join(repo, file), 'utf8'); } catch { return null; }
  let sc = null; if (/\.(sql|ddl)$/i.test(file)) sc = parseDdl(text); else { try { sc = JSON.parse(text); } catch { return null; } }
  const names = new Set(), schemas = new Set();
  for (const t of (sc && sc.tables) || []) { const n = t.name.toLowerCase(); names.add(n); names.add(bareName(n)); if (n.includes('.')) schemas.add(n.split('.')[0]); }
  return { names, schemas };
}
function migrationOwners(repo, srcs) {
  if (srcs.length < 2) return () => true;
  const sets = new Map(srcs.map(s => [s.file, exportTables(repo, s.file)]));
  const cache = new Map();
  return (mig, srcFile) => {
    if (!cache.has(mig)) {
      let t = ''; try { t = fs.readFileSync(path.join(repo, mig), 'utf8'); } catch { /* deleted */ }
      const refs = [...t.matchAll(SQL_REF_RE)].map(x => unquoteId(x[1]).toLowerCase()).concat([...t.matchAll(TABLE_ATTR_RE)].map(x => unquoteId(x[1]).toLowerCase()));
      const owners = new Set();
      for (const [f, st] of sets) if (st && refs.some(r => st.names.has(r) || (r.includes('.') && st.schemas.has(r.split('.')[0])))) owners.add(f);
      cache.set(mig, owners.size ? owners : null);
    }
    const o = cache.get(mig);
    return !o || o.has(srcFile);
  };
}
function dataFreshness(repo, a, { changedOnly = false } = {}) {
  const res = [];
  const srcsAll = schemaSources(repo, a.ctx.contextFiles).filter(s => a.files.includes(s.file));
  const belongs = migrationOwners(repo, srcsAll);
  for (const src of schemaSources(repo, a.ctx.contextFiles)) {
    if (!a.files.includes(src.file)) continue;                     // broken anchor: reported elsewhere
    const relevant = f => f === src.file || f.startsWith(src.outDir + '/') || (MIGRATION_RE.test(f) && !SKIP_CODE_RE.test(f)) || (/\.(java|kt|xml)$/i.test(f) && !TEST_RE.test(f) && mentionsData(repo, f));
    if (changedOnly && !a.changed.some(relevant)) continue;
    const p = planSchemaImport(repo, src.file, { outDir: src.outDir, files: a.files });
    if (p.error) { res.push({ src, warn: `${src.file}: ${p.error}` }); continue; }
    const r = { src, stale: p.writes.map(w => w.rel), mismatches: p.mismatches, warns: [] };
    if (r.stale.length) r.warns.push(`${r.stale.length} table page(s) out of date with ${src.file} or the code (${r.stale.slice(0, 3).map(x => path.posix.basename(x, '.md')).join(', ')}${r.stale.length > 3 ? ' …' : ''}). Run: ${toolCmd} schema-import ${src.file}`);
    for (const x of p.mismatches.slice(0, 5)) r.warns.push(`Code and schema disagree: ${x.text}`);
    const migs = a.files.filter(f => MIGRATION_RE.test(f) && !SKIP_CODE_RE.test(f) && !TEST_RE.test(f));
    const newMig = changedOnly ? a.changed.filter(f => migs.includes(f) && belongs(f, src.file)) : [];
    if (newMig.length && !a.changed.includes(src.file)) r.warns.push(`Migration changed (${path.posix.basename(newMig[0])}) but ${src.file} did not. Once it has run on your local or development database, export the schema again and run schema-import.`);
    else if (!changedOnly && migs.length && !a.changed.includes(src.file) && lastCommit(repo, [src.file])) {
      const dirs = [...new Set(migs.filter(f => belongs(f, src.file)).map(f => path.posix.dirname(f)))];
      if (dirs.length && lastCommit(repo, dirs) > lastCommit(repo, [src.file])) r.warns.push(`A migration was committed after ${src.file}. Once it has run on your local or development database, export the schema again and run schema-import.`);
    }
    res.push(r);
  }
  return res;
}

// ---------------------------------------------------------------- review (a person signs off pages)
// Records the OKF review event and sets the page to stable. Only in a terminal a person types in: a review
// says a person checked the page against the code, so an agent must not run it for them.
function positional() {
  const takes = new Set(['--by', '--repo', '--out', '--base', '--format', '--date']);
  const out = [];
  for (let i = 1; i < argv.length; i++) { if (argv[i].startsWith('--')) { if (takes.has(argv[i])) i++; continue; } out.push(argv[i]); }
  return out;
}
const PLACEHOLDER_RE = /^\s*(?:[-*]\s+)?<[^<>]{3,}>\s*$/;
function reviewProblems(text) {
  // Placeholder lines outside generated blocks, grouped by section.
  const lines = text.split(/\r?\n/); let inGen = false, section = '';
  const found = [];
  lines.forEach((l, i) => {
    if (l.includes('<!-- generated:start')) inGen = true;
    if (/^#{1,6}\s/.test(l)) section = l.replace(/^#+\s*/, '');
    if (!inGen && PLACEHOLDER_RE.test(l)) found.push({ i, section, line: l.trim() });
    if (l.includes('<!-- generated:end')) inGen = false;
  });
  return found;
}
function dropPlaceholders(text, found) {
  const drop = new Set(found.map(f => f.i));
  let lines = text.split(/\r?\n/).filter((_, i) => !drop.has(i));
  // A section left with nothing in it loses its heading too.
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; if (j >= lines.length || /^##\s/.test(lines[j])) { i = j - 1; continue; } }
    out.push(lines[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
function addReview(text, who, date) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (!m) return null;
  let fm = m[1].split(/\r?\n/);
  const ev = `{ by: ${JSON.stringify('human:' + who)}, at: ${JSON.stringify(date)} }`;
  const si = fm.findIndex(l => /^status:/.test(l));
  if (si >= 0) fm[si] = 'status: stable'; else fm.push('status: stable');
  const vi = fm.findIndex(l => /^verified:/.test(l));
  if (vi < 0) fm.push('verified:', `  - ${ev}`);
  else {
    const v = fm[vi].replace(/^verified:\s*/, '');
    if (!v || v === '[]') { let j = vi + 1; while (j < fm.length && /^\s+-/.test(fm[j])) j++; fm[vi] = 'verified:'; fm.splice(j, 0, `  - ${ev}`); }
    else if (/^\[.*\]$/.test(v)) fm[vi] = `verified: ${v.replace(/\s*\]$/, '')}, ${ev} ]`;
    else return null;
  }
  return text.replace(m[0], `---\n${fm.join('\n')}\n---`);
}
function cmdReview() {
  const repo = resolveRepo({});
  const who = (opt('--by') || '').replace(/^human:/, '').trim();
  const targets = positional();
  if (!who || !targets.length) { console.log('Usage: node .ai-kit/context-tools.cjs review <page.md | folder> [...] --by <your name>\n  Marks pages as reviewed by you: status stable and a review entry with today\'s date. Run it after you have checked the pages against the code.'); process.exitCode = 2; return; }
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    console.log('review: run this in your own terminal. A review records that a person checked the pages against the code, so an agent must not run it for you.' +
      (process.platform === 'win32' ? ' (In Git Bash outside VS Code, start it with: winpty node …)' : ''));
    process.exitCode = 2; return;
  }
  const date = opt('--date') || localDate(new Date());
  const pages = [];
  for (const t of targets) {
    const abs = path.resolve(t);
    let st; try { st = fs.statSync(abs); } catch { console.log(`  ? ${t}: not found`); continue; }
    if (st.isDirectory()) walk(abs, repo, []).filter(f => f.endsWith('.md') && !/(^|\/)index\.md$|README\.md$/.test(f)).forEach(f => pages.push(f));
    else pages.push(toPosix(path.relative(repo, abs)));
  }
  const a = analyse(repo);
  const plan = [], refused = [];
  for (const rel of [...new Set(pages)]) {
    const text = fs.readFileSync(path.join(repo, rel), 'utf8');
    const meta = pageMeta(text);
    if (!/^---\r?\n/.test(text)) { refused.push(`${rel}: no frontmatter (run migrate first)`); continue; }
    const broken = a.broken.filter(b => b.file === rel);
    if (broken.length) { refused.push(`${rel}: ${broken.length} anchor(s) point at files that do not exist (line ${broken.map(b => b.line).join(', ')})`); continue; }
    const ph = reviewProblems(text);
    const meaning = ph.find(f => /^(Meaning|What it is|Purpose)\b/i.test(f.section));
    if (meaning) { refused.push(`${rel}: "${meaning.section}" is still the template text; write it first`); continue; }
    if (meta && meta.status !== 'draft' && (meta.reviewers || []).some(v => v.toLowerCase() === 'human:' + who.toLowerCase())) { refused.push(`${rel}: already reviewed by ${who}`); continue; }
    const unv = (text.split(/^## Unverified\s*$/m)[1] || '').split(/^## /m)[0].split(/\r?\n/).filter(l => /^\s*[-*]\s+\S/.test(l) && !PLACEHOLDER_RE.test(l)).length;
    plan.push({ rel, text, ph, unv });
  }
  console.log(`Review by ${who} on ${date}:`);
  refused.forEach(r => console.log('  not marked  ' + r));
  plan.forEach(p => console.log(`  will mark   ${p.rel}${p.ph.length ? ` (removes ${p.ph.length} unused template line(s))` : ''}${p.unv ? ` (keeps ${p.unv} Unverified line(s): they stay unconfirmed)` : ''}`));
  if (!plan.length) { process.exitCode = refused.length ? 1 : 0; return; }
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`Did you check ${plan.length === 1 ? 'this page' : `these ${plan.length} pages`} against the code? Mark as reviewed [y/N] `, ans => {
    rl.close();
    if (!/^y(es)?$/i.test(ans.trim())) { console.log('Nothing changed.'); return; }
    for (const p of plan) {
      const next = addReview(p.ph.length ? dropPlaceholders(p.text, p.ph) : p.text, who, date);
      if (next === null) { console.log(`  ! ${p.rel}: could not read its "verified:" field; add the line by hand`); continue; }
      fs.writeFileSync(path.join(repo, p.rel), next);
    }
    console.log(`Marked ${plan.length} page(s). Commit them in a pull request; a second person who did not write them can run review too (needed for a 5).`);
  });
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
  else ok('kit', `Kit ${st.version} for ${[].concat(st.tools || st.tool || []).join(', ') || 'unknown tools'}${st.mode === 'workspace' ? ' (product workspace home)' : st.mode === 'member' ? ` (repo in the product workspace ${st.workspace})` : ''}`);
  const isMember = st && st.mode === 'member';
  if (isMember) {
    const home = workspaceHome(repo);
    home ? ok('workspace', `Tools, hooks and skills come from ${toPosix(path.relative(repo, home))}; open the product workspace to use them`)
      : fail('workspace', `The home repo recorded in .ai-kit/kit.json (${st.workspace}) is not there. Clone it next to this repo, or re-register this repo`);
  }
  if (st && st.mode === 'workspace') {
    for (const m of members(repo)) {
      if (!exists(path.join(m.dir, '.git'))) { warn('workspace', `${m.name}: not cloned at ${toPosix(path.relative(repo, m.dir))}`); continue; }
      const hp = (git(m.dir, ['config', '--get', 'core.hooksPath']) || '').trim();
      const toHome = hp && path.resolve(m.dir, hp) === path.resolve(repo, '.githooks');
      const agents = exists(path.join(m.dir, 'AGENTS.md'));
      (toHome && agents) ? ok('workspace', `${m.name}: context present, commit check from the home repo`)
        : warn('workspace', `${m.name}: ${agents ? '' : 'no AGENTS.md yet (/context-create); '}${toHome ? '' : 'commit check not linked (re-run install.mjs <repo> --workspace on this clone)'}`.replace(/; $/, ''));
    }
    const extra = unregistered(repo);
    if (extra.length) warn('workspace', `In product.code-workspace but not registered: ${extra.map(d => path.basename(d)).join(', ')}`);
  }
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
  if (!hookFiles.length && !isMember) warn('hooks', 'No agent hook file found. The skills and the git hook still work; hooks only add notes for the agent.');
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
  else if (hookFiles.length && !isMember) warn('hook runs', 'No agent has called the hooks in this clone yet. If you have used agent chat here, hooks are not running. In VS Code: check the session target (Copilot harness reads .github/hooks), that "chat.useHooks" is on for Local sessions, that your organisation allows hooks, and look in "Developer: Open Agent Debug Logs". In Claude Code: run /hooks.');

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
  // The check counts wherever it runs: the kit's own pipeline file, or a step added to the team's pipeline.
  const pipeFiles = [];
  try { for (const f of fs.readdirSync(repo)) if (/^(\.)?azure-pipelines.*\.ya?ml$/i.test(f)) pipeFiles.push(f); } catch { /* none */ }
  for (const d of ['.azure-pipelines', '.pipelines', 'pipelines', '.azuredevops', '.github/workflows']) {
    try { for (const f of fs.readdirSync(path.join(repo, ...d.split('/')))) if (/\.ya?ml$/i.test(f)) pipeFiles.push(`${d}/${f}`); } catch { /* none */ }
  }
  const runsCheck = pipeFiles.filter(f => { try { return /context-tools\.cjs\s+ci\b/.test(fs.readFileSync(path.join(repo, f), 'utf8')); } catch { return false; } });
  const tpl = exists(path.join(repo, '.ai-kit', 'ci', 'azure-pipelines.yml')) ? '.ai-kit/ci/azure-pipelines.yml' : null;
  if (runsCheck.length) ok('ci', `Pull request check in ${runsCheck.join(', ')} (make sure the pipeline runs for pull requests)`);
  else if (tpl) info('ci', `No pull request check yet. Either add the step from the kit's snippets/ci-step-*.yml to your own pipeline, or create a pipeline from ${tpl}`);
  else info('ci', 'No pull request check yet (optional). Add the step from the kit\'s snippets/ci-step-member-*.yml to your own pipeline, or install with --ci azure|github for a separate one');
  if (exists(path.join(repo, 'openspec'))) {
    const cfg = (() => { try { return fs.readFileSync(path.join(repo, 'openspec', 'config.yaml'), 'utf8'); } catch { return ''; } })();
    /^schema:\s*story-tdd/m.test(cfg) ? warn('openspec', 'openspec/config.yaml still uses the old story-tdd workflow: run install.mjs --upgrade to return to OpenSpec\'s default documents') : ok('openspec', 'OpenSpec with its default documents');
  }
  // Data context: schema file, table pages, links to code, the rule that sends agents to the pages.
  {
    const files = listFiles(repo), ctx = readContext(repo, files);
    const srcs = schemaSources(repo, ctx.contextFiles);
    const rules = ctx.contextFiles.filter(f => /^(\.github\/instructions|\.claude\/rules)\//.test(f)).some(f => { try { return /docs\/context\/data/.test(fs.readFileSync(path.join(repo, f), 'utf8')); } catch { return false; } });
    for (const d of dataFreshness(repo, { files, ctx, changed: [] })) {
      if (d.warn) { warn('data', d.warn); continue; }
      const pages = files.filter(f => f.startsWith(d.src.outDir + '/tables/') && f.endsWith('.md'));
      const withCode = pages.filter(f => { try { return /^- (Entity|Repository|SQL that names it)/m.test(fs.readFileSync(path.join(repo, f), 'utf8')); } catch { return false; } });
      const reviewed = pages.filter(f => { try { const m = pageMeta(fs.readFileSync(path.join(repo, f), 'utf8')); return m && m.reviewed; } catch { return false; } });
      (d.stale.length || d.mismatches.length ? warn : ok)('data', `${d.src.file}: ${pages.length} table page(s), ${withCode.length} linked to code, ${reviewed.length} reviewed${d.stale.length ? `; ${d.stale.length} out of date (run schema-import ${d.src.file})` : ''}${d.mismatches.length ? `; ${d.mismatches.length} place(s) where code and schema disagree (schema-import lists them)` : ''}`);
      for (const w of d.warns.filter(x => /^A migration was committed/.test(x))) warn('data', w);
      rules ? ok('data', 'A rule file sends agents to docs/context/data when they touch data code') : warn('data', 'No rule file points agents at docs/context/data: add the "Data access" rule (/context-create deep data does this)');
    }
    if (!srcs.length && files.some(f => MIGRATION_RE.test(f) && !SKIP_CODE_RE.test(f))) info('data', 'Migrations found but no table pages. Export the schema to docs/context/data/schema.sql, then /context-create deep data');
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
    // Branch and title naming, from what the pipeline knows about the pull request.
    let title = opt('--title') || process.env.AI_KIT_PR_TITLE || '';
    if (!title && process.env.GITHUB_EVENT_PATH) { const ev = readJson(process.env.GITHUB_EVENT_PATH); title = ev && ev.pull_request && ev.pull_request.title || ''; }
    const branch = opt('--branch') || process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH || process.env.GITHUB_HEAD_REF || '';
    if (branch || title) for (const f of conventionFindings(repo, { branch, title })) { out.push(`  ${f.block ? 'ERROR' : 'WARN '}  Naming: ${f.text}`); if (f.block) r.failed = true; }
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
  'pages-for': cmdPagesFor, 'schema-import': cmdSchemaImport, review: cmdReview, usage: cmdUsage, names: cmdNames, schemas: cmdSchemas, conventions: cmdConventions, ci: cmdCi, mcp: cmdMcp };
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
    '       | pages-for <file>... | migrate [--dry-run] | schema-import <schema.sql|schema.json> [--out <dir>] | ci [--base <ref>] | mcp\n' +
    '       | session-start | post-edit | stop | guard   (agent hooks)');
  process.exitCode = command ? 2 : 0;
}
