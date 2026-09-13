import { Plugin, TFolder, Notice } from "obsidian";
import { DEFAULT_SETTINGS, FgStoryExporterSettingTab, type PluginSettings } from "./settings";
import { exportFolder } from "./exporter/exportOrchestrator";

export default class FgStoryExporterPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FgStoryExporterSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) =>
					item
						.setTitle("Export to Fantasy Grounds")
						.setIcon("upload")
						.onClick(async () => {
							if (!this.settings.modulesPath) {
								new Notice("Set the Fantasy Grounds modules folder in this plugin's settings first.");
								return;
							}
							new Notice(`Exporting "${file.name}"…`);
							try {
								const summary = await exportFolder(this.app, file, this.settings);
								const parts = [`${summary.pagesExported} page(s)`, `${summary.imagesPackaged} image(s)`];
								if (summary.linksDegraded > 0) parts.push(`${summary.linksDegraded} link(s) skipped (target note empty or not in this export)`);
								if (summary.imagesSkipped > 0) parts.push(`${summary.imagesSkipped} image(s) skipped (file not found or not an image)`);
								if (summary.emptyNotesSkipped > 0) parts.push(`${summary.emptyNotesSkipped} empty note(s) skipped`);
								new Notice(`Exported "${file.name}.mod": ${parts.join(", ")}.`);
							} catch (err) {
								console.error("FG Story Exporter: export failed", err);
								new Notice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
							}
						}),
				);
			}),
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
