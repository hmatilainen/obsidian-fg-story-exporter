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

	it("sorts chapters alphabetically, case-insensitively", () => {
		const tree = buildBookTree("MyStory", ["zeta/a.md", "Beta/b.md", "alpha/a.md"]);
		// Distinct folder names by exact string identity (a case-sensitive
		// filesystem can genuinely have "Alpha" and "alpha" as different
		// folders) — only the SORT is case-insensitive, folders are never
		// merged by casing.
		expect(tree.chapters.map((c) => c.name)).toEqual(["alpha", "Beta", "zeta"]);
	});

	it("sorts pages within a subchapter alphabetically, case-insensitively", () => {
		const tree = buildBookTree("MyStory", ["folder/Zebra.md", "folder/apple.md"]);
		expect(tree.chapters[0].subchapters[0].pages.map((p) => p.title)).toEqual(["apple", "Zebra"]);
	});

	it("strips the .md extension from the title but keeps the rest of the filename", () => {
		const tree = buildBookTree("MyStory", ["The Gnome's Tale.md"]);
		expect(tree.chapters[0].subchapters[0].pages[0].title).toBe("The Gnome's Tale");
	});
});
