import esbuild from "esbuild";
import process from "process";

const production = process.argv[2] === "production";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", "@electron/remote"],
	format: "cjs",
	target: "es2020",
	platform: "node",
	outfile: "main.js",
	sourcemap: production ? false : "inline",
	minify: production,
});

if (production) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
