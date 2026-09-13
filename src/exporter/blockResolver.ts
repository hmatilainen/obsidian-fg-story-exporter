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
	return s
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
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
