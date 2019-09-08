import fs from "fs";
import path from "path";
import { promisify } from "util";
import chalk from "chalk";
import rimraf from "rimraf";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import { runWebpack } from "../lib/webpack";
import { hookPlugins, isDir } from "../utils";
import { CommandArguments } from "../types";

export type Argv = CommandArguments<{
	clean: boolean;
	dest: string;
	prerender: boolean;
	production: boolean;
	brotli: boolean;
}>;

export function cli(api: PluginAPI) {
	api.registerCommand("build [src] [dest]")
		.description("Build the current project into static files")
		.option("--clean", "Removes destination folder before building")
		.option("--dest <dir>", "Destination folder", "build")
		.option("--no-prerender", "Don't prerender URLs")
		.option("--production", "Sets the build as production build")
		.option("--brotli", "Enable Brotli compression")
		.action(async (src?: string, dest?: string, argv?: Argv) => {
			src = !!src ? path.join(argv.cwd, src) : argv.cwd;
			dest = path.join(src, dest || argv.dest);
			api.debug("%o", { src, dest });
			// Set new values back into argv object
			Object.assign(argv, { src, dest });
			const modules = path.resolve(src, "./node_modules");
			if (!isDir(modules)) {
				api.setStatus(
					`No 'node_modules' folder found! Please run ${chalk.magenta(
						argv.pm.getInstallCommand()
					)} before continuing.`,
					"fatal"
				);
			}
			if (argv.brotli) {
				api.setStatus(
					"⚛️ ATTENTION! You have enabled BROTLI support. In order for this to work correctly, make sure .js.br files are served with 'content-encoding: br' header.",
					"info"
				);
			}

			if (argv.clean) {
				api.setStatus("Removing old dest. directory");
				await promisify(rimraf)(dest);
			}

			const registry = await hookPlugins(argv.parent);
			registry.invoke("build", argv);

			try {
				await runWebpack(api, argv, config => registry.hookWebpackChain(config));
			} catch (err) {
				api.setStatus(`Error! ${err}`, "fatal");
			}
		});
}
