import { TFile, TFolder, type App } from "obsidian";
import * as path from "path";
import { promises as fs } from "fs";
import { buildBookTree } from "./bookTree";
import { assignKeys, assignImageKeys } from "./keyAssigner";
import { parseNote, type ParsedBlock } from "./markdownBlocks";
import { resolveBlocks, type ResolveContext } from "./blockResolver";
import { buildDbXml, buildDefinitionXml, type PageContent } from "./xmlBuilders";
import { buildModuleZip } from "./moduleZip";
import type { PluginSettings } from "../settings";

export interface ExportSummary {
	pagesExported: number;
	imagesPackaged: number;
	linksResolved: number;
	linksDegraded: number;
	imagesSkipped: number;
	emptyNotesSkipped: number;
}

function collectImageEmbedTargets(blocks: ParsedBlock[]): string[] {
	return blocks.filter((b): b is Extract<ParsedBlock, { kind: "image" }> => b.kind === "image").map((b) => b.embedTarget);
}

/**
 * Exports `folder` as a Fantasy Grounds Story module. Reads every
 * Markdown note under the folder, translates it via the pure pipeline
 * (bookTree -> keyAssigner -> markdownBlocks -> blockResolver ->
 * xmlBuilders -> moduleZip), and writes `<folder name>.mod` into
 * `settings.modulesPath`, overwriting any previous export of this
 * folder.
 */
export async function exportFolder(app: App, folder: TFolder, settings: PluginSettings): Promise<ExportSummary> {
	const noteFiles = app.vault
		.getMarkdownFiles()
		.filter((f) => f.path === folder.path || f.path.startsWith(folder.path + "/"))
		.filter((f) => f.path.startsWith(folder.path + "/")); // exclude the folder note itself, if any, matching folder.path exactly

	const relPathOf = (f: TFile) => f.path.slice(folder.path.length + 1);

	// 1. Read every note's body and parse it (Obsidian strips frontmatter
	// from cachedRead's raw content only via metadataCache, not the read
	// itself, so we trim a leading "---...---" block ourselves).
	const bodyByPath = new Map<string, string>();
	const parsedByPath = new Map<string, ParsedBlock[]>();
	let emptyNotesSkipped = 0;

	for (const file of noteFiles) {
		const raw = await app.vault.cachedRead(file);
		const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
		if (body.length === 0) {
			emptyNotesSkipped += 1;
			continue;
		}
		const relPath = relPathOf(file);
		bodyByPath.set(relPath, body);
		parsedByPath.set(relPath, parseNote(body));
	}

	// 2. Build the tree and assign page/chapter/subchapter keys.
	const tree = buildBookTree(folder.name, Array.from(bodyByPath.keys()));
	const indexed = assignKeys(tree);

	// 3. Walk pages in the same deterministic order to collect every
	// referenced image's real vault path, then assign each a stable
	// module-relative asset path.
	const imageFileByEmbed = new Map<string, TFile>(); // "relPath::embedTarget" -> resolved TFile
	const orderedImageVaultPaths: string[] = [];

	for (const page of indexed.pagesInOrder) {
		const blocks = parsedByPath.get(page.relPath) ?? [];
		const sourcePath = folder.path + "/" + page.relPath;
		for (const embedTarget of collectImageEmbedTargets(blocks)) {
			const dest = app.metadataCache.getFirstLinkpathDest(embedTarget, sourcePath);
			if (dest) {
				imageFileByEmbed.set(page.relPath + "::" + embedTarget, dest);
				orderedImageVaultPaths.push(dest.path);
			}
		}
	}
	const assetPathByVaultPath = assignImageKeys(orderedImageVaultPaths);

	// 4. Resolve every page's blocks (wikilinks against pageKeyByPath,
	// images against the asset-path map just built).
	const pagesContent = new Map<string, PageContent>();
	let linksResolved = 0;
	let linksDegraded = 0;
	let imagesResolved = 0;
	let imagesSkipped = 0;

	for (const page of indexed.pagesInOrder) {
		const blocks = parsedByPath.get(page.relPath) ?? [];
		const ctx: ResolveContext = {
			resolveWikilink: (target) => {
				const dest = app.metadataCache.getFirstLinkpathDest(target, folder.path + "/" + page.relPath);
				if (!dest) return null;
				const destRelPath = relPathOf(dest);
				return indexed.pageKeyByPath.get(destRelPath) ?? null;
			},
			resolveImage: (embedTarget) => {
				const dest = imageFileByEmbed.get(page.relPath + "::" + embedTarget);
				if (!dest) return null;
				return assetPathByVaultPath.get(dest.path) ?? null;
			},
		};
		const { blocks: resolved, stats } = resolveBlocks(blocks, ctx);
		linksResolved += stats.linksResolved;
		linksDegraded += stats.linksDegraded;
		imagesResolved += stats.imagesResolved;
		imagesSkipped += stats.imagesSkipped;
		pagesContent.set(page.dataKey, { dataKey: page.dataKey, title: page.title, blocks: resolved });
	}

	// 5. Read the bytes for every image actually used.
	const images: { assetPath: string; data: Uint8Array }[] = [];
	for (const [vaultPath, assetPath] of assetPathByVaultPath) {
		const file = app.vault.getAbstractFileByPath(vaultPath);
		if (file instanceof TFile) {
			const data = await app.vault.readBinary(file);
			images.push({ assetPath, data: new Uint8Array(data) });
		}
	}

	// 6. Build XML, zip, and write the module file.
	const dbXml = buildDbXml(indexed, pagesContent);
	const definitionXml = buildDefinitionXml(folder.name);
	const zipBytes = await buildModuleZip({ definitionXml, dbXml, images });

	await fs.mkdir(settings.modulesPath, { recursive: true });
	await fs.writeFile(path.join(settings.modulesPath, `${folder.name}.mod`), zipBytes);

	return {
		pagesExported: indexed.pagesInOrder.length,
		imagesPackaged: images.length,
		linksResolved,
		linksDegraded,
		imagesSkipped,
		emptyNotesSkipped,
	};
}
