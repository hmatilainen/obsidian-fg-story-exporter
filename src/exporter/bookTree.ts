export interface PageNode {
	relPath: string;
	title: string;
}

export interface SubchapterNode {
	name: string;
	pages: PageNode[];
}

export interface ChapterNode {
	name: string;
	subchapters: SubchapterNode[];
}

export interface BookTree {
	chapters: ChapterNode[];
}

function titleFromPath(relPath: string): string {
	const base = relPath.split("/").pop() ?? relPath;
	return base.replace(/\.md$/i, "");
}

/**
 * Groups a flat list of note paths (relative to the exported root
 * folder, "/"-separated, no leading slash) into a chapter/subchapter/
 * page tree.
 *
 * - A note directly in the root goes into an implicit chapter named
 *   `rootName`, with an implicit subchapter of the same name (so
 *   nothing displays with a blank subchapter label).
 * - A note one folder deep (`folder/note.md`) goes into a chapter named
 *   after that folder, with the same same-named-subchapter fallback.
 * - A note two or more folders deep uses the first segment as the
 *   chapter and the second as the subchapter; any deeper segments are
 *   ignored (v1 supports exactly two levels of nesting).
 *
 * Chapters, subchapters, and pages are each sorted alphabetically
 * (case-insensitive) — a fixed, deterministic order that key
 * assignment (keyAssigner.ts) depends on for stable output across
 * repeated exports.
 */
export function buildBookTree(rootName: string, relPaths: string[]): BookTree {
	const chapterMap = new Map<string, Map<string, PageNode[]>>();

	for (const relPath of relPaths) {
		const segments = relPath.split("/");
		const fileSegment = segments[segments.length - 1];
		const folderSegments = segments.slice(0, -1);

		const chapterName = folderSegments.length >= 1 ? folderSegments[0] : rootName;
		const subchapterName = folderSegments.length >= 2 ? folderSegments[1] : chapterName;

		if (!chapterMap.has(chapterName)) {
			chapterMap.set(chapterName, new Map());
		}
		const subMap = chapterMap.get(chapterName)!;
		if (!subMap.has(subchapterName)) {
			subMap.set(subchapterName, []);
		}
		subMap.get(subchapterName)!.push({ relPath, title: titleFromPath(fileSegment) });
	}

	const byNameCI = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

	const chapters: ChapterNode[] = Array.from(chapterMap.entries())
		.sort(([a], [b]) => byNameCI(a, b))
		.map(([name, subMap]) => ({
			name,
			subchapters: Array.from(subMap.entries())
				.sort(([a], [b]) => byNameCI(a, b))
				.map(([subName, pages]) => ({
					name: subName,
					pages: [...pages].sort((a, b) => byNameCI(a.title, b.title)),
				})),
		}));

	return { chapters };
}
