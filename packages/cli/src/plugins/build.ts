import fs from "fs";
import path from "path";
import { promisify } from "util";
import chalk from "chalk";
import program from "commander";
import rimraf from "rimraf";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import { runWebpack } from "../lib/webpack";
import { hookPlugins } from "../utils";

export function cli(api: PluginAPI, { packageManager, cwd }: Record<string, string>) {
	api.registerCommand("build [src] [dest]")
		.description("Build the current project into static files")
		.option("--clean", "Removes destination folder before building", false)
		.option("--dest", "Destination folder", "build")
		.option("--no-prerender", "Don't prerender URLs")
		.option("--production", "Sets the build as production build", false)
		.option("--brotli", "Enable Brotli compression", false)
		.action(async (src?: string, dest?: string, argv?: Record<string, any>) => {
			api.debug("argv %O", argv);
			cwd = argv && argv.cwd !== undefined ? argv.cwd : cwd;
			src = src || cwd;
			dest = dest || argv.dest || "build";
			// Set new values back into argv object
			Object.assign(argv, { src, dest, cwd });
			const pm = getPackageManager(packageManager);
			const modules = path.join(cwd, "node_modules");
			if (!fs.statSync(modules).isDirectory()) {
				api.setStatus(
					`No 'node_modules' folder found! Please run ${chalk.magenta(
						pm.getInstallCommand()
					)} before continuing.`,
					"error"
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

			await runWebpack(api, argv, async config => (await hookPlugins(program)).hookWebpackChain(config));
		});
}
