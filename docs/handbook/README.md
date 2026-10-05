# Engineering Handbook Source

This directory contains the canonical handbook content. Edit the chapter Markdown, `manifest.json`, and theme sources; do not edit files under `site/` or generated PDFs.

For UI capture rules and the priority screenshot queue, see [FIGURE-CAPTURE-GUIDE.md](FIGURE-CAPTURE-GUIDE.md). The visible placeholder figures are intentional until approved synthetic-data captures replace them.

Build the browsable HTML handbook, dependency inventory, master PDF, and focused PDF volumes from the repository root:

```powershell
npm run docs:build
```

The generated site is written to `docs/handbook/site/`, including the npm inventory and SQLite schema catalog JSON. PDFs and `handbook-metrics.json` are written to `artifacts/documentation/`. Metrics record actual page/word/line counts, indexed source files, schema table/column counts, and remaining screenshot placeholders; the 200–300-page target is not considered met until the master PDF reaches it. Generated paths are ignored by Git and are published by the documentation workflow.

Technical claims use repository configuration and implementation as their evidence. Historical diaries provide context only. Production host details, credentials, signing keys, and VM sizing are intentionally not reproduced here.