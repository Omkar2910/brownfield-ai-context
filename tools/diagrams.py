"""Writes the SVG sources in docs/images/src/. Run it after changing a diagram here, then build-diagrams.py."""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'images' / 'src'
INK, QUIET, EDGE, ACCENT, ACCENT_BG, BAND = '#1f2328', '#57606a', '#8c959f', '#0969da', '#ddf4ff', '#f6f8fa'
FONT = "font-family='-apple-system, Segoe UI, Helvetica, Arial, sans-serif'"
ARROW = f"<defs><marker id='a' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'><path d='M0 0L10 5L0 10z' fill='{EDGE}'/></marker></defs>"


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def text(x, y, t, size=13, weight=400, fill=INK, anchor='start'):
    return f"<text x='{x}' y='{y}' font-size='{size}' font-weight='{weight}' fill='{fill}' text-anchor='{anchor}'>{esc(t)}</text>"


def box(x, y, w, h, main=False, fill=None):
    if main:
        return f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='8' fill='{ACCENT_BG}' stroke='{ACCENT}' stroke-width='2'/>"
    return f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='8' fill='{fill or '#fff'}' stroke='{EDGE}' stroke-width='1.25'/>"


def named(x, y, w, h, name, body=None, main=False, center=True, fill=None):
    cx = x + w / 2
    out = [box(x, y, w, h, main, fill)]
    if center:
        out.append(text(cx, y + (23 if body else h / 2 + 4.5), name, 13, 600, anchor='middle'))
        if body:
            out.append(text(cx, y + 43, body, 11.5, fill=INK if main else QUIET, anchor='middle'))
    return ''.join(out)


def line(d, arrow=True):
    return f"<path d='{d}' fill='none' stroke='{EDGE}' stroke-width='1.25'{' marker-end=\"url(#a)\"' if arrow else ''}/>"


def svg(name, w, h, title, body):
    s = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' width='{w}' height='{h}' {FONT}>{ARROW}<rect width='{w}' height='{h}' fill='#fff'/>{text(24, 32, title, 16, 600)}{body}</svg>\n"
    (OUT / f'{name}.svg').write_text(s)


def at_a_glance():
    b = []
    b.append(named(166, 52, 420, 56, 'People', 'approve the plan and the pull request · review the knowledge', main=True))
    b.append(named(226, 136, 300, 56, 'AI agent', 'GitHub Copilot · Claude Code · Codex'))
    b += [line('M376 108V134'), line('M376 192V208H136V222'), line('M376 208V222'), line('M376 208H616V222')]
    cols = [(24, 'Knowledge: what it reads', ['AGENTS.md: every chat', 'Rule files: by file type', 'Pages: when a task needs them', 'Table pages: what data means', 'Product pages: across repos']),
            (264, 'Workflow: how a story runs', ['/story-start: code + context', 'Plan: OpenSpec or plan.md', 'Fresh-eyes review of the plan', 'Person approves; tests first', '/story-finish: tests, context']),
            (504, 'Checks: keep it true', ['After each agent edit', 'When the agent finishes', 'At commit: missing files block', 'Pull request (optional)', 'Table pages vs schema'])]
    for x, name, lines in cols:
        b.append(box(x, 224, 224, 144))
        b.append(text(x + 16, 248, name, 13, 600))
        for i, l in enumerate(lines):
            b.append(text(x + 16, 272 + 20 * i, l, 11.5))
    for x, n, t in [(24, 'OpenSpec (optional)', 'story plans and specs'), (264, 'Graphify (optional)', 'code map, rebuilt locally'), (504, 'Your pipeline (optional)', 'pull request check')]:
        b.append(named(x, 400, 224, 56, n, t))
    for cx in (136, 376, 616):
        b += [line(f'M{cx} 368V398'), line(f'M{cx} 456V486', False)]
    b.append(box(24, 488, 704, 48, fill=BAND))
    b.append(text(376, 516, 'Your repos: code plus the knowledge as plain files; one home repo holds the tools and product pages', 12, anchor='middle'))
    svg('architecture-at-a-glance', 760, 560, 'People direct the agent; the kit gives it memory and checks its work', ''.join(b))


def when_it_runs():
    rows = [('In the chat', [('Chat starts', 'A short note: kit health, pages out of date', 'Agent'),
                             ('After each agent edit', 'Names the lines anchored to the file it just edited', 'Agent'),
                             ('Agent says it is done', 'Asks once: are the lines anchored to your edits still true?', 'Agent')]),
            ('In git', [('Commit', 'Blocks only knowledge pointing at a missing file; warns about the rest', 'Developer'),
                        ('Pull request (optional)', 'The same check, whoever or whatever wrote the code', 'Reviewer')]),
            ('In the story', [('/story-finish', 'Every scenario has a test; pages for changed files still true', 'Agent + reviewer'),
                              ('/opsx-archive', 'The story’s specs merge into the permanent specs', 'Developer')])]
    b, y, n = [], 60, 0
    for group, items in rows:
        h = 52 * len(items) + 16
        b.append(f"<rect x='24' y='{y}' width='712' height='{h}' rx='8' fill='{BAND}' stroke='none'/>")
        b.append(text(40, y + 24, group, 12, 600, QUIET))
        for i, (moment, what, who) in enumerate(items):
            n += 1
            ry = y + 8 + 52 * i
            b.append(box(144, ry, 592, 44))
            b.append(f"<circle cx='168' cy='{ry + 22}' r='11' fill='{ACCENT}'/>")
            b.append(text(168, ry + 26.5, str(n), 12, 600, '#fff', 'middle'))
            b.append(text(190, ry + 19, moment, 13, 600))
            b.append(text(720, ry + 19, who, 11.5, fill=QUIET, anchor='end'))
            b.append(text(190, ry + 36, what, 11.5))
        y += h + 12
    b.append(text(24, y + 14, 'Every check calls the same context tool, so each rule is defined once. It knows which file changed, not what changed in it.', 11.5, fill=QUIET))
    svg('architecture-when-it-runs', 760, y + 36, 'The kit checks knowledge at seven moments; only one of them blocks', ''.join(b))


def story_flow():
    steps = [('1. /story-start', 'work item, code, context', False), ('2. Plan', 'OpenSpec or plan.md', False),
             ('3. Fresh-eyes review', 'design reviewer agent', False), ('4. Person approves', 'the plan, before any code', True),
             ('5. Build', 'test first, then code', False), ('6. /story-finish', 'tests, context, PR text', False),
             ('7. Pull request', 'a person reviews, merges', True), ('8. Archive', 'specs updated', False)]
    b, w, gap = [], 160, 24
    xs = [24 + i * (w + gap) for i in range(4)]
    for i, (n, t, main) in enumerate(steps):
        row, col = divmod(i, 4)
        x = xs[col] if row == 0 else xs[3 - col]
        y = 60 if row == 0 else 172
        b.append(named(x, y, w, 56, n, t, main))
        if i < 3:
            b.append(line(f'M{x + w} 88H{x + w + gap - 2}'))
        elif i == 3:
            b.append(line(f'M{x + w / 2} 116V170'))
        elif i < 7:
            b.append(line(f'M{x} 200H{x - gap + 2}'))
    b.append(text(24, 264, 'Tiny fixes skip steps 2 to 4: a failing test, the fix, /story-finish. Without OpenSpec, step 2 is one plan.md and step 8 does not exist.', 11.5, fill=QUIET))
    b.append(text(24, 284, 'The developer commits, pushes and opens the pull request; the agent never pushes or merges.', 11.5, fill=QUIET))
    svg('story-flow', 760, 304, 'People approve the plan and the code; the agent does the rest', ''.join(b))


def many_repos():
    b = [named(230, 52, 300, 56, 'Your agent', 'Copilot · Claude Code · Codex')]
    b += [line('M300 108V134H188V158'), line('M460 108V134H572V146')]
    b.append(text(244, 127, 'skills, hooks', 11.5, fill=QUIET, anchor='middle'))
    b.append(text(516, 127, 'reads knowledge', 11.5, fill=QUIET, anchor='middle'))
    b.append(box(24, 160, 328, 196, main=True))
    b.append(text(40, 186, 'Home repo: product-context', 13, 600))
    for i, l in enumerate(['Skills and helper agents (once)', 'Hooks and the context tool', 'Commit check: .githooks/', 'catalog.json: who calls whom', 'Flows across repos, step by step', 'Platform rules, glossary']):
        b.append(text(40, 214 + 24 * i, l))
    b.append(f"<path d='M420 160V148H736V344H724' fill='none' stroke='{EDGE}'/><path d='M414 160V154H730V350H724' fill='none' stroke='{EDGE}'/>")
    b.append(box(408, 160, 316, 196))
    b.append(text(424, 186, 'Each code repo: service, UI, library', 13, 600))
    for i, l in enumerate(['AGENTS.md: read in every chat', 'Rule files, loaded by file type', 'docs/context/: its pages, its tables', 'Its business rules and traps', 'openspec/: one folder per story', '.ai-kit/kit.json: a small stamp']):
        b.append(text(424, 214 + 24 * i, l))
    b += [line('M188 356V394'), line('M572 356V394'), line('M440 424H380V262H354')]
    b.append(text(198, 380, 'pipeline runs the home tool', 11.5, fill=QUIET))
    b.append(text(582, 380, 'you commit', 11.5, fill=QUIET))
    b.append(named(64, 396, 248, 56, 'Pull request check', 'optional · home repo + code repo'))
    b.append(named(440, 396, 264, 56, 'git commit in a code repo', 'runs the home repo commit check'))
    b.append(text(24, 484, 'One team can change it in one pull request: it lives in that repo. Two repos must agree: it lives in the home repo.', 11.5, fill=QUIET))
    b.append(text(24, 502, 'Product pages link down to repo pages and never copy them.', 11.5, fill=QUIET))
    svg('architecture-many-repos', 760, 524, 'Tools live once in the home repo; knowledge lives in each code repo', ''.join(b))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    at_a_glance(); when_it_runs(); story_flow(); many_repos()
    print('svg written to', OUT)
