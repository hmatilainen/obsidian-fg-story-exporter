import { describe, it, expect, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { exportFolder } from "../src/exporter/exportOrchestrator";
// "obsidian" is aliased in vitest.config.ts to test/stubs/obsidian.ts - a
// minimal runtime stand-in, since the real npm package ships only type
// declarations (no runtime JS) and can't be imported directly in tests.
import { TFile as FakeTFile, TFolder as FakeTFolder } from "obsidian";

describe("exportFolder (integration-shaped, fake App)", () => {
	let tmpDir: string;

	afterEach(async () => {
		if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("degrades a wikilink resolving outside the exported folder instead of false-matching an in-export page", async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fg-export-test-"));

		// Exported folder is "A". "A/Foo.md" is an in-export page. A
		// separate in-export note links to "B/Foo", which the vault
		// resolves OUTSIDE the export, to "B/Foo.md". Naively slicing that
		// path by pathPrefix "A/" (length 2) yields "Foo.md" - the same
		// relPath as the in-export page - which is the exact false-match
		// scenario F1 fixes.
		const folder = new FakeTFolder("A", "A");
		const fooFile = new FakeTFile("A/Foo.md");
		const otherFile = new FakeTFile("A/Other.md");
		const outsideFile = new FakeTFile("B/Foo.md");

		const bodies = new Map<string, string>([
			[fooFile.path, "Foo page content."],
			[otherFile.path, "See [[B/Foo|the other Foo]] for details."],
		]);

		const app = makeFakeApp({
			markdownFiles: [fooFile, otherFile],
			bodies,
			linkResolutions: new Map([["B/Foo", outsideFile]]),
			binaryFiles: new Map(),
		});

		const summary = await exportFolder(app as any, folder as any, { modulesPath: tmpDir });

		expect(summary.linksDegraded).toBe(1);
		expect(summary.linksResolved).toBe(0);
	});

	it("skips a non-image embed (note transclusion) instead of packaging it as a bogus image block", async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fg-export-test-"));

		const folder = new FakeTFolder("A", "A");
		const otherFile = new FakeTFile("A/Other.md");
		const transcludedNote = new FakeTFile("A/Transcluded.md");

		const bodies = new Map<string, string>([
			[otherFile.path, "Some text.\n\n![[Transcluded]]"],
		]);

		const app = makeFakeApp({
			markdownFiles: [otherFile, transcludedNote],
			bodies,
			linkResolutions: new Map([["Transcluded", transcludedNote]]),
			binaryFiles: new Map(),
		});

		const summary = await exportFolder(app as any, folder as any, { modulesPath: tmpDir });

		expect(summary.imagesSkipped).toBe(1);
		expect(summary.imagesPackaged).toBe(0);
	});
});

function makeFakeApp(opts: {
	markdownFiles: FakeTFile[];
	bodies: Map<string, string>;
	linkResolutions: Map<string, FakeTFile>;
	binaryFiles: Map<string, ArrayBuffer>;
}) {
	const filesByPath = new Map<string, FakeTFile>(opts.markdownFiles.map((f) => [f.path, f]));
	for (const f of opts.linkResolutions.values()) filesByPath.set(f.path, f);

	return {
		vault: {
			getName: () => "TestVault",
			getMarkdownFiles: () => opts.markdownFiles,
			cachedRead: async (file: FakeTFile) => opts.bodies.get(file.path) ?? "",
			getAbstractFileByPath: (p: string) => filesByPath.get(p),
			readBinary: async (file: FakeTFile) => opts.binaryFiles.get(file.path) ?? new ArrayBuffer(0),
		},
		metadataCache: {
			getFileCache: () => undefined,
			getFirstLinkpathDest: (linkpath: string) => opts.linkResolutions.get(linkpath) ?? null,
		},
	};
}
