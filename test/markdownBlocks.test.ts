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
