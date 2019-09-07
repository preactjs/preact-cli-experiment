import fs from "fs";
import path from "path";
import { promisify } from "util";
import chalk from "chalk";
import program from "commander";
import rimraf from "rimraf";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import { runWebpack } from "../lib/webpack";
import { hookPlugins, isDir } from "../utils";

export function cli(api: PluginAPI, { packageManager, cwd }: Record<string, string>) {
	api.registerCommand("build [src] [dest]")
		.description("Build the current project into static files")
		.option("--clean", "Removes destination folder before building", false)
		.option("--dest <dir>", "Destination folder", "build")
		.option("--no-prerender", "Don't prerender URLs")
		.option("--production", "Sets the build as production build", false)
		.option("--brotli", "Enable Brotli compression", false)
		.action(async (src?: string, dest?: string, argv?: Record<string, any>) => {
			cwd = argv && argv.cwd !== undefined ? argv.cwd : cwd;
			src = !!src ? path.join(cwd, src) : cwd;
			dest = path.join(src, dest || argv.dest || "build");
			api.debug("%o", { cwd, src, dest });
			// Set new values back into argv object
			Object.assign(argv, { src, dest, cwd });
			const pm = getPackageManager(packageManager);
			const modules = path.resolve(src, "./node_modules");
			if (!isDir(modules)) {
				api.setStatus(
					`No 'node_modules' folder found! Please run ${chalk.magenta(
						pm.getInstallCommand()
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

			try {
				await runWebpack(api, argv, async config => (await hookPlugins(program)).hookWebpackChain(config));
			} catch (err) {
				api.setStatus(`Error! ${err}`, "fatal");
			}
		});
}
