import { App, PluginSettingTab, Setting } from "obsidian";
import type FgStoryExporterPlugin from "./main";

export interface PluginSettings {
	modulesPath: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	modulesPath: "",
};

/**
 * Tries to open a native folder-picker via Electron; returns the chosen
 * path, or null if the user cancelled or the API isn't available (e.g. a
 * future Obsidian/Electron version changes how the remote module is
 * exposed). Callers must always have a working plain-text fallback —
 * this is a nice-to-have, not a requirement.
 */
async function pickFolderNative(): Promise<string | null> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const remote = require("@electron/remote");
		const result = await remote.dialog.showOpenDialog({ properties: ["openDirectory"] });
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	} catch {
		return null;
	}
}

export class FgStoryExporterSettingTab extends PluginSettingTab {
	plugin: FgStoryExporterPlugin;

	constructor(app: App, plugin: FgStoryExporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Fantasy Grounds modules folder")
			.setDesc('The "modules" folder inside your Fantasy Grounds data directory, e.g. ~/.smiteworks/fgdata/modules.')
			.addText((text) =>
				text
					.setPlaceholder("/path/to/fgdata/modules")
					.setValue(this.plugin.settings.modulesPath)
					.onChange(async (value) => {
						this.plugin.settings.modulesPath = value.trim();
						await this.plugin.saveSettings();
					}),
			)
			.addButton((button) =>
				button.setButtonText("Browse…").onClick(async () => {
					const picked = await pickFolderNative();
					if (picked) {
						this.plugin.settings.modulesPath = picked;
						await this.plugin.saveSettings();
						this.display();
					}
				}),
			);
	}
}
