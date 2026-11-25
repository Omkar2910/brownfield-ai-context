#!/usr/bin/env node
// Set up, extend or upgrade the AI Context Kit for a folder of repos, in one go.
//
//   node kit/setup.mjs                         in a terminal: asks what you want, shows the plan, runs it after you say yes
//   node kit/setup.mjs scan  [--root <dir>] [--json]
//   node kit/setup.mjs plan  [--root <dir>] [choices] [--json]
//   node kit/setup.mjs apply [--root <dir>] [choices] --yes
//
// --root     the folder that holds your repos. Default: the folder that holds the kit's own folder, so put the
//            kit next to your repos (projects/ai-context-kit, projects/report-service, ...).
// Choices (all optional; anything left out takes the default `plan` shows):
//   --setup workspace|repo        one home repo for the product (recommended for several repos), or each repo on its own
//   --repos a,b,c                 which repos (folder names); default: every git repo in the folder
//   --home <name>                 the home repo's folder name (workspace); default: an existing one, else product-context
//   --tools copilot,claude,codex  which agents your team uses
//   --product-context yes|no      workspace: write the product pages after install; repo: create a product hub
//   --ci none|existing|azure|github   none (default); existing = show the step to add to your own pipeline;
//                                 azure/github = add a separate pull request pipeline file
//   --openspec init|skip          run `openspec init` where it is missing (needs the OpenSpec CLI)
//   --graphify yes|no  --mcp yes|no  --upgrade yes|no  --org <path>  --source <url>
//   --context a,b                 repos to write context for after install (the agent does this; listed as next steps)
//   --allow-dirty                 also change repos that have uncommitted changes (normally skipped)
//   --answers <file.json>         the same choices as a JSON file
//
// The plan is worked out from what is on disk each time: run it again and it shows only what is left. It only
// calls install.mjs, openspec and the context tool. It never commits, pushes or deletes your work.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kitDir = path.dirname(fileURLToPath(import.meta.url));
const kitRepo = path.resolve(kitDir, '..');
const installer = path.join(kitDir, 'install.mjs');
const kitVersion = fs.readFileSync(path.join(kitDir, 'VERSION'), 'utf8').trim();
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined; };
const flag = n => argv.includes(n);
const exists = p => fs.existsSync(p);
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const git = (cwd, a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const onPath = bin => { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore', shell: process.platform === 'win32' }); return r.status === 0; };
const verLess = (a, b) => { const p = v => String(v || '0').split('.').map(Number); const [x, y] = [p(a), p(b)]; for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
const ALL_TOOLS = ['copilot', 'claude', 'codex'];
const OPENSPEC_TOOL = { copilot: 'github-copilot', claude: 'claude', codex: 'codex' };
const q = s => /[\s"']/.test(s) ? JSON.stringify(s) : s;            // quote a path for display

// ------------------------------------------------------------------ scan: what is in the folder
function guessType(dir) {
  const has = f => exists(path.join(dir, f));
  if (has('angular.json')) return 'ui (Angular)';
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) return 'service (Java)';
  if (has('package.json')) return 'ui or library (Node)';
  if (has('go.mod')) return 'service (Go)';
  if (has('pyproject.toml') || has('requirements.txt')) return 'service (Python)';
  if ([...fs.readdirSync(dir)].some(f => /\.(sln|csproj)$/.test(f))) return 'service (.NET)';
  return 'other';
}
function ownPipelines(dir) {
  const out = [];
  try { for (const f of fs.readdirSync(dir)) if (/^(azure-pipelines|\.azure-pipelines).*\.ya?ml$/i.test(f) && f !== 'azure-pipelines.ai-context.yml') out.push(f); } catch { /* none */ }
  for (const d of ['.azure-pipelines', '.pipelines', 'pipelines', '.azuredevops', '.github/workflows']) {
    try { for (const f of fs.readdirSync(path.join(dir, ...d.split('/')))) if (/\.ya?ml$/i.test(f) && f !== 'ai-context.yml') out.push(`${d}/${f}`); } catch { /* none */ }
  }
  return out;
}
function schemaSource(dir) {
  const idx = path.join(dir, 'docs', 'context', 'data', 'index.md');
  try { const m = /<!-- generated:start schema-import[^\n]*\n\s*Source:\s*\[anchor:\s*([^\]]+)\]/.exec(fs.readFileSync(idx, 'utf8')); return m ? m[1].trim() : null; } catch { return null; }
}
function scan(root) {
  const repos = [];
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return { root, repos, homes: [], error: `cannot read ${root}` }; }
  for (const e of entries.filter(x => x.isDirectory() && !x.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(root, e.name);
    if (path.resolve(dir) === kitRepo || !exists(path.join(dir, '.git'))) continue;
    const stamp = readJson(path.join(dir, '.ai-kit', 'kit.json')) || readJson(path.join(dir, '.github', 'ai-kit.json')) || readJson(path.join(dir, '.claude', 'ai-kit.json'));
    const mode = !stamp ? 'none' : stamp.mode === 'workspace' ? 'home' : stamp.mode === 'member' ? 'member' : 'own';
    const ctxDir = path.join(dir, 'docs', 'context');
    let pages = 0; try { pages = fs.readdirSync(ctxDir).filter(f => f.endsWith('.md')).length; } catch { /* none */ }
    let tablePages = 0; try { tablePages = fs.readdirSync(path.join(ctxDir, 'data', 'tables')).filter(f => f.endsWith('.md')).length; } catch { /* none */ }
    const hooksPath = git(dir, ['config', '--get', 'core.hooksPath']);
    repos.push({
      name: e.name, dir, type: mode === 'home' ? 'home repo' : guessType(dir), mode,
      version: stamp ? stamp.version || null : null,
      tools: stamp ? [].concat(stamp.tools || stamp.tool || []) : [],
      workspace: mode === 'member' ? path.basename(path.resolve(dir, stamp.workspace || '')) : null,
      agentsMd: exists(path.join(dir, 'AGENTS.md')), pages, tablePages,
      schemaFile: ['schema.sql', 'schema.json'].map(f => `docs/context/data/${f}`).find(f => exists(path.join(dir, ...f.split('/')))) || null,
      schemaSource: schemaSource(dir),
      openspec: exists(path.join(dir, 'openspec', 'config.yaml')),
      pipelines: ownPipelines(dir),
      kitPipeline: exists(path.join(dir, 'azure-pipelines.ai-context.yml')) || exists(path.join(dir, '.github', 'workflows', 'ai-context.yml')),
      hooksLinked: !!hooksPath, hooksPath,
      dirty: !!(git(dir, ['status', '--porcelain']) || ''),
      old: stamp && mode !== 'member' ? verLess(stamp.version, kitVersion) : false,
    });
  }
  const homes = repos.filter(r => r.mode === 'home');
  for (const r of repos.filter(x => x.mode === 'member')) { const h = homes.find(x => x.name === r.workspace); r.old = h ? r.version !== h.version : false; }
  return { root, kitVersion, kitDir, repos, homes, openspecCli: onPath('openspec'), graphifyCli: onPath('graphify') };
}

// ------------------------------------------------------------------ choices and their defaults
function readChoices() {
  let c = {};
  const file = opt('--answers');
  if (file) { c = file.trim().startsWith('{') ? JSON.parse(file) : readJson(path.resolve(file)); if (!c) { console.error(`Cannot read ${file}`); process.exit(2); } }
  const list = v => v === undefined ? undefined : v.split(',').map(s => s.trim()).filter(Boolean);
  const yes = v => v === undefined ? undefined : /^(y|yes|true|1)$/i.test(v);
  const set = (k, v) => { if (v !== undefined) c[k] = v; };
  set('setup', opt('--setup')); set('repos', list(opt('--repos'))); set('home', opt('--home'));
  set('tools', opt('--tools') === 'all' ? ALL_TOOLS : list(opt('--tools'))); set('productContext', yes(opt('--product-context')));
  set('ci', opt('--ci')); set('openspec', opt('--openspec')); set('graphify', yes(opt('--graphify'))); set('mcp', yes(opt('--mcp')));
  set('upgrade', yes(opt('--upgrade'))); set('org', opt('--org')); set('source', opt('--source')); set('context', list(opt('--context')));
  if (flag('--allow-dirty')) c.allowDirty = true;
  return c;
}
function defaults(s) {
  const home = s.homes[0];
  const others = s.repos.filter(r => r.mode !== 'home');
  const own = others.filter(r => r.mode === 'own').length;
  const setup = home ? 'workspace' : own && own >= others.filter(r => r.mode === 'none').length ? 'repo' : others.length >= 2 ? 'workspace' : 'repo';
  const tools = [...new Set(s.repos.flatMap(r => r.tools))].filter(t => ALL_TOOLS.includes(t));
  return {
    setup, home: home ? home.name : 'product-context',
    repos: others.filter(r => !(r.mode === 'member' && home && r.workspace !== home.name)).map(r => r.name),
    tools: tools.length ? tools : ['copilot'], productContext: setup === 'workspace', ci: 'none',
    openspec: 'skip', graphify: false, mcp: false, upgrade: true, org: null, source: null,
    context: others.filter(r => !r.agentsMd).map(r => r.name), allowDirty: false,
  };
}
function validate(c, s) {
  const errs = [];
  if (!['workspace', 'repo'].includes(c.setup)) errs.push('setup must be "workspace" or "repo"');
  if (!c.tools.length || c.tools.some(t => !ALL_TOOLS.includes(t))) errs.push('tools must be copilot, claude and/or codex');
  if (!['none', 'existing', 'azure', 'github'].includes(c.ci)) errs.push('ci must be none, existing, azure or github');
  if (!['init', 'skip'].includes(c.openspec)) errs.push('openspec must be init or skip');
  const unknown = c.repos.filter(n => !s.repos.some(r => r.name === n));
  if (unknown.length) errs.push(`not a git repo in ${s.root}: ${unknown.join(', ')}`);
  if (c.setup === 'workspace' && !/^[\w.-]+$/.test(c.home)) errs.push('home must be a folder name');
  return errs;
}

// ------------------------------------------------------------------ plan: steps worked out from what is on disk
function plan(s, c) {
  const steps = [], notes = [], skipped = [], after = [];
  const node = (...a) => ({ bin: process.execPath, args: [installer, ...a] });
  const ciFlag = ['azure', 'github'].includes(c.ci) ? ['--ci', c.ci] : [];
  const homeDir = path.join(s.root, c.home);
  const homeRepo = s.repos.find(r => r.name === c.home);
  const add = (repo, label, run, why) => steps.push({ repo, label, why, ...run });
  const tool = (repoDir) => c.setup === 'workspace' ? path.join(homeDir, '.ai-kit', 'context-tools.cjs') : path.join(repoDir, '.ai-kit', 'context-tools.cjs');
  const opensp = (repo, dir, tools) => {
    if (c.openspec !== 'init' || exists(path.join(dir, 'openspec', 'config.yaml'))) return false;
    if (!s.openspecCli) { notes.push(`OpenSpec CLI not found: install it (npm install -g @fission-ai/openspec@latest) and run setup again, or run \`openspec init\` in ${repo} yourself.`); return false; }
    add(repo, `Set up OpenSpec${tools === 'none' ? ' (folder only; its commands live in the home repo)' : ''}`, { bin: 'openspec', args: ['init', '--tools', tools], cwd: dir });
    return true;
  };

  if (c.setup === 'workspace') {
    const homeTools = homeRepo ? homeRepo.tools : [];
    const wantTools = [...new Set([...homeTools, ...c.tools])];
    if (!homeRepo) {
      if (exists(homeDir)) skipped.push({ repo: c.home, why: `${c.home} exists but is not a git repo: choose another home name, or delete the folder` });
      else add(c.home, 'Create the home repo (skills, agents, hooks, context tool, product pages)', node('--create-workspace', homeDir, '--tool', wantTools.join(','), ...(c.org ? ['--org', c.org] : []), ...(c.source ? ['--source', c.source] : [])));
    } else if (homeRepo.mode !== 'home') {
      skipped.push({ repo: c.home, why: `${c.home} is a code repo, not a home repo: choose another home name` });
    } else {
      if (wantTools.length > homeTools.length) add(c.home, `Add agents to the home repo: ${wantTools.filter(t => !homeTools.includes(t)).join(', ')}`, node('--create-workspace', homeDir, '--tool', wantTools.join(',')));
      if (homeRepo.old && c.upgrade) add(c.home, `Upgrade the kit ${homeRepo.version} → ${kitVersion}`, node(homeDir, '--upgrade', ...(c.source ? ['--source', c.source] : [])), 'replaces only the kit\'s own files');
      else if (c.source && !homeRepo.old) add(c.home, 'Record where your kit copy lives', node(homeDir, '--upgrade', '--source', c.source));
    }
    if (homeRepo && homeRepo.dirty && !c.allowDirty && steps.some(x => x.repo === c.home)) {
      for (let i = steps.length - 1; i >= 0; i--) if (steps[i].repo === c.home) steps.splice(i, 1);
      skipped.push({ repo: c.home, why: 'has uncommitted changes: commit or stash them, then run setup again (its repos are still added)' });
    }
    const homeUsable = steps.some(x => x.repo === c.home) || (homeRepo && homeRepo.mode === 'home');
    if (homeUsable) opensp(c.home, homeDir, wantTools.map(t => OPENSPEC_TOOL[t]).join(','));
    for (const name of c.repos.filter(n => n !== c.home)) {
      const r = s.repos.find(x => x.name === name); if (!r) continue;
      if (r.mode === 'home') { skipped.push({ repo: name, why: 'is a home repo of another workspace' }); continue; }
      if (r.mode === 'member' && r.workspace !== c.home) { skipped.push({ repo: name, why: `already belongs to the workspace ${r.workspace}` }); continue; }
      if (!homeUsable) { skipped.push({ repo: name, why: 'no home repo to join' }); continue; }
      const mine = [];
      const os1 = opensp(name, r.dir, 'none'); if (os1) mine.push(steps.pop());
      const join = (label, extra = [], why) => mine.push({ repo: name, label, why, ...node(r.dir, '--workspace', homeDir, ...(c.graphify ? ['--graphify'] : []), ...extra) });
      if (r.mode === 'none') join('Add to the workspace (stamp, commit check, pull request template; no kit copy)', ciFlag);
      else if (r.mode === 'own') join(`Move into the workspace (removes its own copy of the kit ${r.version}; keeps AGENTS.md, rules, docs/context)`, ['--upgrade', ...ciFlag]);
      else {
        const why = [];
        if (!r.hooksLinked) why.push('link the commit check on this computer');
        if (ciFlag.length && !r.kitPipeline) why.push('add the pull request pipeline file');
        if (os1) why.push('add the kit\'s OpenSpec settings');
        if (r.old && c.upgrade) why.push('refresh its stamp to the home repo\'s version');
        if (why.length) join(why[0][0].toUpperCase() + why.join('; ').slice(1), ciFlag);
      }
      if (mine.length && r.dirty && !c.allowDirty) { skipped.push({ repo: name, why: 'has uncommitted changes: commit or stash them, then run setup again' }); continue; }
      steps.push(...mine);
      const upgraded = mine.length && (r.mode === 'own' && verLess(r.version, '2.2.0') || r.mode === 'member' && r.old);
      if (r.schemaSource && (upgraded || (homeRepo && homeRepo.old && c.upgrade && verLess(homeRepo.version, '2.2.0'))))
        add(name, 'Refresh table pages (adds the links to entities, repositories and SQL)', { bin: process.execPath, args: [tool(r.dir), 'schema-import', r.schemaSource, '--repo', r.dir], cwd: r.dir }, 'rewrites only the generated parts');
    }
  } else {
    for (const name of c.repos) {
      const r = s.repos.find(x => x.name === name); if (!r) continue;
      if (r.mode === 'home') { skipped.push({ repo: name, why: 'is a workspace home repo' }); continue; }
      if (r.mode === 'member') { skipped.push({ repo: name, why: `belongs to the workspace ${r.workspace}: choose the workspace setup to keep it there` }); continue; }
      const mine = [];
      const wantTools = [...new Set([...r.tools, ...c.tools])];
      const extra = [...(c.graphify ? ['--graphify'] : []), ...(c.mcp ? ['--mcp'] : []), ...ciFlag, ...(c.org ? ['--org', c.org] : []), ...(c.source ? ['--source', c.source] : [])];
      if (opensp(name, r.dir, wantTools.map(t => OPENSPEC_TOOL[t]).join(','))) mine.push(steps.pop());
      if (r.mode === 'none') mine.push({ repo: name, label: `Install the kit for ${wantTools.join(', ')}`, ...node(r.dir, '--tool', wantTools.join(','), ...extra) });
      else {
        const why = [];
        if (r.old && c.upgrade) why.push(`upgrade ${r.version} → ${kitVersion}`);
        if (wantTools.length > r.tools.length) why.push(`add ${wantTools.filter(t => !r.tools.includes(t)).join(', ')}`);
        if (ciFlag.length && !r.kitPipeline) why.push('add the pull request pipeline file');
        if (mine.length) why.push('add the kit\'s OpenSpec settings');
        if (c.graphify || c.mcp || c.org || c.source) why.push('apply the chosen options');
        if (why.length) mine.push({ repo: name, label: why[0][0].toUpperCase() + why.join('; ').slice(1), why: 'replaces only the kit\'s own files', ...node(r.dir, '--upgrade', '--tool', wantTools.join(','), ...extra) });
        if (r.old && c.upgrade && String(r.version).startsWith('1.')) mine.push({ repo: name, label: 'Move pages to the new format (no AI)', bin: process.execPath, args: [tool(r.dir), 'migrate', '--repo', r.dir], cwd: r.dir });
      }
      if (mine.length && r.dirty && !c.allowDirty) { skipped.push({ repo: name, why: 'has uncommitted changes: commit or stash them, then run setup again' }); continue; }
      steps.push(...mine);
      if (r.schemaSource && mine.length && r.old && verLess(r.version, '2.2.0'))
        add(name, 'Refresh table pages (adds the links to entities, repositories and SQL)', { bin: process.execPath, args: [tool(r.dir), 'schema-import', r.schemaSource, '--repo', r.dir], cwd: r.dir }, 'rewrites only the generated parts');
    }
    if (c.productContext && !exists(path.join(s.root, c.home))) add(c.home, 'Create a product context hub (system map and flows across repos)', node('--create-hub', path.join(s.root, c.home)));
  }

  // What people and the agent do after the install (these need judgement or an AI, so they are not run here).
  const changed = [...new Set(steps.map(x => x.repo))];
  const rank = n => { const t = (s.repos.find(r => r.name === n) || {}).type || ''; return t.startsWith('service') ? 0 : t.startsWith('ui') ? 2 : 1; };
  const ctx = c.context.filter(n => c.repos.includes(n) && !skipped.some(k => k.repo === n)).sort((a, b) => rank(a) - rank(b));
  if (ctx.length) after.push(`Write context, one repo per chat: /context-create in ${ctx.join(', ')} (services first). Then /context-create deep, one page at a time.`);
  for (const r of s.repos.filter(x => c.repos.includes(x.name) && x.schemaFile && !x.schemaSource)) after.push(`${r.name} has ${r.schemaFile}: /context-create deep data turns it into table pages.`);
  if (c.setup === 'workspace' && c.productContext) after.push(`Product pages: /product-context in ${c.home}${homeRepo && homeRepo.pages ? ' update (only the pages new repos affect)' : ''}.`);
  if (c.setup === 'workspace' && !c.productContext) after.push(`Product pages skipped. Run /product-context in ${c.home} whenever you want them.`);
  if (c.ci === 'existing') {
    const snip = c.setup === 'workspace' ? 'ci-step-member' : 'ci-step';
    after.push(`Pull request check in your own pipeline: add the step in ${path.join('kit', 'snippets', `${snip}-azure.yml`)} (Azure) or ${path.join('kit', 'snippets', `${snip}-github.yml`)} (GitHub) to the pipeline each repo already runs for pull requests.`);
  }
  if (['azure', 'github'].includes(c.ci)) after.push(c.ci === 'azure'
    ? 'Pull request check: in Azure DevOps create a pipeline from azure-pipelines.ai-context.yml in each repo (set the home repo\'s project inside), then add it as build validation on main, warnings first.'
    : 'Pull request check: .github/workflows/ai-context.yml runs on every pull request; make it required later.');
  if (changed.length) after.push(`Review and commit on a branch in: ${changed.join(', ')}. Setup never commits or pushes.`);
  if (c.setup === 'workspace') after.push(`Teammates: after cloning ${c.home} next to the repos, run \`node <kit>/setup.mjs\` (or \`install.mjs <repo> --workspace ${c.home}\`) once to link the commit check.`);
  after.push(c.setup === 'workspace'
    ? `Open it: VS Code → ${c.home}/product.code-workspace · Claude Code → node ${c.home}/scripts/hub.mjs claude · Codex → start in ${c.home}.`
    : 'Open each repo in your agent; type / to see the skills.');
  const checks = c.setup === 'workspace' ? [{ repo: c.home, dir: homeDir }] : c.repos.filter(n => !skipped.some(k => k.repo === n)).map(n => ({ repo: n, dir: path.join(s.root, n) }));
  return { choices: c, steps, skipped, notes, after, checks };
}

// ------------------------------------------------------------------ printing
function printScan(s) {
  console.log(`Kit ${kitVersion} · folder ${s.root}`);
  if (!s.repos.length) { console.log('  No git repos found next to the kit. Use --root <folder that holds your repos>.'); return; }
  const state = r => r.mode === 'none' ? 'no kit' : r.mode === 'home' ? `home repo, kit ${r.version}` : r.mode === 'member' ? `in workspace ${r.workspace}` : `own copy, kit ${r.version}`;
  const ctx = r => r.agentsMd ? `AGENTS.md, ${r.pages} page(s)${r.tablePages ? `, ${r.tablePages} table page(s)` : ''}` : 'no context yet';
  const w = Math.max(...s.repos.map(r => r.name.length), 4);
  console.log(`  ${'Repo'.padEnd(w)}  ${'Kind'.padEnd(20)}  ${'Kit'.padEnd(34)}  Context`);
  for (const r of s.repos) console.log(`  ${r.name.padEnd(w)}  ${r.type.padEnd(20)}  ${(state(r) + (r.old ? ' (older)' : '')).padEnd(34)}  ${ctx(r)}${r.dirty ? '  · uncommitted changes' : ''}${r.pipelines.length ? `  · own pipeline: ${r.pipelines[0]}${r.pipelines.length > 1 ? ' …' : ''}` : ''}`);
  console.log(`  OpenSpec CLI: ${s.openspecCli ? 'found' : 'not found'} · Graphify: ${s.graphifyCli ? 'found' : 'not found'}`);
}
function printPlan(p) {
  const c = p.choices;
  console.log(`\nPlan (${c.setup === 'workspace' ? `product workspace, home repo ${c.home}` : 'each repo on its own'}; agents: ${c.tools.join(', ')}; product context: ${c.productContext ? 'yes' : 'no'}; pull request check: ${c.ci}):`);
  if (!p.steps.length) console.log('  Nothing to install or upgrade: everything chosen is already set up.');
  p.steps.forEach((x, i) => console.log(`  ${i + 1}. ${x.repo}: ${x.label}${x.why ? ` (${x.why})` : ''}\n       ${[path.basename(x.bin) === path.basename(process.execPath) ? 'node' : x.bin, ...x.args.map(a => q(path.isAbsolute(a) && a.startsWith(s0.root) ? path.relative(s0.root, a) || '.' : a))].join(' ')}`));
  for (const k of p.skipped) console.log(`  skipped ${k.repo}: ${k.why}`);
  for (const n of p.notes) console.log(`  note: ${n}`);
  console.log('\nAfter that:');
  p.after.forEach(a => console.log(`  - ${a}`));
}

// ------------------------------------------------------------------ apply
function run(step) {
  const r = spawnSync(step.bin, step.args, { cwd: step.cwd || s0.root, encoding: 'utf8', shell: process.platform === 'win32' && step.bin === 'openspec' });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() || (r.error ? String(r.error.message) : '') };
}
function apply(p) {
  let done = 0;
  for (const [i, x] of p.steps.entries()) {
    process.stdout.write(`\n[${i + 1}/${p.steps.length}] ${x.repo}: ${x.label}\n`);
    const r = run(x);
    const lines = r.out.split(/\r?\n/).filter(l => l.trim());
    if (!r.ok) {
      console.log(lines.slice(-15).map(l => '    ' + l).join('\n'));
      console.log(`\nStopped: this step failed. Nothing after it ran. Fix the problem above, then run setup again: it continues from here.`);
      return { done, failed: x };
    }
    console.log(lines.filter(l => /^(Added|Updated|Removed|Kept|Skipped|Created|Upgraded|Home repo|  [+~?!-] |Schema import|  Code:|Note)/.test(l)).slice(0, 12).map(l => '    ' + l.trim()).join('\n') || '    done');
    done++;
  }
  console.log('\nChecks:');
  for (const ch of p.checks) {
    const t = path.join(ch.dir, '.ai-kit', 'context-tools.cjs');
    if (!exists(t)) continue;
    const r = spawnSync(process.execPath, [t, 'doctor', '--repo', ch.dir], { encoding: 'utf8' });
    const out = (r.stdout || '').split(/\r?\n/);
    const bad = out.filter(l => /^\s*(WARN|ERROR|FAIL)\b/.test(l));
    console.log(`  ${ch.repo}: ${(out.find(l => /Result:/.test(l)) || '').trim() || 'doctor ran'}`);
    bad.slice(0, 8).forEach(l => console.log('    ' + l.trim()));
  }
  return { done };
}

// ------------------------------------------------------------------ the terminal wizard
async function wizard(s) {
  const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question, def) => { const a = (await rl.question(`${question}${def !== undefined && def !== '' ? ` [${def}]` : ''}: `)).trim(); return a || (def ?? ''); };
  const yn = async (question, def) => /^y/i.test(await ask(`${question} (y/n)`, def ? 'y' : 'n'));
  printScan(s);
  if (!s.repos.length) { rl.close(); return; }
  const d = defaults(s);
  const c = { ...d };
  console.log('');
  const what = await ask('What do you want to do?  1) set up or update the kit  2) only check what is there', '1');
  if (what === '2') { rl.close(); for (const r of s.repos.filter(x => x.mode !== 'none')) { const dir = r.mode === 'member' ? path.join(s.root, r.workspace) : r.dir; const t = path.join(dir, '.ai-kit', 'context-tools.cjs'); if (exists(t)) { console.log(`\n== ${r.name}`); spawnSync(process.execPath, [t, 'doctor', '--repo', r.dir], { stdio: 'inherit' }); } } return; }
  c.setup = (await ask('Setup  1) one home repo for the product (recommended for several repos)  2) each repo on its own', d.setup === 'workspace' ? '1' : '2')) === '2' ? 'repo' : 'workspace';
  const others = s.repos.filter(r => r.mode !== 'home');
  others.forEach((r, i) => console.log(`  ${i + 1}) ${r.name}`));
  const pick = await ask('Which repos? numbers separated by commas, or "all"', 'all');
  c.repos = pick === 'all' ? others.map(r => r.name) : pick.split(',').map(x => others[Number(x.trim()) - 1]).filter(Boolean).map(r => r.name);
  if (c.setup === 'workspace') c.home = await ask('Home repo folder name', d.home);
  c.tools = (await ask('Agents your team uses (copilot, claude, codex; comma list)', d.tools.join(','))).split(',').map(t => t.trim()).filter(Boolean);
  c.productContext = await yn(c.setup === 'workspace' ? 'Write the product context (system map, flows across repos) after install?' : 'Create a product context hub as well?', d.productContext);
  if (c.setup === 'repo' && c.productContext) c.home = await ask('Hub folder name', 'product-context');
  const anyPipe = s.repos.some(r => c.repos.includes(r.name) && r.pipelines.length);
  const ciPick = await ask(`Pull request check  1) not now  2) I have my own pipeline: show me the step to add${anyPipe ? ' (pipelines found)' : ''}  3) add a separate Azure pipeline file  4) add a GitHub workflow`, '1');
  c.ci = { 1: 'none', 2: 'existing', 3: 'azure', 4: 'github' }[ciPick] || 'none';
  if (s.openspecCli) c.openspec = (await yn('Set up OpenSpec where it is missing?', false)) ? 'init' : 'skip';
  c.graphify = await yn('Prepare a Graphify code map?', false);
  if (s.repos.some(r => r.old)) c.upgrade = await yn('Upgrade repos that have an older kit?', true);
  c.org = (await ask('Organisation rules folder (Enter to skip)', '')) || null;
  c.source = (await ask('Where your team keeps the kit, a URL to record (Enter to skip)', '')) || null;
  const errs = validate(c, s);
  if (errs.length) { rl.close(); console.log(errs.map(e => '  ! ' + e).join('\n')); process.exitCode = 2; return; }
  const p = plan(s, c);
  printPlan(p);
  if (!p.steps.length) { rl.close(); return; }
  const go = await yn('\nRun these steps now?', true);
  rl.close();
  if (!go) { console.log('Nothing changed.'); return; }
  const res = apply(p);
  if (!res.failed) { console.log('\nNext:'); p.after.forEach(a => console.log(`  - ${a}`)); }
}

// ------------------------------------------------------------------ main
const root = path.resolve(opt('--root') || path.resolve(kitRepo, '..'));
const s0 = scan(root);
if (s0.error) { console.error(s0.error); process.exit(2); }
const json = flag('--json');
if (!cmd) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    try { await wizard(s0); } catch (e) { if (e && (e.code === 'ABORT_ERR' || e.name === 'AbortError')) { console.log('\nCancelled. Nothing changed.'); process.exitCode = 1; } else throw e; }
  }
  else { console.log('Run it in a terminal to be asked, or use: node kit/setup.mjs scan | plan | apply --yes (see the top of kit/setup.mjs).'); process.exitCode = 2; }
} else if (cmd === 'scan') {
  if (json) console.log(JSON.stringify({ ...s0, defaults: defaults(s0) }, null, 2)); else { printScan(s0); const d = defaults(s0); console.log(`\nSuggested: --setup ${d.setup}${d.setup === 'workspace' ? ` --home ${d.home}` : ''} --repos ${d.repos.join(',') || '(none)'} --tools ${d.tools.join(',')} --product-context ${d.productContext ? 'yes' : 'no'} --ci none`); }
} else if (cmd === 'plan' || cmd === 'apply') {
  const c = { ...defaults(s0), ...readChoices() };
  const errs = validate(c, s0);
  if (errs.length) { console.log(errs.map(e => '! ' + e).join('\n')); process.exit(2); }
  const p = plan(s0, c);
  if (cmd === 'plan') {
    if (json) console.log(JSON.stringify({ choices: c, steps: p.steps.map(x => ({ repo: x.repo, label: x.label, why: x.why, command: [x.bin === process.execPath ? 'node' : x.bin, ...x.args].join(' ') })), skipped: p.skipped, notes: p.notes, after: p.after }, null, 2));
    else printPlan(p);
  } else {
    if (!flag('--yes')) { printPlan(p); console.log('\nAdd --yes to run these steps.'); process.exitCode = 2; }
    else { printPlan(p); const r = apply(p); if (r.failed) process.exitCode = 1; else { console.log('\nNext:'); p.after.forEach(a => console.log(`  - ${a}`)); } }
  }
} else { console.log('Usage: node kit/setup.mjs [scan|plan|apply] [--root <folder>] [choices] (see the top of kit/setup.mjs)'); process.exitCode = 2; }
