# Obsidian → Fantasy Grounds Story Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Obsidian plugin whose "Export to Fantasy Grounds" folder-context-menu command turns a folder of notes into a Fantasy Grounds Story library module (`.mod` file), including embedded local images and cross-note links, safely re-exportable without duplicating content.

**Architecture:** A pure translation pipeline (folder tree → key assignment → Markdown parsing → link/image resolution → XML string building → in-memory zip) that touches nothing but plain data, wrapped in a thin Obsidian-API orchestrator that supplies real vault content and writes the final file. The pure/impure split mirrors what worked well in the `fg-save-session-chatlog` project: almost everything is unit-testable with a stock test runner, and only the orchestrator needs manual, in-app verification.

**Tech Stack:** TypeScript, esbuild (bundling), Vitest (unit tests), JSZip (module packaging), the `obsidian` npm package for API types.

**Spec:** `docs/superpowers/specs/2026-09-13-obsidian-fg-story-exporter-design.md`

## Global Constraints

- Folder → chapter, subfolder → subchapter, note → page. Folders nested more than two levels deep collapse into that second-level subchapter (documented v1 limitation).
- The plugin never writes into the Obsidian vault. All identity is derived from current vault paths at export time — no frontmatter stamping.
- One `.mod` file per exported folder, named after that folder, always fully rebuilt (never incrementally patched) and overwritten on re-export.
- `db.xml` root category is `<reference>`; pages live in a **flat, module-global** `refmanualdata` collection (`id-00001, id-00002, …` incrementing across the whole module); the nav tree's `refmanualindex > chapters > … > subchapters > … > refpages` collection uses `id-NNNNN` keys that **restart at 1 within each subchapter** — these are two different ID spaces, verified against a real module (`DPDHCSQuickStart.mod`).
- Image blocks reference a plain relative file path (`<bitmap>images/img-00001.png</bitmap>`) — no DB record layer, no `reference.imagedata`.
- Internal `recordname` references (page-to-page links) carry no `@ModuleName` suffix — that suffix is only for cross-module references.
- Markdown scope for v1: paragraphs, **bold**/*italic*, bullet/numbered lists, H2/H3 headings (→ a new `header` block), `[[wikilinks]]` (resolved if the target is in this export, else degraded to plain text), local image embeds (`![[x]]` / `![](x)`) on their own line (packaged; if unresolvable, that block is dropped). Anything else degrades to plain text. Nothing aborts the export.
- One plugin setting: the path to Fantasy Grounds' `modules/` folder.
- `isDesktopOnly: true` (needs real filesystem + zip access).

---

## File Structure

```
obsidian-fg-story-exporter/
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── vitest.config.ts
├── src/
│   ├── main.ts                     Plugin entry, command registration
│   ├── settings.ts                 Settings interface + settings tab UI
│   └── exporter/
│       ├── bookTree.ts             folder paths -> chapter/subchapter/page tree
│       ├── keyAssigner.ts          tree -> id-NNNNN keys (both ID spaces)
│       ├── markdownInline.ts       one line of Markdown -> InlineSpan[]
│       ├── markdownBlocks.ts       a note's body -> ParsedBlock[]
│       ├── blockResolver.ts        ParsedBlock[] + link/image lookups -> ResolvedBlock[]
│       ├── xmlBuilders.ts          indexed tree + resolved pages -> db.xml / definition.xml strings
│       ├── moduleZip.ts            those strings + image bytes -> a .mod file's bytes (JSZip)
│       └── exportOrchestrator.ts   Obsidian API glue tying the above together
└── test/
    ├── bookTree.test.ts
    ├── keyAssigner.test.ts
    ├── markdownInline.test.ts
    ├── markdownBlocks.test.ts
    ├── blockResolver.test.ts
    ├── xmlBuilders.test.ts
    └── moduleZip.test.ts
```

Everything under `src/exporter/` except `exportOrchestrator.ts` is pure (no Obsidian API, no filesystem) and has a matching test file. `main.ts`, `settings.ts`, and `exportOrchestrator.ts` are thin glue, verified manually per Task 13.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `vitest.config.ts`, `.gitignore` (extend existing)
- Create: `src/main.ts` (stub)
- Create: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable, testable empty plugin. `npm run build` produces `main.js`; `npm test` runs Vitest.

- [ ] **Step 1: Write package.json**

```json
{
	"name": "obsidian-fg-story-exporter",
	"version": "0.1.0",
	"private": true,
	"scripts": {
		"build": "node esbuild.config.mjs production",
		"dev": "node esbuild.config.mjs",
		"test": "vitest run"
	},
	"devDependencies": {
		"@types/node": "^22.0.0",
		"esbuild": "^0.24.0",
		"obsidian": "^1.7.2",
		"typescript": "^5.6.0",
		"vitest": "^2.1.0"
	},
	"dependencies": {
		"jszip": "^3.10.1"
	}
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
	"compilerOptions": {
		"baseUrl": ".",
		"inlineSourceMap": true,
		"inlineSources": true,
		"module": "ESNext",
		"target": "ES2020",
		"allowJs": true,
		"noImplicitAny": true,
		"moduleResolution": "node",
		"importHelpers": true,
		"isolatedModules": true,
		"strict": true,
		"lib": ["DOM", "ES2020"]
	},
	"include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write esbuild.config.mjs**

```js
import esbuild from "esbuild";
import process from "process";

const production = process.argv[2] === "production";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", "@electron/remote"],
	format: "cjs",
	target: "es2020",
	platform: "node",
	outfile: "main.js",
	sourcemap: production ? false : "inline",
	minify: production,
});

if (production) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
```

- [ ] **Step 4: Write manifest.json**

```json
{
	"id": "fg-story-exporter",
	"name": "Fantasy Grounds Story Exporter",
	"version": "0.1.0",
	"minAppVersion": "1.4.0",
	"description": "Export a folder of notes as a Fantasy Grounds Story library module.",
	"author": "hannu@kuura.art",
	"isDesktopOnly": true
}
```

- [ ] **Step 5: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
	},
});
```

- [ ] **Step 6: Extend .gitignore**

Append to the existing `.gitignore`:

```
node_modules/
main.js
*.mod
```

- [ ] **Step 7: Write the plugin stub**

`src/main.ts`:

```ts
import { Plugin } from "obsidian";

export default class FgStoryExporterPlugin extends Plugin {
	async onload() {
		console.log("FG Story Exporter loaded");
	}
}
```

- [ ] **Step 8: Write the smoke test**

`test/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
	it("test runner works", () => {
		expect(1 + 1).toBe(2);
	});
});
```

- [ ] **Step 9: Install dependencies**

```bash
npm install
```

Expected: completes without error, creates `node_modules/` and `package-lock.json`. If a pinned version fails to resolve, relax that one package's version range and retry — not a blocker.

- [ ] **Step 10: Verify build and tests**

```bash
npm run build
npm test
```

Expected: `main.js` is created; `1 passed` from Vitest.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: project scaffold (esbuild + vitest + plugin stub)"
```

---

## Task 2: bookTree — folder paths to chapter/subchapter/page tree

**Files:**
- Create: `src/exporter/bookTree.ts`
- Test: `test/bookTree.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildBookTree(rootName: string, relPaths: string[]): BookTree`, and the types `PageNode { relPath: string; title: string }`, `SubchapterNode { name: string; pages: PageNode[] }`, `ChapterNode { name: string; subchapters: SubchapterNode[] }`, `BookTree { chapters: ChapterNode[] }`.

- [ ] **Step 1: Write the failing tests**

`test/bookTree.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBookTree } from "../src/exporter/bookTree";

describe("buildBookTree", () => {
	it("places a root-level note in an implicit chapter/subchapter named after the root", () => {
		const tree = buildBookTree("MyStory", ["intro.md"]);
		expect(tree.chapters).toHaveLength(1);
		expect(tree.chapters[0].name).toBe("MyStory");
		expect(tree.chapters[0].subchapters).toHaveLength(1);
		expect(tree.chapters[0].subchapters[0].name).toBe("MyStory");
		expect(tree.chapters[0].subchapters[0].pages).toEqual([{ relPath: "intro.md", title: "intro" }]);
	});

	it("places a one-folder-deep note in a chapter with an implicit same-named subchapter", () => {
		const tree = buildBookTree("MyStory", ["npcs/barkeep.md"]);
		expect(tree.chapters[0].name).toBe("npcs");
		expect(tree.chapters[0].subchapters[0].name).toBe("npcs");
		expect(tree.chapters[0].subchapters[0].pages[0].title).toBe("barkeep");
	});

	it("places a two-folder-deep note under its chapter and subchapter", () => {
		const tree = buildBookTree("MyStory", ["npcs/tavern/barkeep.md"]);
		expect(tree.chapters[0].name).toBe("npcs");
		expect(tree.chapters[0].subchapters[0].name).toBe("tavern");
	});

	it("collapses folders nested more than two levels deep into the second-level subchapter", () => {
		const tree = buildBookTree("MyStory", ["npcs/tavern/regulars/barkeep.md"]);
		expect(tree.chapters[0].name).toBe("npcs");
		expect(tree.chapters[0].subchapters[0].name).toBe("tavern");
		expect(tree.chapters[0].subchapters[0].pages[0].relPath).toBe("npcs/tavern/regulars/barkeep.md");
	});

	it("sorts chapters, subchapters, and pages alphabetically, case-insensitively", () => {
		const tree = buildBookTree("MyStory", [
			"zeta/a.md",
			"Alpha/b.md",
			"alpha/a.md",
		]);
		expect(tree.chapters.map((c) => c.name)).toEqual(["Alpha", "zeta"]);
		expect(tree.chapters[0].subchapters.map((s) => s.name)).toEqual(["Alpha", "alpha"]);
	});

	it("strips the .md extension from the title but keeps the rest of the filename", () => {
		const tree = buildBookTree("MyStory", ["The Gnome's Tale.md"]);
		expect(tree.chapters[0].subchapters[0].pages[0].title).toBe("The Gnome's Tale");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- bookTree
```

Expected: FAIL — `buildBookTree` is not defined / module not found.

- [ ] **Step 3: Implement bookTree.ts**

`src/exporter/bookTree.ts`:

```ts
export interface PageNode {
	relPath: string;
	title: string;
}

export interface SubchapterNode {
	name: string;
	pages: PageNode[];
}

export interface ChapterNode {
	name: string;
	subchapters: SubchapterNode[];
}

export interface BookTree {
	chapters: ChapterNode[];
}

function titleFromPath(relPath: string): string {
	const base = relPath.split("/").pop() ?? relPath;
	return base.replace(/\.md$/i, "");
}

/**
 * Groups a flat list of note paths (relative to the exported root
 * folder, "/"-separated, no leading slash) into a chapter/subchapter/
 * page tree.
 *
 * - A note directly in the root goes into an implicit chapter named
 *   `rootName`, with an implicit subchapter of the same name (so
 *   nothing displays with a blank subchapter label).
 * - A note one folder deep (`folder/note.md`) goes into a chapter named
 *   after that folder, with the same same-named-subchapter fallback.
 * - A note two or more folders deep uses the first segment as the
 *   chapter and the second as the subchapter; any deeper segments are
 *   ignored (v1 supports exactly two levels of nesting).
 *
 * Chapters, subchapters, and pages are each sorted alphabetically
 * (case-insensitive) — a fixed, deterministic order that key
 * assignment (keyAssigner.ts) depends on for stable output across
 * repeated exports.
 */
export function buildBookTree(rootName: string, relPaths: string[]): BookTree {
	const chapterMap = new Map<string, Map<string, PageNode[]>>();

	for (const relPath of relPaths) {
		const segments = relPath.split("/");
		const fileSegment = segments[segments.length - 1];
		const folderSegments = segments.slice(0, -1);

		const chapterName = folderSegments.length >= 1 ? folderSegments[0] : rootName;
		const subchapterName = folderSegments.length >= 2 ? folderSegments[1] : chapterName;

		if (!chapterMap.has(chapterName)) {
			chapterMap.set(chapterName, new Map());
		}
		const subMap = chapterMap.get(chapterName)!;
		if (!subMap.has(subchapterName)) {
			subMap.set(subchapterName, []);
		}
		subMap.get(subchapterName)!.push({ relPath, title: titleFromPath(fileSegment) });
	}

	const byNameCI = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

	const chapters: ChapterNode[] = Array.from(chapterMap.entries())
		.sort(([a], [b]) => byNameCI(a, b))
		.map(([name, subMap]) => ({
			name,
			subchapters: Array.from(subMap.entries())
				.sort(([a], [b]) => byNameCI(a, b))
				.map(([subName, pages]) => ({
					name: subName,
					pages: [...pages].sort((a, b) => byNameCI(a.title, b.title)),
				})),
		}));

	return { chapters };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- bookTree
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exporter/bookTree.ts test/bookTree.test.ts
git commit -m "feat: bookTree — folder paths to chapter/subchapter/page tree"
```

---

## Task 3: keyAssigner — deterministic id-NNNNN keys

**Files:**
- Create: `src/exporter/keyAssigner.ts`
- Test: `test/keyAssigner.test.ts`

**Interfaces:**
- Consumes: `BookTree`, `ChapterNode`, `SubchapterNode`, `PageNode` from `bookTree.ts`.
- Produces: `assignKeys(tree: BookTree): IndexedBookTree` and `assignImageKeys(orderedImagePaths: string[]): Map<string, string>`, plus the types:
  - `IndexedPage { dataKey: string; indexKey: string; order: number; relPath: string; title: string }` — `dataKey` is the page's **module-global** `refmanualdata` key; `indexKey` and `order` are its position **within its own subchapter's `refpages`** (both reset to 1 at the start of each subchapter).
  - `IndexedSubchapter { key: string; order: number; name: string; pages: IndexedPage[] }`
  - `IndexedChapter { key: string; order: number; name: string; subchapters: IndexedSubchapter[] }`
  - `IndexedBookTree { chapters: IndexedChapter[]; pagesInOrder: IndexedPage[]; pageKeyByPath: Map<string, string> }` — `pageKeyByPath` maps a page's `relPath` to its `dataKey`, for link resolution in Task 6.

- [ ] **Step 1: Write the failing tests**

`test/keyAssigner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assignKeys, assignImageKeys } from "../src/exporter/keyAssigner";
import type { BookTree } from "../src/exporter/bookTree";

describe("assignKeys", () => {
	const tree: BookTree = {
		chapters: [
			{
				name: "Chapter One",
				subchapters: [
					{ name: "Sub A", pages: [{ relPath: "a1.md", title: "A1" }, { relPath: "a2.md", title: "A2" }] },
					{ name: "Sub B", pages: [{ relPath: "b1.md", title: "B1" }] },
				],
			},
			{
				name: "Chapter Two",
				subchapters: [{ name: "Sub C", pages: [{ relPath: "c1.md", title: "C1" }] }],
			},
		],
	};

	it("assigns chapter and subchapter keys starting at id-00001 within their own parent", () => {
		const indexed = assignKeys(tree);
		expect(indexed.chapters[0].key).toBe("id-00001");
		expect(indexed.chapters[1].key).toBe("id-00001"); // chapters are also a flat top-level collection, but this suite only has one parent (the tree itself), so both would be id-00001/id-00002 — see next test
	});

	it("increments chapter keys across the whole tree", () => {
		const indexed = assignKeys(tree);
		expect(indexed.chapters.map((c) => c.key)).toEqual(["id-00001", "id-00002"]);
	});

	it("increments subchapter keys within their own chapter, restarting per chapter", () => {
		const indexed = assignKeys(tree);
		expect(indexed.chapters[0].subchapters.map((s) => s.key)).toEqual(["id-00001", "id-00002"]);
		expect(indexed.chapters[1].subchapters.map((s) => s.key)).toEqual(["id-00001"]);
	});

	it("assigns page indexKey restarting at id-00001 within each subchapter", () => {
		const indexed = assignKeys(tree);
		expect(indexed.chapters[0].subchapters[0].pages.map((p) => p.indexKey)).toEqual(["id-00001", "id-00002"]);
		expect(indexed.chapters[0].subchapters[1].pages.map((p) => p.indexKey)).toEqual(["id-00001"]);
		expect(indexed.chapters[1].subchapters[0].pages.map((p) => p.indexKey)).toEqual(["id-00001"]);
	});

	it("assigns page dataKey incrementing flatly across the whole module", () => {
		const indexed = assignKeys(tree);
		const allDataKeys = indexed.chapters.flatMap((c) => c.subchapters.flatMap((s) => s.pages.map((p) => p.dataKey)));
		expect(allDataKeys).toEqual(["id-00001", "id-00002", "id-00003", "id-00004"]);
	});

	it("builds pageKeyByPath mapping relPath to dataKey", () => {
		const indexed = assignKeys(tree);
		expect(indexed.pageKeyByPath.get("a1.md")).toBe("id-00001");
		expect(indexed.pageKeyByPath.get("c1.md")).toBe("id-00004");
	});

	it("builds pagesInOrder matching the same walk order as dataKey assignment", () => {
		const indexed = assignKeys(tree);
		expect(indexed.pagesInOrder.map((p) => p.relPath)).toEqual(["a1.md", "a2.md", "b1.md", "c1.md"]);
	});
});

describe("assignImageKeys", () => {
	it("assigns sequential asset paths preserving each image's extension", () => {
		const map = assignImageKeys(["/vault/map.png", "/vault/portrait.jpg"]);
		expect(map.get("/vault/map.png")).toBe("images/img-00001.png");
		expect(map.get("/vault/portrait.jpg")).toBe("images/img-00002.jpg");
	});

	it("de-duplicates repeated paths, keeping the first assigned name", () => {
		const map = assignImageKeys(["/vault/map.png", "/vault/map.png"]);
		expect(map.size).toBe(1);
		expect(map.get("/vault/map.png")).toBe("images/img-00001.png");
	});
});
```

(The first test above is intentionally superseded by the second — remove the first `it` block once you've confirmed the second passes; it exists only to make the "flat across the tree" behavior explicit during review. Delete it before committing.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- keyAssigner
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement keyAssigner.ts**

`src/exporter/keyAssigner.ts`:

```ts
import type { BookTree } from "./bookTree";

export interface IndexedPage {
	dataKey: string;
	indexKey: string;
	order: number;
	relPath: string;
	title: string;
}

export interface IndexedSubchapter {
	key: string;
	order: number;
	name: string;
	pages: IndexedPage[];
}

export interface IndexedChapter {
	key: string;
	order: number;
	name: string;
	subchapters: IndexedSubchapter[];
}

export interface IndexedBookTree {
	chapters: IndexedChapter[];
	pagesInOrder: IndexedPage[];
	pageKeyByPath: Map<string, string>;
}

function idTag(n: number): string {
	return "id-" + String(n).padStart(5, "0");
}

/**
 * Assigns FG-style id-NNNNN keys to the tree. Two distinct ID spaces are
 * modeled, matching a real FG module's actual structure:
 *  - `dataKey`: the page's key in the flat, module-global `refmanualdata`
 *    collection — increments once per page across the WHOLE tree.
 *  - `indexKey`/`order`: the page's position within its OWN subchapter's
 *    `refpages` collection — resets to 1 at the start of each subchapter.
 * Chapter and subchapter keys are likewise scoped to their own parent
 * collection (chapters: the whole tree; subchapters: their chapter).
 */
export function assignKeys(tree: BookTree): IndexedBookTree {
	const pagesInOrder: IndexedPage[] = [];
	const pageKeyByPath = new Map<string, string>();
	let dataCounter = 0;

	const chapters: IndexedChapter[] = tree.chapters.map((chapter, ci) => ({
		key: idTag(ci + 1),
		order: ci + 1,
		name: chapter.name,
		subchapters: chapter.subchapters.map((sub, si) => ({
			key: idTag(si + 1),
			order: si + 1,
			name: sub.name,
			pages: sub.pages.map((page, pi) => {
				dataCounter += 1;
				const indexed: IndexedPage = {
					dataKey: idTag(dataCounter),
					indexKey: idTag(pi + 1),
					order: pi + 1,
					relPath: page.relPath,
					title: page.title,
				};
				pagesInOrder.push(indexed);
				pageKeyByPath.set(page.relPath, indexed.dataKey);
				return indexed;
			}),
		})),
	}));

	return { chapters, pagesInOrder, pageKeyByPath };
}

/**
 * Assigns a module-relative asset path to each distinct image path, in
 * first-seen order. Callers pass already-resolved, real identity strings
 * (e.g. vault paths) — this function only assigns names and de-duplicates
 * by that identity, it does not resolve embed text itself.
 */
export function assignImageKeys(orderedImagePaths: string[]): Map<string, string> {
	const result = new Map<string, string>();
	let counter = 0;
	for (const path of orderedImagePaths) {
		if (result.has(path)) continue;
		counter += 1;
		const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "";
		result.set(path, `images/img-${String(counter).padStart(5, "0")}${ext}`);
	}
	return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- keyAssigner
```

Expected: all pass (after deleting the superseded first `it` block per its note).

- [ ] **Step 5: Commit**

```bash
git add src/exporter/keyAssigner.ts test/keyAssigner.test.ts
git commit -m "feat: keyAssigner — dual id-NNNNN key spaces matching real FG modules"
```

---

## Task 4: markdownInline — inline span parsing

**Files:**
- Create: `src/exporter/markdownInline.ts`
- Test: `test/markdownInline.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseInline(line: string): InlineSpan[]` and the type `InlineSpan = { kind: "text"; text: string } | { kind: "bold"; spans: InlineSpan[] } | { kind: "italic"; spans: InlineSpan[] } | { kind: "wikilink"; target: string; label: string }`.

- [ ] **Step 1: Write the failing tests**

`test/markdownInline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseInline } from "../src/exporter/markdownInline";

describe("parseInline", () => {
	it("returns a single text span for plain text", () => {
		expect(parseInline("hello world")).toEqual([{ kind: "text", text: "hello world" }]);
	});

	it("returns an empty array for an empty line", () => {
		expect(parseInline("")).toEqual([]);
	});

	it("parses bold text", () => {
		expect(parseInline("**bold**")).toEqual([{ kind: "bold", spans: [{ kind: "text", text: "bold" }] }]);
	});

	it("parses italic text", () => {
		expect(parseInline("*italic*")).toEqual([{ kind: "italic", spans: [{ kind: "text", text: "italic" }] }]);
	});

	it("parses a bare wikilink, using the target as the label", () => {
		expect(parseInline("[[Barkeep]]")).toEqual([{ kind: "wikilink", target: "Barkeep", label: "Barkeep" }]);
	});

	it("parses an aliased wikilink", () => {
		expect(parseInline("[[Barkeep|the barkeep]]")).toEqual([
			{ kind: "wikilink", target: "Barkeep", label: "the barkeep" },
		]);
	});

	it("parses a mixed line with text, bold, and a wikilink in order", () => {
		expect(parseInline("Hello **bold** and [[Note]] friend")).toEqual([
			{ kind: "text", text: "Hello " },
			{ kind: "bold", spans: [{ kind: "text", text: "bold" }] },
			{ kind: "text", text: " and " },
			{ kind: "wikilink", target: "Note", label: "Note" },
			{ kind: "text", text: " friend" },
		]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- markdownInline
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement markdownInline.ts**

`src/exporter/markdownInline.ts`:

```ts
export type InlineSpan =
	| { kind: "text"; text: string }
	| { kind: "bold"; spans: InlineSpan[] }
	| { kind: "italic"; spans: InlineSpan[] }
	| { kind: "wikilink"; target: string; label: string };

/**
 * Parses one line of Markdown into inline spans: **bold**, *italic*,
 * [[wikilinks]] (optionally [[target|label]]), and plain text. Nesting
 * bold and italic inside each other is not supported in v1 — the inner
 * marker's asterisks are treated as literal text, an accepted
 * simplification for a first version.
 */
export function parseInline(line: string): InlineSpan[] {
	const spans: InlineSpan[] = [];
	const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(line)) !== null) {
		if (match.index > lastIndex) {
			spans.push({ kind: "text", text: line.slice(lastIndex, match.index) });
		}
		if (match[1] !== undefined) {
			spans.push({ kind: "wikilink", target: match[1].trim(), label: (match[2] ?? match[1]).trim() });
		} else if (match[3] !== undefined) {
			spans.push({ kind: "bold", spans: [{ kind: "text", text: match[3] }] });
		} else if (match[4] !== undefined) {
			spans.push({ kind: "italic", spans: [{ kind: "text", text: match[4] }] });
		}
		lastIndex = pattern.lastIndex;
	}
	if (lastIndex < line.length) {
		spans.push({ kind: "text", text: line.slice(lastIndex) });
	}
	return spans;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- markdownInline
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exporter/markdownInline.ts test/markdownInline.test.ts
git commit -m "feat: markdownInline — bold/italic/wikilink span parsing"
```

---

## Task 5: markdownBlocks — a note's body to blocks

**Files:**
- Create: `src/exporter/markdownBlocks.ts`
- Test: `test/markdownBlocks.test.ts`

**Interfaces:**
- Consumes: `parseInline`, `InlineSpan` from `markdownInline.ts`.
- Produces: `parseNote(body: string): ParsedBlock[]` and the types `TextLine = { kind: "paragraph"; spans: InlineSpan[] } | { kind: "list"; items: InlineSpan[][] }`, `ParsedBlock = { kind: "text"; lines: TextLine[] } | { kind: "header"; text: string } | { kind: "image"; embedTarget: string }`.

- [ ] **Step 1: Write the failing tests**

`test/markdownBlocks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseNote } from "../src/exporter/markdownBlocks";

describe("parseNote", () => {
	it("produces one text block with one paragraph line for a single paragraph", () => {
		const blocks = parseNote("Hello there.");
		expect(blocks).toEqual([
			{ kind: "text", lines: [{ kind: "paragraph", spans: [{ kind: "text", text: "Hello there." }] }] },
		]);
	});

	it("splits blank-line-separated paragraphs into separate text blocks", () => {
		const blocks = parseNote("First.\n\nSecond.");
		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({ kind: "text" });
		expect(blocks[1]).toMatchObject({ kind: "text" });
	});

	it("starts a new header block on an H2 heading and continues with a following paragraph", () => {
		const blocks = parseNote("## Section One\nSome text.");
		expect(blocks[0]).toEqual({ kind: "header", text: "Section One" });
		expect(blocks[1]).toMatchObject({ kind: "text" });
	});

	it("also recognizes H3 headings", () => {
		const blocks = parseNote("### Small Heading");
		expect(blocks[0]).toEqual({ kind: "header", text: "Small Heading" });
	});

	it("does not treat an H1 heading specially — it is ordinary paragraph text", () => {
		const blocks = parseNote("# Not a block header");
		expect(blocks[0]).toMatchObject({ kind: "text" });
	});

	it("groups consecutive bullet list lines into one list block", () => {
		const blocks = parseNote("- one\n- two\n- three");
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ kind: "text", lines: [{ kind: "list" }] });
		const listLine = (blocks[0] as any).lines[0];
		expect(listLine.items).toHaveLength(3);
	});

	it("groups consecutive numbered list lines into one list block", () => {
		const blocks = parseNote("1. one\n2. two");
		const listLine = (blocks[0] as any).lines[0];
		expect(listLine.items).toHaveLength(2);
	});

	it("turns a lone image embed line into its own image block", () => {
		const blocks = parseNote("Before.\n\n![[map.png]]\n\nAfter.");
		expect(blocks).toHaveLength(3);
		expect(blocks[1]).toEqual({ kind: "image", embedTarget: "map.png" });
	});

	it("also recognizes standard Markdown image syntax", () => {
		const blocks = parseNote("![a map](map.png)");
		expect(blocks[0]).toEqual({ kind: "image", embedTarget: "map.png" });
	});

	it("returns an empty array for an empty note", () => {
		expect(parseNote("")).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- markdownBlocks
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement markdownBlocks.ts**

`src/exporter/markdownBlocks.ts`:

```ts
import { parseInline, type InlineSpan } from "./markdownInline";

export type TextLine =
	| { kind: "paragraph"; spans: InlineSpan[] }
	| { kind: "list"; items: InlineSpan[][] };

export type ParsedBlock =
	| { kind: "text"; lines: TextLine[] }
	| { kind: "header"; text: string }
	| { kind: "image"; embedTarget: string };

const HEADING_RE = /^#{2,3}\s+(.*)$/;
const IMAGE_EMBED_RE = /^!\[\[([^\]]+)\]\]$/;
const IMAGE_MD_RE = /^!\[[^\]]*\]\(([^)]+)\)$/;
const LIST_ITEM_RE = /^\s*(?:[-*]|\d+\.)\s+(.*)$/;

/**
 * Splits a note's Markdown body into blocks. An H2 (`##`) or H3 (`###`)
 * heading starts a new `header` block and ends whatever text/list block
 * was accumulating. An image embed that is the only thing on its own
 * line becomes its own `image` block — an embed appearing inline within
 * other paragraph text is not supported in v1 (left as literal text, so
 * nothing crashes). Consecutive list-item lines group into one `list`
 * block; consecutive plain lines group into one paragraph. A note's H1,
 * if present, is not treated specially — the page's title always comes
 * from its filename, per the spec.
 */
export function parseNote(body: string): ParsedBlock[] {
	const blocks: ParsedBlock[] = [];
	const lines = body.split(/\r\n|\n/);

	let currentParagraph: string[] = [];
	let currentList: string[] = [];

	function flushParagraph() {
		if (currentParagraph.length === 0) return;
		blocks.push({
			kind: "text",
			lines: [{ kind: "paragraph", spans: parseInline(currentParagraph.join(" ")) }],
		});
		currentParagraph = [];
	}
	function flushList() {
		if (currentList.length === 0) return;
		blocks.push({
			kind: "text",
			lines: [{ kind: "list", items: currentList.map((item) => parseInline(item)) }],
		});
		currentList = [];
	}

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (line === "") {
			flushParagraph();
			flushList();
			continue;
		}

		const headingMatch = HEADING_RE.exec(line);
		if (headingMatch) {
			flushParagraph();
			flushList();
			blocks.push({ kind: "header", text: headingMatch[1].trim() });
			continue;
		}

		const imageMatch = IMAGE_EMBED_RE.exec(line) ?? IMAGE_MD_RE.exec(line);
		if (imageMatch) {
			flushParagraph();
			flushList();
			blocks.push({ kind: "image", embedTarget: imageMatch[1].trim() });
			continue;
		}

		const listMatch = LIST_ITEM_RE.exec(line);
		if (listMatch) {
			flushParagraph();
			currentList.push(listMatch[1]);
			continue;
		}

		flushList();
		currentParagraph.push(line);
	}
	flushParagraph();
	flushList();

	return blocks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- markdownBlocks
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exporter/markdownBlocks.ts test/markdownBlocks.test.ts
git commit -m "feat: markdownBlocks — note body to headers/text/image blocks"
```

---

## Task 6: blockResolver — links and images to final FG XML

**Files:**
- Create: `src/exporter/blockResolver.ts`
- Test: `test/blockResolver.test.ts`

**Interfaces:**
- Consumes: `ParsedBlock`, `TextLine` from `markdownBlocks.ts`; `InlineSpan` from `markdownInline.ts`.
- Produces: `resolveBlocks(blocks: ParsedBlock[], ctx: ResolveContext): { blocks: ResolvedBlock[]; stats: ResolveStats }`, and the types:
  - `ResolveContext { resolveWikilink(target: string): string | null; resolveImage(embedTarget: string): string | null }` — `resolveWikilink` returns the target page's `dataKey` or `null`; `resolveImage` returns the module-relative asset path or `null`.
  - `ResolvedBlock = { kind: "singletext"; xml: string } | { kind: "header"; text: string } | { kind: "image"; assetPath: string }`
  - `ResolveStats { linksResolved: number; linksDegraded: number; imagesResolved: number; imagesSkipped: number }`

- [ ] **Step 1: Write the failing tests**

`test/blockResolver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveBlocks, type ResolveContext } from "../src/exporter/blockResolver";
import type { ParsedBlock } from "../src/exporter/markdownBlocks";

const ctxNone: ResolveContext = {
	resolveWikilink: () => null,
	resolveImage: () => null,
};

describe("resolveBlocks", () => {
	it("renders a plain paragraph as <p>text</p>", () => {
		const blocks: ParsedBlock[] = [
			{ kind: "text", lines: [{ kind: "paragraph", spans: [{ kind: "text", text: "Hello." }] }] },
		];
		const { blocks: out } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([{ kind: "singletext", xml: "<p>Hello.</p>" }]);
	});

	it("escapes XML special characters in plain text", () => {
		const blocks: ParsedBlock[] = [
			{ kind: "text", lines: [{ kind: "paragraph", spans: [{ kind: "text", text: "A & B < C" }] }] },
		];
		const { blocks: out } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([{ kind: "singletext", xml: "<p>A &amp; B &lt; C</p>" }]);
	});

	it("renders bold and italic spans as <b>/<i>", () => {
		const blocks: ParsedBlock[] = [
			{
				kind: "text",
				lines: [
					{
						kind: "paragraph",
						spans: [
							{ kind: "bold", spans: [{ kind: "text", text: "bold" }] },
							{ kind: "text", text: " and " },
							{ kind: "italic", spans: [{ kind: "text", text: "italic" }] },
						],
					},
				],
			},
		];
		const { blocks: out } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([{ kind: "singletext", xml: "<p><b>bold</b> and <i>italic</i></p>" }]);
	});

	it("renders a list block as <list><li>...</li></list>", () => {
		const blocks: ParsedBlock[] = [
			{
				kind: "text",
				lines: [{ kind: "list", items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]] }],
			},
		];
		const { blocks: out } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([{ kind: "singletext", xml: "<list><li>one</li><li>two</li></list>" }]);
	});

	it("passes header blocks through unchanged", () => {
		const blocks: ParsedBlock[] = [{ kind: "header", text: "A Heading" }];
		const { blocks: out } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([{ kind: "header", text: "A Heading" }]);
	});

	it("resolves a wikilink to a referencemanualpage link and counts it", () => {
		const blocks: ParsedBlock[] = [
			{ kind: "text", lines: [{ kind: "paragraph", spans: [{ kind: "wikilink", target: "Barkeep", label: "the barkeep" }] }] },
		];
		const ctx: ResolveContext = { resolveWikilink: () => "id-00007", resolveImage: () => null };
		const { blocks: out, stats } = resolveBlocks(blocks, ctx);
		expect(out).toEqual([
			{
				kind: "singletext",
				xml: '<p><link class="referencemanualpage" recordname="reference.refmanualdata.id-00007">the barkeep</link></p>',
			},
		]);
		expect(stats.linksResolved).toBe(1);
		expect(stats.linksDegraded).toBe(0);
	});

	it("degrades an unresolvable wikilink to plain text and counts it", () => {
		const blocks: ParsedBlock[] = [
			{ kind: "text", lines: [{ kind: "paragraph", spans: [{ kind: "wikilink", target: "Elsewhere", label: "elsewhere" }] }] },
		];
		const { blocks: out, stats } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([{ kind: "singletext", xml: "<p>elsewhere</p>" }]);
		expect(stats.linksDegraded).toBe(1);
		expect(stats.linksResolved).toBe(0);
	});

	it("resolves an image block to its asset path and counts it", () => {
		const blocks: ParsedBlock[] = [{ kind: "image", embedTarget: "map.png" }];
		const ctx: ResolveContext = { resolveWikilink: () => null, resolveImage: () => "images/img-00001.png" };
		const { blocks: out, stats } = resolveBlocks(blocks, ctx);
		expect(out).toEqual([{ kind: "image", assetPath: "images/img-00001.png" }]);
		expect(stats.imagesResolved).toBe(1);
	});

	it("drops an unresolvable image block and counts it, without throwing", () => {
		const blocks: ParsedBlock[] = [{ kind: "image", embedTarget: "missing.png" }];
		const { blocks: out, stats } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([]);
		expect(stats.imagesSkipped).toBe(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- blockResolver
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement blockResolver.ts**

`src/exporter/blockResolver.ts`:

```ts
import type { InlineSpan } from "./markdownInline";
import type { ParsedBlock, TextLine } from "./markdownBlocks";

export interface ResolveContext {
	resolveWikilink(target: string): string | null;
	resolveImage(embedTarget: string): string | null;
}

export type ResolvedBlock =
	| { kind: "singletext"; xml: string }
	| { kind: "header"; text: string }
	| { kind: "image"; assetPath: string };

export interface ResolveStats {
	linksResolved: number;
	linksDegraded: number;
	imagesResolved: number;
	imagesSkipped: number;
}

function escapeXml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function spansToXml(spans: InlineSpan[], ctx: ResolveContext, stats: ResolveStats): string {
	return spans
		.map((span): string => {
			if (span.kind === "text") return escapeXml(span.text);
			if (span.kind === "bold") return `<b>${spansToXml(span.spans, ctx, stats)}</b>`;
			if (span.kind === "italic") return `<i>${spansToXml(span.spans, ctx, stats)}</i>`;
			const dataKey = ctx.resolveWikilink(span.target);
			if (dataKey) {
				stats.linksResolved += 1;
				return `<link class="referencemanualpage" recordname="reference.refmanualdata.${dataKey}">${escapeXml(span.label)}</link>`;
			}
			stats.linksDegraded += 1;
			return escapeXml(span.label);
		})
		.join("");
}

function lineToXml(line: TextLine, ctx: ResolveContext, stats: ResolveStats): string {
	if (line.kind === "paragraph") {
		return `<p>${spansToXml(line.spans, ctx, stats)}</p>`;
	}
	return `<list>${line.items.map((spans) => `<li>${spansToXml(spans, ctx, stats)}</li>`).join("")}</list>`;
}

/**
 * Resolves a note's parsed blocks into final FG XML fragments / asset
 * paths. Wikilinks whose target isn't part of this export, and image
 * embeds whose file can't be found, degrade gracefully (plain text /
 * dropped block) instead of failing the export — both are counted in
 * `stats` so the caller can report them.
 */
export function resolveBlocks(
	blocks: ParsedBlock[],
	ctx: ResolveContext,
): { blocks: ResolvedBlock[]; stats: ResolveStats } {
	const stats: ResolveStats = { linksResolved: 0, linksDegraded: 0, imagesResolved: 0, imagesSkipped: 0 };
	const resolved: ResolvedBlock[] = [];

	for (const block of blocks) {
		if (block.kind === "header") {
			resolved.push({ kind: "header", text: block.text });
		} else if (block.kind === "text") {
			const xml = block.lines.map((line) => lineToXml(line, ctx, stats)).join("");
			resolved.push({ kind: "singletext", xml });
		} else {
			const assetPath = ctx.resolveImage(block.embedTarget);
			if (assetPath) {
				stats.imagesResolved += 1;
				resolved.push({ kind: "image", assetPath });
			} else {
				stats.imagesSkipped += 1;
			}
		}
	}

	return { blocks: resolved, stats };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- blockResolver
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exporter/blockResolver.ts test/blockResolver.test.ts
git commit -m "feat: blockResolver — links/images to final FG XML, with graceful degradation"
```

---

## Task 7: xmlBuilders — db.xml and definition.xml

**Files:**
- Create: `src/exporter/xmlBuilders.ts`
- Test: `test/xmlBuilders.test.ts`

**Interfaces:**
- Consumes: `IndexedBookTree`, `IndexedPage`, `IndexedSubchapter`, `IndexedChapter` from `keyAssigner.ts`; `ResolvedBlock` from `blockResolver.ts`.
- Produces: `buildDbXml(tree: IndexedBookTree, pagesContent: Map<string, PageContent>): string`, `buildDefinitionXml(moduleName: string): string`, and `PageContent { dataKey: string; title: string; blocks: ResolvedBlock[] }`.

- [ ] **Step 1: Write the failing tests**

`test/xmlBuilders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDbXml, buildDefinitionXml, type PageContent } from "../src/exporter/xmlBuilders";
import { assignKeys } from "../src/exporter/keyAssigner";
import type { BookTree } from "../src/exporter/bookTree";

const tree: BookTree = {
	chapters: [
		{
			name: "Chapter One",
			subchapters: [{ name: "Sub A", pages: [{ relPath: "a1.md", title: "Page A1" }] }],
		},
	],
};

function contentFor(dataKey: string): PageContent {
	return {
		dataKey,
		title: "Page A1",
		blocks: [
			{ kind: "singletext", xml: "<p>Hello.</p>" },
			{ kind: "header", text: "A Section" },
			{ kind: "image", assetPath: "images/img-00001.png" },
		],
	};
}

describe("buildDbXml", () => {
	it("produces well-formed XML with the reference/refmanualdata/refmanualindex structure", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);

		expect(xml).toContain("<reference>");
		expect(xml).toContain("<refmanualdata>");
		expect(xml).toContain("<refmanualindex>");
		expect(xml).toContain('<name type="string">Page A1</name>');
	});

	it("keys each page's refmanualdata entry by its dataKey", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain("<id-00001><name");
	});

	it("emits a singletext block with the resolved formattedtext xml", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain('<blocktype type="string">singletext</blocktype>');
		expect(xml).toContain('<text type="formattedtext"><p>Hello.</p></text>');
	});

	it("emits a header block as a string-type text field, not formattedtext", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain('<blocktype type="string">header</blocktype>');
		expect(xml).toContain('<text type="string">A Section</text>');
	});

	it("emits an image block whose bitmap points at the given asset path", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain("<bitmap>images/img-00001.png</bitmap>");
	});

	it("links each refpages entry to its page's dataKey with no @module suffix", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain("<recordname>reference.refmanualdata.id-00001</recordname>");
		expect(xml).not.toContain("@");
	});
});

describe("buildDefinitionXml", () => {
	it("includes the module name and an Any ruleset", () => {
		const xml = buildDefinitionXml("My Story Folder");
		expect(xml).toContain("<name>My Story Folder</name>");
		expect(xml).toContain("<ruleset>Any</ruleset>");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- xmlBuilders
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement xmlBuilders.ts**

`src/exporter/xmlBuilders.ts`:

```ts
import type { IndexedBookTree } from "./keyAssigner";
import type { ResolvedBlock } from "./blockResolver";

export interface PageContent {
	dataKey: string;
	title: string;
	blocks: ResolvedBlock[];
}

function escapeXmlText(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function blockToXml(block: ResolvedBlock, order: number): string {
	const tag = "id-" + String(order).padStart(5, "0");
	if (block.kind === "header") {
		return `<${tag}><blocktype type="string">header</blocktype><order type="number">${order}</order><text type="string">${escapeXmlText(block.text)}</text></${tag}>`;
	}
	if (block.kind === "image") {
		const fileName = block.assetPath.split("/").pop() ?? block.assetPath;
		return `<${tag}><blocktype type="string">image</blocktype><order type="number">${order}</order><image type="image"><layers><layer><name>${escapeXmlText(fileName)}</name><id>0</id><parentid>-1</parentid><type>image</type><bitmap>${escapeXmlText(block.assetPath)}</bitmap></layer></layers></image></${tag}>`;
	}
	return `<${tag}><blocktype type="string">singletext</blocktype><order type="number">${order}</order><text type="formattedtext">${block.xml}</text></${tag}>`;
}

function pageDataXml(page: PageContent): string {
	const blocksXml = page.blocks.map((b, i) => blockToXml(b, i + 1)).join("");
	return `<${page.dataKey}><name type="string">${escapeXmlText(page.title)}</name><blocks>${blocksXml}</blocks></${page.dataKey}>`;
}

/**
 * Builds db.xml's full content: the flat refmanualdata page collection
 * (keyed by each page's module-global dataKey) plus the chapters ->
 * subchapters -> refpages nav tree (keyed by the per-parent-scoped keys
 * from keyAssigner), matching the schema verified against a real FG
 * module (see the design spec).
 */
export function buildDbXml(tree: IndexedBookTree, pagesContent: Map<string, PageContent>): string {
	const dataXml = tree.pagesInOrder.map((p) => pageDataXml(pagesContent.get(p.dataKey)!)).join("");

	const chaptersXml = tree.chapters
		.map((chapter) => {
			const subchaptersXml = chapter.subchapters
				.map((sub) => {
					const refpagesXml = sub.pages
						.map(
							(page) =>
								`<${page.indexKey}><name type="string">${escapeXmlText(page.title)}</name><order type="number">${page.order}</order><listlink type="windowreference"><class>story_book_page_advanced</class><recordname>reference.refmanualdata.${page.dataKey}</recordname></listlink></${page.indexKey}>`,
						)
						.join("");
					return `<${sub.key}><name type="string">${escapeXmlText(sub.name)}</name><order type="number">${sub.order}</order><refpages>${refpagesXml}</refpages></${sub.key}>`;
				})
				.join("");
			return `<${chapter.key}><name type="string">${escapeXmlText(chapter.name)}</name><order type="number">${chapter.order}</order><subchapters>${subchaptersXml}</subchapters></${chapter.key}>`;
		})
		.join("");

	return (
		'<?xml version="1.0" encoding="utf-8"?>' +
		'<root version="5.1"><reference>' +
		`<refmanualdata>${dataXml}</refmanualdata>` +
		`<refmanualindex><chapters>${chaptersXml}</chapters></refmanualindex>` +
		"</reference></root>"
	);
}

export function buildDefinitionXml(moduleName: string): string {
	return (
		'<?xml version="1.0" encoding="utf-8"?>' +
		'<root version="2.9">' +
		`<name>${escapeXmlText(moduleName)}</name>` +
		"<author>Obsidian FG Story Exporter</author>" +
		"<ruleset>Any</ruleset>" +
		"</root>"
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- xmlBuilders
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exporter/xmlBuilders.ts test/xmlBuilders.test.ts
git commit -m "feat: xmlBuilders — db.xml and definition.xml matching the verified FG schema"
```

---

## Task 8: moduleZip — assembling the .mod bytes

**Files:**
- Create: `src/exporter/moduleZip.ts`
- Test: `test/moduleZip.test.ts`

**Interfaces:**
- Consumes: nothing beyond plain strings/bytes (does not import from other `exporter/` files).
- Produces: `buildModuleZip(input: ModuleZipInput): Promise<Uint8Array>` and `ModuleZipInput { definitionXml: string; dbXml: string; images: { assetPath: string; data: Uint8Array }[] }`.

- [ ] **Step 1: Write the failing tests**

`test/moduleZip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildModuleZip } from "../src/exporter/moduleZip";

describe("buildModuleZip", () => {
	it("produces a zip containing definition.xml and db.xml with the given content", async () => {
		const bytes = await buildModuleZip({
			definitionXml: "<root>def</root>",
			dbXml: "<root>db</root>",
			images: [],
		});
		const zip = await JSZip.loadAsync(bytes);
		expect(await zip.file("definition.xml")!.async("string")).toBe("<root>def</root>");
		expect(await zip.file("db.xml")!.async("string")).toBe("<root>db</root>");
	});

	it("includes each image at its given asset path", async () => {
		const bytes = await buildModuleZip({
			definitionXml: "<root/>",
			dbXml: "<root/>",
			images: [{ assetPath: "images/img-00001.png", data: new Uint8Array([1, 2, 3]) }],
		});
		const zip = await JSZip.loadAsync(bytes);
		const data = await zip.file("images/img-00001.png")!.async("uint8array");
		expect(Array.from(data)).toEqual([1, 2, 3]);
	});

	it("produces a zip with no images when none are given", async () => {
		const bytes = await buildModuleZip({ definitionXml: "<root/>", dbXml: "<root/>", images: [] });
		const zip = await JSZip.loadAsync(bytes);
		const imageFiles = Object.keys(zip.files).filter((name) => name.startsWith("images/"));
		expect(imageFiles).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- moduleZip
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement moduleZip.ts**

`src/exporter/moduleZip.ts`:

```ts
import JSZip from "jszip";

export interface ModuleZipInput {
	definitionXml: string;
	dbXml: string;
	images: { assetPath: string; data: Uint8Array }[];
}

/**
 * Assembles a Fantasy Grounds .mod file's bytes: definition.xml, db.xml,
 * and every packaged image at its assigned module-relative path. Pure
 * in-memory zip assembly — the caller is responsible for writing the
 * returned bytes to disk.
 */
export async function buildModuleZip(input: ModuleZipInput): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file("definition.xml", input.definitionXml);
	zip.file("db.xml", input.dbXml);
	for (const image of input.images) {
		zip.file(image.assetPath, image.data);
	}
	return zip.generateAsync({ type: "uint8array" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- moduleZip
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exporter/moduleZip.ts test/moduleZip.test.ts
git commit -m "feat: moduleZip — assemble a .mod file's bytes in-memory with JSZip"
```

---

## Task 9: Obsidian plugin scaffold — settings and command registration

⚠️ **This task produces UI/glue code with no automated test.** Verification is a manual build check here; full manual in-app verification happens in Task 13.

**Files:**
- Create: `src/settings.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: nothing from `exporter/` yet (that's wired in Task 11).
- Produces: `PluginSettings { modulesPath: string }`, `DEFAULT_SETTINGS: PluginSettings`, `FgStoryExporterSettingTab` (a `PluginSettingTab` subclass), and a folder-context-menu command registered in `main.ts` that (for now) just logs the clicked folder's path — Task 11 replaces the body with the real export call.

- [ ] **Step 1: Write settings.ts**

`src/settings.ts`:

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type FgStoryExporterPlugin from "./main";

export interface PluginSettings {
	modulesPath: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	modulesPath: "",
};

/**
 * Tries to open a native folder-picker via Electron; returns the chosen
 * path, or null if the user cancelled or the API isn't available (e.g. a
 * future Obsidian/Electron version changes how the remote module is
 * exposed). Callers must always have a working plain-text fallback —
 * this is a nice-to-have, not a requirement.
 */
async function pickFolderNative(): Promise<string | null> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const remote = require("@electron/remote");
		const result = await remote.dialog.showOpenDialog({ properties: ["openDirectory"] });
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	} catch {
		return null;
	}
}

export class FgStoryExporterSettingTab extends PluginSettingTab {
	plugin: FgStoryExporterPlugin;

	constructor(app: App, plugin: FgStoryExporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Fantasy Grounds modules folder")
			.setDesc('The "modules" folder inside your Fantasy Grounds data directory, e.g. ~/.smiteworks/fgdata/modules.')
			.addText((text) =>
				text
					.setPlaceholder("/path/to/fgdata/modules")
					.setValue(this.plugin.settings.modulesPath)
					.onChange(async (value) => {
						this.plugin.settings.modulesPath = value.trim();
						await this.plugin.saveSettings();
					}),
			)
			.addButton((button) =>
				button.setButtonText("Browse…").onClick(async () => {
					const picked = await pickFolderNative();
					if (picked) {
						this.plugin.settings.modulesPath = picked;
						await this.plugin.saveSettings();
						this.display();
					}
				}),
			);
	}
}
```

- [ ] **Step 2: Wire settings and a placeholder command into main.ts**

`src/main.ts`:

```ts
import { Plugin, TFolder, Notice } from "obsidian";
import { DEFAULT_SETTINGS, FgStoryExporterSettingTab, type PluginSettings } from "./settings";

export default class FgStoryExporterPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FgStoryExporterSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) =>
					item
						.setTitle("Export to Fantasy Grounds")
						.setIcon("upload")
						.onClick(() => {
							if (!this.settings.modulesPath) {
								new Notice("Set the Fantasy Grounds modules folder in this plugin's settings first.");
								return;
							}
							// Replaced with the real export call in Task 11.
							new Notice(`Would export: ${file.path}`);
						}),
				);
			}),
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
npm test
```

Expected: `main.js` builds without errors; existing unit tests still pass (this task adds no new unit tests — it's Obsidian UI glue).

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts src/main.ts
git commit -m "feat: settings tab (modules folder path) + folder context-menu command stub"
```

---

## Task 10: exportOrchestrator — tying the pipeline to the real vault

⚠️ **This task's logic is verified manually in Task 13** — it is the glue layer the spec always expected to be thin and Obsidian-API-dependent, not unit-tested.

**Files:**
- Create: `src/exporter/exportOrchestrator.ts`

**Interfaces:**
- Consumes: `buildBookTree` (Task 2), `assignKeys`/`assignImageKeys` (Task 3), `parseNote` (Task 5), `resolveBlocks`/`ResolveContext` (Task 6), `buildDbXml`/`buildDefinitionXml`/`PageContent` (Task 7), `buildModuleZip` (Task 8).
- Produces: `exportFolder(app: App, folder: TFolder, settings: PluginSettings): Promise<ExportSummary>` and `ExportSummary { pagesExported: number; imagesPackaged: number; linksResolved: number; linksDegraded: number; imagesSkipped: number; emptyNotesSkipped: number }`.

- [ ] **Step 1: Implement exportOrchestrator.ts**

`src/exporter/exportOrchestrator.ts`:

```ts
import { TFile, TFolder, type App } from "obsidian";
import * as path from "path";
import { promises as fs } from "fs";
import { buildBookTree } from "./bookTree";
import { assignKeys, assignImageKeys } from "./keyAssigner";
import { parseNote, type ParsedBlock } from "./markdownBlocks";
import { resolveBlocks, type ResolveContext } from "./blockResolver";
import { buildDbXml, buildDefinitionXml, type PageContent } from "./xmlBuilders";
import { buildModuleZip } from "./moduleZip";
import type { PluginSettings } from "../settings";

export interface ExportSummary {
	pagesExported: number;
	imagesPackaged: number;
	linksResolved: number;
	linksDegraded: number;
	imagesSkipped: number;
	emptyNotesSkipped: number;
}

function collectImageEmbedTargets(blocks: ParsedBlock[]): string[] {
	return blocks.filter((b): b is Extract<ParsedBlock, { kind: "image" }> => b.kind === "image").map((b) => b.embedTarget);
}

/**
 * Exports `folder` as a Fantasy Grounds Story module. Reads every
 * Markdown note under the folder, translates it via the pure pipeline
 * (bookTree -> keyAssigner -> markdownBlocks -> blockResolver ->
 * xmlBuilders -> moduleZip), and writes `<folder name>.mod` into
 * `settings.modulesPath`, overwriting any previous export of this
 * folder.
 */
export async function exportFolder(app: App, folder: TFolder, settings: PluginSettings): Promise<ExportSummary> {
	const noteFiles = app.vault
		.getMarkdownFiles()
		.filter((f) => f.path === folder.path || f.path.startsWith(folder.path + "/"))
		.filter((f) => f.path.startsWith(folder.path + "/")); // exclude the folder note itself, if any, matching folder.path exactly

	const relPathOf = (f: TFile) => f.path.slice(folder.path.length + 1);

	// 1. Read every note's body and parse it (Obsidian strips frontmatter
	// from cachedRead's raw content only via metadataCache, not the read
	// itself, so we trim a leading "---...---" block ourselves).
	const bodyByPath = new Map<string, string>();
	const parsedByPath = new Map<string, ParsedBlock[]>();
	let emptyNotesSkipped = 0;

	for (const file of noteFiles) {
		const raw = await app.vault.cachedRead(file);
		const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
		if (body.length === 0) {
			emptyNotesSkipped += 1;
			continue;
		}
		const relPath = relPathOf(file);
		bodyByPath.set(relPath, body);
		parsedByPath.set(relPath, parseNote(body));
	}

	// 2. Build the tree and assign page/chapter/subchapter keys.
	const tree = buildBookTree(folder.name, Array.from(bodyByPath.keys()));
	const indexed = assignKeys(tree);

	// 3. Walk pages in the same deterministic order to collect every
	// referenced image's real vault path, then assign each a stable
	// module-relative asset path.
	const imageFileByEmbed = new Map<string, TFile>(); // "relPath::embedTarget" -> resolved TFile
	const orderedImageVaultPaths: string[] = [];

	for (const page of indexed.pagesInOrder) {
		const blocks = parsedByPath.get(page.relPath) ?? [];
		const sourcePath = folder.path + "/" + page.relPath;
		for (const embedTarget of collectImageEmbedTargets(blocks)) {
			const dest = app.metadataCache.getFirstLinkpathDest(embedTarget, sourcePath);
			if (dest) {
				imageFileByEmbed.set(page.relPath + "::" + embedTarget, dest);
				orderedImageVaultPaths.push(dest.path);
			}
		}
	}
	const assetPathByVaultPath = assignImageKeys(orderedImageVaultPaths);

	// 4. Resolve every page's blocks (wikilinks against pageKeyByPath,
	// images against the asset-path map just built).
	const pagesContent = new Map<string, PageContent>();
	let linksResolved = 0;
	let linksDegraded = 0;
	let imagesResolved = 0;
	let imagesSkipped = 0;

	for (const page of indexed.pagesInOrder) {
		const blocks = parsedByPath.get(page.relPath) ?? [];
		const ctx: ResolveContext = {
			resolveWikilink: (target) => {
				const dest = app.metadataCache.getFirstLinkpathDest(target, folder.path + "/" + page.relPath);
				if (!dest) return null;
				const destRelPath = relPathOf(dest);
				return indexed.pageKeyByPath.get(destRelPath) ?? null;
			},
			resolveImage: (embedTarget) => {
				const dest = imageFileByEmbed.get(page.relPath + "::" + embedTarget);
				if (!dest) return null;
				return assetPathByVaultPath.get(dest.path) ?? null;
			},
		};
		const { blocks: resolved, stats } = resolveBlocks(blocks, ctx);
		linksResolved += stats.linksResolved;
		linksDegraded += stats.linksDegraded;
		imagesResolved += stats.imagesResolved;
		imagesSkipped += stats.imagesSkipped;
		pagesContent.set(page.dataKey, { dataKey: page.dataKey, title: page.title, blocks: resolved });
	}

	// 5. Read the bytes for every image actually used.
	const images: { assetPath: string; data: Uint8Array }[] = [];
	for (const [vaultPath, assetPath] of assetPathByVaultPath) {
		const file = app.vault.getAbstractFileByPath(vaultPath);
		if (file instanceof TFile) {
			const data = await app.vault.readBinary(file);
			images.push({ assetPath, data: new Uint8Array(data) });
		}
	}

	// 6. Build XML, zip, and write the module file.
	const dbXml = buildDbXml(indexed, pagesContent);
	const definitionXml = buildDefinitionXml(folder.name);
	const zipBytes = await buildModuleZip({ definitionXml, dbXml, images });

	await fs.mkdir(settings.modulesPath, { recursive: true });
	await fs.writeFile(path.join(settings.modulesPath, `${folder.name}.mod`), zipBytes);

	return {
		pagesExported: indexed.pagesInOrder.length,
		imagesPackaged: images.length,
		linksResolved,
		linksDegraded,
		imagesSkipped,
		emptyNotesSkipped,
	};
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
npm test
```

Expected: builds without errors; all existing unit tests still pass (this task adds no unit tests of its own — it's the Obsidian-API glue the design always expected to verify manually).

- [ ] **Step 3: Commit**

```bash
git add src/exporter/exportOrchestrator.ts
git commit -m "feat: exportOrchestrator — wire the pure pipeline to real vault content"
```

---

## Task 11: Wire the orchestrator into the command, with a summary Notice

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `exportFolder`, `ExportSummary` from `exportOrchestrator.ts`.
- Produces: the "Export to Fantasy Grounds" command now performs a real export and reports the result.

- [ ] **Step 1: Replace the placeholder command body**

In `src/main.ts`, replace the `onClick` handler (the one currently showing `Would export: ${file.path}`) with:

```ts
						.onClick(async () => {
							if (!this.settings.modulesPath) {
								new Notice("Set the Fantasy Grounds modules folder in this plugin's settings first.");
								return;
							}
							new Notice(`Exporting "${file.name}"…`);
							try {
								const summary = await exportFolder(this.app, file, this.settings);
								const parts = [`${summary.pagesExported} page(s)`, `${summary.imagesPackaged} image(s)`];
								if (summary.linksDegraded > 0) parts.push(`${summary.linksDegraded} link(s) not resolved`);
								if (summary.imagesSkipped > 0) parts.push(`${summary.imagesSkipped} image(s) skipped`);
								if (summary.emptyNotesSkipped > 0) parts.push(`${summary.emptyNotesSkipped} empty note(s) skipped`);
								new Notice(`Exported "${file.name}.mod": ${parts.join(", ")}.`);
							} catch (err) {
								console.error("FG Story Exporter: export failed", err);
								new Notice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
							}
						}),
```

Add the import at the top of `src/main.ts`:

```ts
import { exportFolder } from "./exporter/exportOrchestrator";
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
npm test
```

Expected: builds without errors; all unit tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire real export into the command, with a result summary Notice"
```

---

## Task 12: Packaging and docs

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: install/usage instructions accurate to the shipped behavior.

- [ ] **Step 1: Write CHANGELOG.md**

```markdown
# Changelog

## 0.1.0 — 2026-09-13
- First version. Right-click a folder → "Export to Fantasy Grounds"
  writes `<FolderName>.mod` into the configured FG modules folder: a
  Story book (chapters/subchapters/pages) from that folder's notes,
  including packaged local images and resolved [[wikilinks]] between
  notes in the same export. Re-exporting overwrites the same file.
```

- [ ] **Step 2: Rewrite README.md**

Replace the placeholder body with: what the plugin does; install steps (copy `manifest.json` + `main.js` into `<vault>/.obsidian/plugins/fg-story-exporter/`, enable it, set the modules-folder path in settings); usage (right-click a folder); the Markdown subset supported (link to the design spec's translation table); the known v1 limitations (max two levels of folder nesting; no live sync; real interactive FG maps are never touched, only plain embedded images).

- [ ] **Step 3: Final build and test check**

```bash
npm run build
npm test
```

Expected: builds cleanly; all unit tests (36 across Tasks 2–8) pass.

- [ ] **Step 4: Commit and tag**

```bash
git add -A
git commit -m "docs: changelog, install/usage README for v0.1.0"
git tag v0.1.0
```

---

## Task 13: Manual end-to-end verification

⚠️ **USER-EXECUTED.** Neither the agent nor a subagent can drive the Obsidian desktop app or Fantasy Grounds — both are GUIs.

- [ ] **Step 1: Load the plugin into a real vault**

```bash
VAULT=/path/to/a/test/obsidian/vault
mkdir -p "$VAULT/.obsidian/plugins/fg-story-exporter"
cp manifest.json main.js "$VAULT/.obsidian/plugins/fg-story-exporter/"
```

Open that vault in Obsidian, go to Settings → Community plugins, enable "Fantasy Grounds Story Exporter". In its settings, set the modules folder path (e.g. `~/.smiteworks/fgdata/modules`).

- [ ] **Step 2: Build a small test folder in the vault**

Create `Test Story/Introduction.md`:

```markdown
Welcome to the **test** campaign.

## Cast of Characters

See [[Test Story/NPCs/Barkeep]] for the tavern owner.

- Bring dice
- Bring snacks

![[map.png]]
```

Create `Test Story/NPCs/Barkeep.md`:

```markdown
The barkeep is gruff but *fair*.
```

Drop any small `map.png` into the vault (e.g. at the vault root) so the embed resolves.

- [ ] **Step 3: Export and inspect the raw file**

Right-click the `Test Story` folder → "Export to Fantasy Grounds". Confirm the Notice reports 2 pages, 1 image, 1 link resolved, 0 degraded.

```bash
cd ~/.smiteworks/fgdata/modules
unzip -o "Test Story.mod" -d /tmp/test-story-check
cat /tmp/test-story-check/db.xml
```

Confirm: two `refmanualdata` entries; the chapter "Test Story" containing a "NPCs" subchapter with "Barkeep", and an implicit "Test Story" subchapter with "Introduction"; the `<link class="referencemanualpage">` pointing at the Barkeep page's `dataKey`; an image block with `<bitmap>images/img-00001.png</bitmap>`; `images/img-00001.png` present in the zip.

- [ ] **Step 4: Load it in Fantasy Grounds**

Launch FG, open a campaign, enable "Test Story" in the Library/module list, open the Story window. Confirm:
- Both pages appear, correctly nested under their chapter/subchapter.
- **Bold**/*italic* render correctly.
- The bullet list renders as a list.
- The "Cast of Characters" H2 appears as its own section/block.
- Clicking the Barkeep link navigates to that page.
- The image displays on the Introduction page.

If pages render incorrectly nested (the "open item" flagged in the spec — whether a page can sit directly under a chapter without an intermediate subchapter), note the actual behavior; if FG requires the subchapter level as this plan assumed, no change is needed — this step exists to confirm it, not to discover a fallback.

- [ ] **Step 5: Verify re-export updates in place**

Add a new paragraph to `Introduction.md`, rename `Barkeep.md` to `Bartender.md`. Re-export the same folder. Confirm: still exactly one `Test Story.mod` file (no `Test Story (1).mod` or similar); reloading the module in FG shows the updated paragraph and the still-working link to the renamed page (now titled "Bartender").

- [ ] **Step 6: Record results**

Note pass/fail for each check above in this file or a follow-up message. Any failure here is a real bug to fix before calling v0.1.0 done — loop back to the relevant task.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Right-click folder → export command | 9 (registration), 11 (real behavior) |
| Folder → chapter, subfolder → subchapter, note → page, 2-level cap | 2 |
| Markdown translation table (bold/italic/lists/headings/wikilinks/images/degradation) | 4, 5, 6 |
| Images packaged into the module | 6 (resolution), 7 (XML), 8 (zip), 10 (bytes) |
| One `.mod` per folder, full rebuild, overwrite = update | 10 (writes with folder name, `fs.writeFile` overwrites) |
| No vault mutation, path-derived (not stamped) identity | 2, 3, 10 (all keys computed fresh from current paths every run) |
| Links/images survive rebuild and renames | 3 (dual ID spaces), 6 (resolution via injected lookups), 13 step 5 (verifies it) |
| One settings field (modules folder path) | 9 |
| Error handling table (empty note, broken embed, outside-export wikilink, unsupported markdown, non-md files, overwrite) | 5 (unsupported syntax degrades to plain text), 6 (broken embed/outside-export link), 10 (empty note skip, non-md files never collected since only `getMarkdownFiles()` is read) |
| Verified `.mod`/`db.xml` schema (reference/refmanualdata/refmanualindex, dual ID spaces, plain-path image blocks, no `@module` suffix internally) | 7 |
| Testing: pure-logic unit tests + manual end-to-end | 2–8 (unit), 13 (manual) |
| Open item: subchapter nesting requirement | 2 (implicit-subchapter design already handles it either way), 13 step 4 (confirms) |

No gaps.

**2. Placeholder scan** — no `TBD`/`TODO`/"add error handling" found. Task 3's test file has one intentionally-superseded `it` block, explicitly called out with instructions to delete it — not a placeholder, a deliberate teaching example flagged for removal.

**3. Type consistency** — `BookTree`/`ChapterNode`/`SubchapterNode`/`PageNode` (Task 2) flow unchanged into `assignKeys` (Task 3). `IndexedBookTree`/`IndexedPage`/`IndexedChapter`/`IndexedSubchapter` (Task 3) flow into `xmlBuilders.buildDbXml` (Task 7) and `exportOrchestrator` (Task 10) with matching field names (`dataKey`, `indexKey`, `order`, `key`, `pagesInOrder`, `pageKeyByPath`). `InlineSpan` (Task 4) flows into `markdownBlocks.TextLine` (Task 5) and `blockResolver` (Task 6) unchanged. `ParsedBlock`/`TextLine` (Task 5) match exactly what `blockResolver.resolveBlocks` (Task 6) consumes. `ResolvedBlock` (Task 6) matches what `xmlBuilders.PageContent.blocks` (Task 7) and `exportOrchestrator` expect. `ModuleZipInput` (Task 8) matches what `exportOrchestrator` (Task 10) builds. `PluginSettings` (Task 9) matches what `exportOrchestrator` (Task 10) and `main.ts` (Task 11) reference.
