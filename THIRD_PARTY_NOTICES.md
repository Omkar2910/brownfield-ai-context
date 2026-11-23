# Third-party notices

## OpenSpec

Kit versions up to 2.0 included a workflow schema adapted from OpenSpec's "spec-driven" schema
(https://github.com/Fission-AI/OpenSpec). From 2.1 the kit no longer ships it and uses OpenSpec's own
default workflow; the licence is kept here for those earlier versions:

```
MIT License

Copyright (c) 2024 OpenSpec Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

## Tools used but not included

OpenSpec (MIT), Graphify (Apache-2.0) and tbls (MIT) are installed separately by each user; this
repository contains configuration for them, or reads their output files, not their code.

## Formats and ideas followed (no code copied)

- **Open Knowledge Format** (OKF v0.3, https://github.com/open-knowledge-format/open-knowledge-format):
  the page frontmatter fields `type`, `status`, `verified` and `generated` follow its definitions.
- **Elephant-Goldfish Model** (Google, Apache-2.0, https://github.com/google/elephant-goldfish-model): the
  idea of a reviewer that starts with no memory of the design conversation. The `design-reviewer` agent
  is the kit's own text.
- **AGENTS.md**, **Agent Skills (`SKILL.md`)** and the **Model Context Protocol**: public formats the kit's
  files and its MCP server follow.
