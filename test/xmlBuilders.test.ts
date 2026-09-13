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
