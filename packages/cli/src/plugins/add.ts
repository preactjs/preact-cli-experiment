/* eslint-disable @typescript-eslint/no-var-requires */
import PluginAPI from "../api/plugin";
import { CLIArguments, CommandArguments } from "../types";
import requireRelative from "require-relative";
import chalk from "chalk";

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("add <plugin>")
		.description("Add a Preact CLI plugin to the project")
		.action(async (plugin: string, argv: CommandArguments<{}>) => {
			api.setStatus("Resolving and installing dependencies");
			const { cwd, pm } = opts;
			const name = await pm
				.runAdd(true, { cwd }, `@preact/cli-plugin-${plugin}`)
				.then(() => `@preact/cli-plugin-${plugin}`)
				.catch(() =>
					pm.runAdd(true, { cwd }, `preact-cli-plugin-${plugin}`).then(() => `preact-cli-plugin-${plugin}`)
				)
				.catch(() => api.setStatus("Cannot find plugin " + chalk.magenta(plugin), "fatal"));
			if (typeof name !== "string") return;
			const apiPlugin = new PluginAPI(cwd, name, requireRelative.resolve(name, cwd), argv.parent);
			const mod = require(apiPlugin.importBase);
			if (mod === undefined) api.setStatus(`Package ${chalk.magenta(name)} does not export anything`, "fatal");
			if ("install" in mod) {
				await normalizePromise(mod.install(plugin, opts));
			}
			api.setStatus();
			api.setStatus("Done", "success");
		});
}

function normalizePromise<T>(val: T | Promise<T>): Promise<T> {
	if (val instanceof Promise) return val;
	return Promise.resolve(val);
}
