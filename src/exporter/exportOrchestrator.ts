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
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

export async function exportFolder(app: App, folder: TFolder, settings: PluginSettings): Promise<ExportSummary> {
	const pathPrefix = folder.isRoot() ? "" : folder.path + "/";
	const moduleName = folder.isRoot() ? app.vault.getName() : folder.name;

	const noteFiles = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(pathPrefix));

	const relPathOf = (f: TFile) => f.path.slice(pathPrefix.length);

	// 1. Read every note's body and parse it. Frontmatter (if any) is
	// stripped using Obsidian's own metadata cache boundary rather than a
	// hand-rolled regex, so a leading Markdown horizontal rule ("---") is
	// never mistaken for a frontmatter block.
	const bodyByPath = new Map<string, string>();
	const parsedByPath = new Map<string, ParsedBlock[]>();
	let emptyNotesSkipped = 0;

	for (const file of noteFiles) {
		const raw = await app.vault.cachedRead(file);
		const frontmatterPosition = app.metadataCache.getFileCache(file)?.frontmatterPosition;
		let body: string;
		if (frontmatterPosition) {
			let start = frontmatterPosition.end.offset;
			if (raw[start] === "\n") start += 1;
			body = raw.slice(start).trim();
		} else {
			body = raw.trim();
		}
		if (body.length === 0) {
			emptyNotesSkipped += 1;
			continue;
		}
		const relPath = relPathOf(file);
		bodyByPath.set(relPath, body);
		parsedByPath.set(relPath, parseNote(body));
	}

	// 2. Build the tree and assign page/chapter/subchapter keys.
	const tree = buildBookTree(moduleName, Array.from(bodyByPath.keys()));
	const indexed = assignKeys(tree);

	// 3. Walk pages in the same deterministic order to collect every
	// referenced image's real vault path, then assign each a stable
	// module-relative asset path.
	const imageFileByEmbed = new Map<string, TFile>(); // "relPath::embedTarget" -> resolved TFile
	const orderedImageVaultPaths: string[] = [];

	for (const page of indexed.pagesInOrder) {
		const blocks = parsedByPath.get(page.relPath) ?? [];
		const sourcePath = pathPrefix + page.relPath;
		for (const embedTarget of collectImageEmbedTargets(blocks)) {
			const cleanTarget = embedTarget.split("|")[0];
			const dest = app.metadataCache.getFirstLinkpathDest(cleanTarget, sourcePath);
			if (dest && IMAGE_EXTENSIONS.has(dest.extension.toLowerCase())) {
				imageFileByEmbed.set(page.relPath + "::" + cleanTarget, dest);
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
	let imagesSkipped = 0;

	for (const page of indexed.pagesInOrder) {
		const blocks = parsedByPath.get(page.relPath) ?? [];
		const ctx: ResolveContext = {
			resolveWikilink: (target) => {
				const cleanTarget = target.split(/[#^]/)[0];
				const dest = app.metadataCache.getFirstLinkpathDest(cleanTarget, pathPrefix + page.relPath);
				if (!dest) return null;
				if (!dest.path.startsWith(pathPrefix)) return null;
				const destRelPath = relPathOf(dest);
				return indexed.pageKeyByPath.get(destRelPath) ?? null;
			},
			resolveImage: (embedTarget) => {
				const cleanTarget = embedTarget.split("|")[0];
				const dest = imageFileByEmbed.get(page.relPath + "::" + cleanTarget);
				if (!dest) return null;
				return assetPathByVaultPath.get(dest.path) ?? null;
			},
		};
		const { blocks: resolved, stats } = resolveBlocks(blocks, ctx);
		linksResolved += stats.linksResolved;
		linksDegraded += stats.linksDegraded;
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
	const definitionXml = buildDefinitionXml(moduleName);
	const zipBytes = await buildModuleZip({ definitionXml, dbXml, images });

	await fs.mkdir(settings.modulesPath, { recursive: true });
	await fs.writeFile(path.join(settings.modulesPath, `${moduleName}.mod`), zipBytes);

	return {
		pagesExported: indexed.pagesInOrder.length,
		imagesPackaged: images.length,
		linksResolved,
		linksDegraded,
		imagesSkipped,
		emptyNotesSkipped,
	};
}
