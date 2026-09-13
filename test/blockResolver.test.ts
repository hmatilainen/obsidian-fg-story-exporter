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

	it("strips XML-illegal control characters from plain text", () => {
		const blocks: ParsedBlock[] = [
			{ kind: "text", lines: [{ kind: "paragraph", spans: [{ kind: "text", text: "a\x01b" }] }] },
		];
		const { blocks: out } = resolveBlocks(blocks, ctxNone);
		expect(out).toEqual([{ kind: "singletext", xml: "<p>ab</p>" }]);
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
