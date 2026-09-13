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

	it("emits an image block with a scale field of 60, matching the verified sample module", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain('<scale type="number">60</scale>');
	});

	it("strips XML-illegal control characters from text content", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(
			indexed.pagesInOrder.map((p) => [p.dataKey, { ...contentFor(p.dataKey), title: "a\x01b" }]),
		);
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain('<name type="string">ab</name>');
	});

	it("links each refpages entry to its page's dataKey with no @module suffix", () => {
		const indexed = assignKeys(tree);
		const pagesContent = new Map(indexed.pagesInOrder.map((p) => [p.dataKey, contentFor(p.dataKey)]));
		const xml = buildDbXml(indexed, pagesContent);
		expect(xml).toContain("<recordname>reference.refmanualdata.id-00001</recordname>");
		expect(xml).not.toContain("@");
	});

	it("separates order (local per subchapter) from dataKey (global) across subchapters", () => {
		const treeWithMultipleSubchapters: BookTree = {
			chapters: [
				{
					name: "Chapter One",
					subchapters: [
						{ name: "Sub A", pages: [{ relPath: "a1.md", title: "Page in Sub A" }] },
						{ name: "Sub B", pages: [{ relPath: "b1.md", title: "Page in Sub B" }] },
					],
				},
			],
		};

		const indexed = assignKeys(treeWithMultipleSubchapters);
		const pagesContent = new Map(
			indexed.pagesInOrder.map((p) => [
				p.dataKey,
				{ ...contentFor(p.dataKey), title: p.title },
			])
		);
		const xml = buildDbXml(indexed, pagesContent);

		// The second page globally should have dataKey id-00002 but order 1 (first in its subchapter)
		const secondPage = indexed.pagesInOrder[1];
		expect(secondPage.dataKey).toBe("id-00002");
		expect(secondPage.order).toBe(1);

		// Verify in the generated XML: the refpages entry for Sub B's page must show both:
		// - order type="number">1</order> (position within Sub B)
		// - recordname>reference.refmanualdata.id-00002</recordname> (global page ID)
		expect(xml).toContain("<id-00002><name");
		expect(xml).toContain(
			"<order type=\"number\">1</order><listlink type=\"windowreference\"><class>story_book_page_advanced</class><recordname>reference.refmanualdata.id-00002</recordname>"
		);
	});
});

describe("buildDefinitionXml", () => {
	it("includes the module name and an Any ruleset", () => {
		const xml = buildDefinitionXml("My Story Folder");
		expect(xml).toContain("<name>My Story Folder</name>");
		expect(xml).toContain("<ruleset>Any</ruleset>");
	});
});
