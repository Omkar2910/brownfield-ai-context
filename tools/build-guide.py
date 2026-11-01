#!/usr/bin/env python3
"""Builds docs/index.html (the web version of GUIDE.md).

Usage:  pip install markdown   then   python tools/build-guide.py
Edit GUIDE.md, never docs/index.html directly.
"""
import re
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "GUIDE.md").read_text(encoding="utf-8")

md = markdown.Markdown(
    extensions=["tables", "fenced_code", "toc", "sane_lists", "attr_list"],
    extension_configs={"toc": {"toc_depth": "2-2", "permalink": False}},
)
body = md.convert(src)
toc = md.toc

# The first <h1> becomes the page header; the TOC keeps only level-2 headings.
title_match = re.search(r"<h1[^>]*>(.*?)</h1>", body)
title = re.sub(r"<[^>]+>", "", title_match.group(1)) if title_match else "Guide"
body = body.replace(title_match.group(0), "", 1) if title_match else body

# Task lists: "[ ] item" -> checkbox the reader can tick (not saved).
body = re.sub(r"<li>\[ \]\s*", '<li class="task"><input type="checkbox" aria-label="done"> ', body)
# Wide tables and code scroll inside their own box.
body = body.replace("<table>", '<div class="tablebox"><table>').replace("</table>", "</table></div>")
body = re.sub(r"<pre><code([^>]*)>", r'<div class="code"><button type="button" class="copy">Copy</button><pre><code\1>', body)
body = body.replace("</code></pre>", "</code></pre></div>")
# Links to repo files open on GitHub-relative paths.
body = body.replace('href="docs/', 'href="').replace('href="templates/', 'href="../templates/')

fragment = (ROOT / "tools" / "guide-template.html").read_text(encoding="utf-8")
fragment = fragment.replace("{{TITLE}}", title).replace("{{TOC}}", toc).replace("{{BODY}}", body)

# Full document for opening in a browser or GitHub Pages.
page = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<style>body{margin:0}</style>\n</head>\n<body>\n' + fragment + '\n</body>\n</html>\n'
)
(ROOT / "docs" / "index.html").write_text(page, encoding="utf-8")
print("wrote docs/index.html")

import sys
if "--fragment" in sys.argv:  # body-only version, used to preview the page elsewhere
    out = Path(sys.argv[sys.argv.index("--fragment") + 1])
    out.write_text(fragment, encoding="utf-8")
    print(f"wrote {out}")
