"""Render docs/images/src/*.svg to docs/images/*.png (2x) with Playwright. Edit the SVG, then run this."""
import pathlib, sys
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'docs' / 'images' / 'src'
with sync_playwright() as p:
    b = p.chromium.launch()
    for svg in sorted(src.glob('*.svg')):
        text = svg.read_text()
        import re
        w, h = map(float, re.search(r"viewBox='0 0 ([\d.]+) ([\d.]+)'", text).groups())
        page = b.new_page(viewport={'width': int(w), 'height': int(h)}, device_scale_factor=2)
        page.set_content(f"<html><body style='margin:0;background:#fff'>{text}</body></html>")
        out = root / 'docs' / 'images' / (svg.stem + '.png')
        page.screenshot(path=str(out), clip={'x': 0, 'y': 0, 'width': w, 'height': h})
        print('wrote', out.relative_to(root))
    b.close()
