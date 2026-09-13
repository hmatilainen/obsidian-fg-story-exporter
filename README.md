# Obsidian → Fantasy Grounds Story Exporter

## What it does

Right-click any folder in Obsidian → select "Export to Fantasy Grounds" → that folder's notes are packaged into a Fantasy Grounds library module (`.mod` file) containing a Story book with chapters (folders), subchapters (subfolders), and pages (notes). Locally embedded images are packaged into the module and rendered as in-page picture blocks. [[Wikilinks]] between notes in the same export are resolved as cross-page links within the module. Re-exporting the same folder overwrites the module file in place — that's how you update it.

## Install

1. Copy `manifest.json` and `main.js` (after building via `npm run build`) into:
   ```
   <your-vault>/.obsidian/plugins/fg-story-exporter/
   ```

2. Open Obsidian and go to Settings → Community Plugins.

3. Enable "FG Story Exporter" in the list.

4. Click the plugin's settings icon and enter the path to your Fantasy Grounds `modules/` folder (e.g., `~/.smiteworks/fgdata/modules/`).

## Usage

Right-click any folder in Obsidian's file tree → select "Export to Fantasy Grounds". The plugin creates (or overwrites) a `.mod` file named after the folder in your configured modules folder. Load the module in Fantasy Grounds by reloading or opening a campaign.

## Markdown support

This plugin translates a subset of Markdown into Fantasy Grounds story blocks:

| Markdown | Result |
|---|---|
| Paragraphs | Text blocks |
| **bold**, *italic* | Rich text formatting |
| Bullet/numbered lists | List blocks |
| H2/H3 headings | Section-break header blocks (page-level dividers) |
| `[[Other Note]]` (in the export) | Cross-page link within the module |
| `[[Other Note]]` (outside the export) | Plain text; link syntax stripped |
| `![[image.png]]` or `![](image.png)` (local file) | Embedded image block, packaged into the module |
| Anything else (tables, callouts, code blocks, etc.) | Plain text; markup stripped but content preserved |

For the full translation table and details, see [the design spec](docs/superpowers/specs/2026-09-13-obsidian-fg-story-exporter-design.md#markdown--fg-translation-v1-scope).

## Known v1 limitations

- **Folder nesting**: Only two levels deep (folders → subfolders). Deeper nesting collapses into the second level.
- **No live sync**: Export is a manual action. Changes in Obsidian require re-exporting to update the module.
- **Interactive maps**: The plugin only packages plain embedded images as picture blocks. Real interactive Fantasy Grounds maps (with grids, tokens, fog-of-war) are never created or modified by this plugin. Linking to those maps from within the module must be done manually in Fantasy Grounds.

## Development

```bash
npm install
npm run build
npm test
```

- **build**: Bundles the plugin into `main.js` using esbuild.
- **test**: Runs the Vitest unit-test suite (tests the Markdown translation and folder-tree logic).
