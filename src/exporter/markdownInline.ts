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
