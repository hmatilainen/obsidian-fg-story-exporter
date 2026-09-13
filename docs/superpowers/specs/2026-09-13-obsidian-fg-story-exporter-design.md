# Obsidian → Fantasy Grounds Story Exporter — Design

**Date:** 2026-09-13
**Status:** Approved for planning
**Type:** New Obsidian plugin (TypeScript)

## Problem

Writing session/story content directly in Fantasy Grounds' Story editor is
tedious. The user would rather write in Obsidian (their existing tool for
this) and get that content into Fantasy Grounds without retyping it.

## Goal

An Obsidian plugin: right-click a folder → "Export to Fantasy Grounds" →
the folder's notes become a Fantasy Grounds **library module** (a `.mod`
file) containing a Story book (chapters/subchapters/pages), including any
locally-embedded images. Re-exporting the same folder updates that same
module in place — never duplicates.

## Requirements

1. Right-click any folder in the Obsidian file tree → "Export to Fantasy
   Grounds" command.
2. Folder structure maps to FG's Story hierarchy: folder → chapter,
   subfolder → subchapter, note (`.md`) → page.
3. Markdown → FG page content (see translation table below): paragraphs,
   bold/italic, lists, headings-as-block-headers, `[[wikilinks]]` to other
   exported notes, embedded local images.
4. Locally embedded images are packaged into the module and shown as
   in-page picture blocks.
5. Output is one `.mod` file, named after the exported folder, written to
   the Fantasy Grounds `modules/` folder (path set once in plugin
   settings).
6. Re-exporting the same folder overwrites that same `.mod` file. Because
   the module is fully rebuilt from the folder's current contents every
   time, there is never a duplicate-page problem to solve — the whole
   file is replaced.
7. The plugin never writes to any file inside the Obsidian vault. Fully
   read-only there.
8. Links (both `[[wikilink]]`-to-page and image-in-page) must resolve
   correctly on every export, including after a note is renamed.

### Non-requirements (YAGNI)

- No live/automatic sync — export is a manual, explicit action.
- No writing into a live campaign's `db.xml` (see Approach).
- No creation or modification of real interactive FG maps (grid/token/
  fog-of-war "Image" records) — those stay entirely GM-managed inside FG.
  The plugin only ever produces simple in-page picture blocks from
  plain embedded images.
- No clickable "view map in popup" text links (FG's separate
  `reference.imagedata` / `imagewindow` link mechanism, used by things
  like NPC/spell reference entries) — out of scope; an embedded image
  becomes a picture shown directly on the page, not a separate pop-up
  link. Real interactive maps continue to be linked from FG by hand, as
  the user anticipated.
- No frontmatter mutation, no stamped IDs (see Identity, below).
- No settings beyond the one FG `modules/` folder path.
- No configurable ordering, templates, or per-note overrides in v1.

## Approach

**A standalone Obsidian plugin that writes a `.mod` library module
directly to disk.** Runs entirely inside Obsidian's desktop (Electron/
Node) context — real filesystem and zip access, no sandbox fight. No
connection to a running Fantasy Grounds instance is needed at any point;
the module is picked up next time the campaign (re)loads it, the same
"local files, no live channel" pattern used successfully in the
`fg-save-session-chatlog` extension.

Two alternatives were considered and rejected:

- **Piggyback on the existing "Module Maker" FG extension** (writes its
  own M3L markdown, imported via a button inside FG). Rejected: still two
  manual steps per export (write M3L, then click import in FG), couples
  the feature to a paid third-party extension of unverified depth, and
  we now have the real schema anyway.
- **Write directly into the live campaign's `db.xml`.** Rejected: FG owns
  and autosaves that file while running; editing it externally risks
  corruption or being silently overwritten. It also abandons the clean
  "Obsidian is the source of truth, rebuild anytime" model in favor of
  mutating live campaign state.

## Fantasy Grounds module format (verified against real files)

Confirmed by unpacking `calendars.mod` (SmiteWorks) and
`DPDHCSQuickStart.mod` (a real Story-using module) from the user's own
`~/.smiteworks/fgdata/modules/` — not guessed from documentation.

A `.mod` is a zip:

```
<Name>.mod
├── definition.xml
├── db.xml
├── thumbnail.png            (optional)
└── images/…                 (any relative path; referenced from db.xml)
```

`definition.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<root version="2.9">
	<name>MyFolder</name>
	<author>Obsidian FG Story Exporter</author>
	<ruleset>Any</ruleset>
</root>
```

`db.xml` — the Story book lives under a top-level `<reference>` category:

```xml
<root version="5.1">
	<reference>
		<refmanualdata>
			<id-00001>
				<name type="string">Page Title</name>
				<blocks>
					<id-00001>
						<blocktype type="string">singletext</blocktype>
						<order type="number">1</order>
						<text type="formattedtext">
							<p>A paragraph.</p>
							<list><li>A bullet.</li></list>
						</text>
					</id-00001>
					<id-00002>
						<blocktype type="string">header</blocktype>
						<order type="number">2</order>
						<text type="string">A Sub-Heading</text>
					</id-00002>
					<id-00003>
						<blocktype type="string">image</blocktype>
						<order type="number">3</order>
						<scale type="number">60</scale>
						<image type="image">
							<layers>
								<layer>
									<name>map.png</name>
									<id>0</id>
									<parentid>-1</parentid>
									<type>image</type>
									<bitmap>images/map.png</bitmap>
								</layer>
							</layers>
						</image>
					</id-00003>
				</blocks>
			</id-00001>
		</refmanualdata>
		<refmanualindex>
			<chapters>
				<id-00001>
					<name type="string">Chapter (folder)</name>
					<order type="number">1</order>
					<subchapters>
						<id-00001>
							<name type="string">Subchapter (subfolder)</name>
							<order type="number">1</order>
							<refpages>
								<id-00001>
									<name type="string">Page Title</name>
									<order type="number">1</order>
									<listlink type="windowreference">
										<class>story_book_page_advanced</class>
										<recordname>reference.refmanualdata.id-00001</recordname>
									</listlink>
								</id-00001>
							</refpages>
						</id-00001>
					</subchapters>
				</id-00001>
			</chapters>
		</refmanualindex>
	</reference>
</root>
```

Key findings this rests on:

- **Image blocks are plain relative file paths** (`<bitmap>images/map.png
  </bitmap>`), not a separate DB record. This is simpler than first
  assumed during brainstorming — no `reference.imagedata` layer is
  needed for "picture embedded in a page."
- **`recordname` inside the module needs no `@ModuleName` suffix** — that
  suffix only appears in *cross-module* references (seen in real data
  pointing at other purchased modules). A self-contained module's own
  internal links are bare category paths, e.g.
  `reference.refmanualdata.id-00001`.
- Real data confirms `<list><li>…</li></list>` for bullet lists, `<h>…
  </h>` for an inline sub-heading inside a text block, and a
  `blocktype=header` block for a page-level section break — all pulled
  from `DPDHCSQuickStart.mod`, not guessed.
- **Open item to verify while implementing:** every chapter observed in
  the real module has at least one subchapter — pages may always need to
  sit inside a subchapter (not directly under a chapter). If so, a
  top-level export folder with notes directly in it (no subfolder) gets
  an implicit single subchapter to hold them. Confirm with a minimal
  test export loaded into FG before relying on the alternative.

## Markdown → FG translation (v1 scope)

| Markdown | FG |
|---|---|
| Paragraph | `<p>` inside a `singletext` block |
| **bold**, *italic* | `<b>`, `<i>` |
| Bullet/numbered list | `<list><li>…</li></list>` |
| H2/H3 heading | new `blocktype=header` block (page-level section break) |
| `[[Other Note]]` (note is in this export) | `<link class="referencemanualpage" recordname="reference.refmanualdata.<key>">` |
| `[[Other Note]]` (note is outside this export) | plain text, link syntax stripped; counted in the export summary |
| `![[image.png]]` / `![](image.png)` (local file) | new `image` block, file copied into the module |
| Anything else (tables, callouts, code blocks, footnotes, other plugins' syntax) | markup stripped, kept as plain text — never aborts the export. Not separately counted in the export summary in v1 (unlike degraded links/skipped images, which are); a future version could add that. |

## Identity: path-derived keys, no vault mutation

Considered and rejected: stamping a UUID into each note's frontmatter on
first export. Rejected because it solves a problem the rebuild-from-
scratch model doesn't actually have:

- **Duplicate pages across exports** can't happen regardless of ID
  scheme — every export fully replaces the module file, it never
  appends to a previous one.
- **Links from a page to another page/image *within the same export*
  survive automatically** — both ends are computed together in the same
  run, using whichever key scheme is used, so they're self-consistent by
  construction. This includes surviving a note rename, because Obsidian
  already keeps `[[wikilinks]]` pointing at the renamed target itself
  (its own link-integrity feature), and the key is recomputed fresh from
  the current path at export time either way.
- The **only** thing a stamped ID would protect is a link created
  *outside* this export — e.g. by hand, from the live campaign's own
  Story notes, into a specific page inside this module — surviving a
  later re-export that happens to change that page's key. Nothing in the
  stated requirements calls for that, so it's dropped for v1. (If it
  turns out to matter, it's a contained addition later: derive the key
  from a stamped ID instead of from the path.)

**v1 key derivation:** each page's `id-NNNNN` and its `reference.
refmanualindex` counterpart are assigned by walking the folder tree in a
fixed, deterministic order (chapters/subchapters alphabetical by folder
name, pages alphabetical by filename) and numbering sequentially — the
same convention real FG modules use, confirmed above. Cross-references
(`[[wikilinks]]`, image blocks) are resolved against this same in-memory
map, built fresh on every export run. (An earlier version of this design,
discussed but not adopted, derived each key from the note's sanitized
vault path instead — functionally equivalent for every guarantee this
spec makes, but it adds path-sanitization edge cases — unicode names,
collisions after sanitizing — for no benefit over plain sequential
numbering, so it was dropped in favor of the simpler scheme.)

## Settings

One setting: the path to Fantasy Grounds' `modules/` folder (a folder
picker in the plugin's settings tab). No default guessed — it differs by
OS and install location; the user points it out once.

## Error handling

| Situation | Behaviour |
|---|---|
| Modules-folder path not set | Export blocked, points at Settings |
| Empty note | Skipped; counted in the export summary |
| Broken/missing local image embed | That image block skipped, warning logged, export continues |
| `[[wikilink]]` to a note outside the exported folder | Degrades to plain text, counted in summary |
| Unsupported Markdown syntax | Degrades to plain text. Not separately counted in v1's summary. |
| Non-`.md`, non-image file in the folder | Ignored |
| Re-export of the same folder | Always overwrites `<FolderName>.mod` — this *is* the update mechanism |

## Testing

- Unit tests (Vitest, no Obsidian or FG runtime needed) for the pure
  parts: folder-tree walking, Markdown→block translation, wikilink/image
  resolution, key assignment. Same pure-logic/platform-glue split that
  worked well for the `fg-save-session-chatlog` extension.
- The zip assembly and Obsidian-API glue are thin and verified manually:
  build a small test vault (a folder, a subfolder, a couple of notes with
  bold/italic/lists/headings, a `[[wikilink]]` between two of them, one
  local image embed), export, load the resulting `.mod` in a real FG
  campaign's Library, and confirm: chapter/subchapter/page nesting,
  formatting, the cross-page link, and the image block all render
  correctly — including the subchapter-nesting open item above.
- Re-export after renaming one of the linked notes; confirm the link
  still resolves.

## Rejected alternatives

(See Approach, above, for Module Maker and live-`db.xml`-editing.)

- **Stamped frontmatter ID for cross-export stability** — see Identity,
  above.
- **Export images to the campaign's own `images/` folder instead of
  packaging them in the module** — considered when discussing map links;
  not needed, since module-internal links (page→image) are already
  self-consistent by construction (see Identity). The real distinction
  that matters is different: a plain embedded picture (safe to package
  and regenerate) versus an actual interactive FG map with grid/tokens/
  fog-of-war (a live campaign object with its own state — never touched
  by this plugin, confirmed by inspecting a real one in the user's
  campaign: `<image>` record for `Gnomevillage.jpg`, full grid/layer/
  pointer data, file living in `campaign/images/`).
