#!/usr/bin/env python3
"""Builds the web versions of the guides.

  GUIDE.md          -> docs/index.html
  CONTEXT-GUIDE.md  -> docs/context.html
  TOOLBOX.md        -> docs/toolbox.html
  MULTI-REPO.md     -> docs/multi-repo.html

Usage:  pip install markdown   then   python tools/build-guide.py
Edit the .md files, never the .html files directly.
Optional: --fragment-dir <dir> also writes body-only versions (for previewing elsewhere).
"""
import re
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
PAGES = [
    ("GUIDE.md", "index.html", "Brownfield Story Guide", "Setup and story workflow"),
    ("CONTEXT-GUIDE.md", "context.html", "AI Context Guide", "Creating, using and maintaining context"),
    ("TOOLBOX.md", "toolbox.html", "Workflow Toolbox", "Workflow and toolbox"),
    ("MULTI-REPO.md", "multi-repo.html", "Many-Repo Setup", "Many repos"),
]
TEMPLATE = (ROOT / "tools" / "guide-template.html").read_text(encoding="utf-8")
LINKS = {"GUIDE.md": "index.html", "CONTEXT-GUIDE.md": "context.html", "TOOLBOX.md": "toolbox.html", "MULTI-REPO.md": "multi-repo.html"}


def build(src_name, out_name, page_title, other_label):
    md = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "sane_lists", "attr_list"],
        extension_configs={"toc": {"toc_depth": "2-2", "permalink": False}},
    )
    body = md.convert((ROOT / src_name).read_text(encoding="utf-8"))
    toc = md.toc

    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", body)
    title = re.sub(r"<[^>]+>", "", h1.group(1)) if h1 else page_title
    if h1:
        body = body.replace(h1.group(0), "", 1)

    body = re.sub(r"<li>\[ \]\s*", '<li class="task"><input type="checkbox" aria-label="done"> ', body)
    body = body.replace("<table>", '<div class="tablebox"><table>').replace("</table>", "</table></div>")
    body = re.sub(r"<pre><code([^>]*)>", r'<div class="code"><button type="button" class="copy">Copy</button><pre><code\1>', body)
    body = body.replace("</code></pre>", "</code></pre></div>")
    # Links between the two guides point at the web versions; other repo links go up one level.
    for md_name, html_name in LINKS.items():
        body = body.replace(f'href="{md_name}', f'href="{html_name}')
    body = body.replace('href="docs/', 'href="').replace('href="templates/', 'href="../templates/')

    nav = " ".join(f'<a class="other" href="{p[1]}">{p[3]} →</a>' for p in PAGES if p[1] != out_name)
    fragment = (TEMPLATE.replace("{{PAGE_TITLE}}", page_title).replace("{{TITLE}}", title)
                .replace("{{TOC}}", toc).replace("{{BODY}}", body).replace("{{OTHER}}", nav))
    page = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>body{margin:0}</style>\n</head>\n<body>\n' + fragment + '\n</body>\n</html>\n'
    )
    (ROOT / "docs" / out_name).write_text(page, encoding="utf-8")
    print(f"wrote docs/{out_name}")
    if "--fragment-dir" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--fragment-dir") + 1]) / out_name
        out.write_text(fragment, encoding="utf-8")
        print(f"wrote {out}")


for page in PAGES:
    build(*page)
