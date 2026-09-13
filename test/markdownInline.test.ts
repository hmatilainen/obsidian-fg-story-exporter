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
