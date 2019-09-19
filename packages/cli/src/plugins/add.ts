/* eslint-disable @typescript-eslint/no-var-requires */
import fs from "fs";
import path from "path";
import { promisify } from "util";
import requireRelative from "require-relative";
import chalk from "chalk";
import { all as deepmerge } from "deepmerge";
import PluginAPI from "../api/plugin";
import { CLIArguments, CommandArguments } from "../types";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

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
			api.debug("Calling %o from plugin %o", "install", apiPlugin.id);
			if ("install" in mod) {
				const dependencies = await normalizePromise<{ dependencies?: object; devDependencies?: object }>(
					mod.install(apiPlugin, opts)
				);
				await updatePackageJson(dependencies, cwd);
				api.setStatus("Installing plugin's additional dependencies");
				await opts.pm.runInstall();
			}
			api.setStatus();
			api.setStatus("Done", "success");
		});
}

function normalizePromise<T>(val: T | Promise<T>): Promise<T> {
	if (val instanceof Promise) return val;
	return Promise.resolve(val);
}

async function updatePackageJson(data: object, dir: string) {
	const pkgPath = path.resolve(dir, "package.json");
	const pkg = await readFile(pkgPath).then(b => JSON.parse(b.toString()));
	await writeFile(pkgPath, JSON.stringify(deepmerge([pkg, data], { isMergeableObject: Boolean }), null, "\t"));
}
