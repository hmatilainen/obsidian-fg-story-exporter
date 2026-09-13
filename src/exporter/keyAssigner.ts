import type { BookTree } from "./bookTree";

export interface IndexedPage {
	dataKey: string;
	indexKey: string;
	order: number;
	relPath: string;
	title: string;
}

export interface IndexedSubchapter {
	key: string;
	order: number;
	name: string;
	pages: IndexedPage[];
}

export interface IndexedChapter {
	key: string;
	order: number;
	name: string;
	subchapters: IndexedSubchapter[];
}

export interface IndexedBookTree {
	chapters: IndexedChapter[];
	pagesInOrder: IndexedPage[];
	pageKeyByPath: Map<string, string>;
}

function idTag(n: number): string {
	return "id-" + String(n).padStart(5, "0");
}

/**
 * Assigns FG-style id-NNNNN keys to the tree. Two distinct ID spaces are
 * modeled, matching a real FG module's actual structure:
 *  - `dataKey`: the page's key in the flat, module-global `refmanualdata`
 *    collection — increments once per page across the WHOLE tree.
 *  - `indexKey`/`order`: the page's position within its OWN subchapter's
 *    `refpages` collection — resets to 1 at the start of each subchapter.
 * Chapter and subchapter keys are likewise scoped to their own parent
 * collection (chapters: the whole tree; subchapters: their chapter).
 */
export function assignKeys(tree: BookTree): IndexedBookTree {
	const pagesInOrder: IndexedPage[] = [];
	const pageKeyByPath = new Map<string, string>();
	let dataCounter = 0;

	const chapters: IndexedChapter[] = tree.chapters.map((chapter, ci) => ({
		key: idTag(ci + 1),
		order: ci + 1,
		name: chapter.name,
		subchapters: chapter.subchapters.map((sub, si) => ({
			key: idTag(si + 1),
			order: si + 1,
			name: sub.name,
			pages: sub.pages.map((page, pi) => {
				dataCounter += 1;
				const indexed: IndexedPage = {
					dataKey: idTag(dataCounter),
					indexKey: idTag(pi + 1),
					order: pi + 1,
					relPath: page.relPath,
					title: page.title,
				};
				pagesInOrder.push(indexed);
				pageKeyByPath.set(page.relPath, indexed.dataKey);
				return indexed;
			}),
		})),
	}));

	return { chapters, pagesInOrder, pageKeyByPath };
}

/**
 * Assigns a module-relative asset path to each distinct image path, in
 * first-seen order. Callers pass already-resolved, real identity strings
 * (e.g. vault paths) — this function only assigns names and de-duplicates
 * by that identity, it does not resolve embed text itself.
 */
export function assignImageKeys(orderedImagePaths: string[]): Map<string, string> {
	const result = new Map<string, string>();
	let counter = 0;
	for (const path of orderedImagePaths) {
		if (result.has(path)) continue;
		counter += 1;
		const base = path.split("/").pop() ?? path;
		const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
		result.set(path, `images/img-${String(counter).padStart(5, "0")}${ext}`);
	}
	return result;
}
