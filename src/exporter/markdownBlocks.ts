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
