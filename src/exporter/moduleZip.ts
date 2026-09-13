import JSZip from "jszip";

export interface ModuleZipInput {
	definitionXml: string;
	dbXml: string;
	images: { assetPath: string; data: Uint8Array }[];
}

/**
 * Assembles a Fantasy Grounds .mod file's bytes: definition.xml, db.xml,
 * and every packaged image at its assigned module-relative path. Pure
 * in-memory zip assembly — the caller is responsible for writing the
 * returned bytes to disk.
 */
export async function buildModuleZip(input: ModuleZipInput): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file("definition.xml", input.definitionXml);
	zip.file("db.xml", input.dbXml);
	for (const image of input.images) {
		zip.file(image.assetPath, image.data);
	}
	return zip.generateAsync({ type: "uint8array" });
}
