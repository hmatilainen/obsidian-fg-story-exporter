import { Plugin, TFolder, Notice } from "obsidian";
import { DEFAULT_SETTINGS, FgStoryExporterSettingTab, type PluginSettings } from "./settings";

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
						.onClick(() => {
							if (!this.settings.modulesPath) {
								new Notice("Set the Fantasy Grounds modules folder in this plugin's settings first.");
								return;
							}
							// Replaced with the real export call in Task 11.
							new Notice(`Would export: ${file.path}`);
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
