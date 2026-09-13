import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
	},
	resolve: {
		alias: {
			// The real "obsidian" package ships only type declarations (no
			// runtime JS), so it can't be resolved by Vite/Vitest. Point it
			// at a minimal runtime stub for tests that exercise code
			// importing TFile/TFolder from "obsidian".
			obsidian: path.resolve(__dirname, "test/stubs/obsidian.ts"),
		},
	},
});
