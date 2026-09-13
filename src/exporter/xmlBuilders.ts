import type { IndexedBookTree } from "./keyAssigner";
import type { ResolvedBlock } from "./blockResolver";

export interface PageContent {
	dataKey: string;
	title: string;
	blocks: ResolvedBlock[];
}

function escapeXmlText(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function blockToXml(block: ResolvedBlock, order: number): string {
	const tag = "id-" + String(order).padStart(5, "0");
	if (block.kind === "header") {
		return `<${tag}><blocktype type="string">header</blocktype><order type="number">${order}</order><text type="string">${escapeXmlText(block.text)}</text></${tag}>`;
	}
	if (block.kind === "image") {
		const fileName = block.assetPath.split("/").pop() ?? block.assetPath;
		return `<${tag}><blocktype type="string">image</blocktype><order type="number">${order}</order><image type="image"><layers><layer><name>${escapeXmlText(fileName)}</name><id>0</id><parentid>-1</parentid><type>image</type><bitmap>${escapeXmlText(block.assetPath)}</bitmap></layer></layers></image></${tag}>`;
	}
	return `<${tag}><blocktype type="string">singletext</blocktype><order type="number">${order}</order><text type="formattedtext">${block.xml}</text></${tag}>`;
}

function pageDataXml(page: PageContent): string {
	const blocksXml = page.blocks.map((b, i) => blockToXml(b, i + 1)).join("");
	return `<${page.dataKey}><name type="string">${escapeXmlText(page.title)}</name><blocks>${blocksXml}</blocks></${page.dataKey}>`;
}

/**
 * Builds db.xml's full content: the flat refmanualdata page collection
 * (keyed by each page's module-global dataKey) plus the chapters ->
 * subchapters -> refpages nav tree (keyed by the per-parent-scoped keys
 * from keyAssigner), matching the schema verified against a real FG
 * module (see the design spec).
 */
export function buildDbXml(tree: IndexedBookTree, pagesContent: Map<string, PageContent>): string {
	const dataXml = tree.pagesInOrder.map((p) => pageDataXml(pagesContent.get(p.dataKey)!)).join("");

	const chaptersXml = tree.chapters
		.map((chapter) => {
			const subchaptersXml = chapter.subchapters
				.map((sub) => {
					const refpagesXml = sub.pages
						.map(
							(page) =>
								`<${page.indexKey}><name type="string">${escapeXmlText(page.title)}</name><order type="number">${page.order}</order><listlink type="windowreference"><class>story_book_page_advanced</class><recordname>reference.refmanualdata.${page.dataKey}</recordname></listlink></${page.indexKey}>`,
						)
						.join("");
					return `<${sub.key}><name type="string">${escapeXmlText(sub.name)}</name><order type="number">${sub.order}</order><refpages>${refpagesXml}</refpages></${sub.key}>`;
				})
				.join("");
			return `<${chapter.key}><name type="string">${escapeXmlText(chapter.name)}</name><order type="number">${chapter.order}</order><subchapters>${subchaptersXml}</subchapters></${chapter.key}>`;
		})
		.join("");

	return (
		'<?xml version="1.0" encoding="utf-8"?>' +
		'<root version="5.1"><reference>' +
		`<refmanualdata>${dataXml}</refmanualdata>` +
		`<refmanualindex><chapters>${chaptersXml}</chapters></refmanualindex>` +
		"</reference></root>"
	);
}

export function buildDefinitionXml(moduleName: string): string {
	return (
		'<?xml version="1.0" encoding="utf-8"?>' +
		'<root version="2.9">' +
		`<name>${escapeXmlText(moduleName)}</name>` +
		"<author>Obsidian FG Story Exporter</author>" +
		"<ruleset>Any</ruleset>" +
		"</root>"
	);
}
