import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildModuleZip } from "../src/exporter/moduleZip";

describe("buildModuleZip", () => {
	it("produces a zip containing definition.xml and db.xml with the given content", async () => {
		const bytes = await buildModuleZip({
			definitionXml: "<root>def</root>",
			dbXml: "<root>db</root>",
			images: [],
		});
		const zip = await JSZip.loadAsync(bytes);
		expect(await zip.file("definition.xml")!.async("string")).toBe("<root>def</root>");
		expect(await zip.file("db.xml")!.async("string")).toBe("<root>db</root>");
	});

	it("includes each image at its given asset path", async () => {
		const bytes = await buildModuleZip({
			definitionXml: "<root/>",
			dbXml: "<root/>",
			images: [{ assetPath: "images/img-00001.png", data: new Uint8Array([1, 2, 3]) }],
		});
		const zip = await JSZip.loadAsync(bytes);
		const data = await zip.file("images/img-00001.png")!.async("uint8array");
		expect(Array.from(data)).toEqual([1, 2, 3]);
	});

	it("produces a zip with no images when none are given", async () => {
		const bytes = await buildModuleZip({ definitionXml: "<root/>", dbXml: "<root/>", images: [] });
		const zip = await JSZip.loadAsync(bytes);
		const imageFiles = Object.keys(zip.files).filter((name) => name.startsWith("images/"));
		expect(imageFiles).toEqual([]);
	});
});
