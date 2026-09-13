// Minimal runtime stand-in for the "obsidian" package, which ships only
// type declarations (no runtime JS - `"main": ""` in its package.json) and
// therefore can't be imported directly in a Vitest/Vite environment. Aliased
// in from vitest.config.ts so that source files doing
// `import { TFile, TFolder } from "obsidian"` resolve to real, minimal
// runtime classes during tests instead of failing module resolution.
export class TFile {
	path: string;
	extension: string;
	constructor(path: string) {
		this.path = path;
		const base = path.split("/").pop() ?? path;
		this.extension = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
	}
}

export class TFolder {
	path: string;
	name: string;
	constructor(path: string, name: string) {
		this.path = path;
		this.name = name;
	}
	isRoot() {
		return this.path === "/";
	}
}
