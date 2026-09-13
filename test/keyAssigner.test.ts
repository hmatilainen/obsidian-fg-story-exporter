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

	it("derives the extension from the basename only, ignoring dots in directory segments", () => {
		const map = assignImageKeys(["a.b/image"]);
		expect(map.get("a.b/image")).toBe("images/img-00001");
	});
});
