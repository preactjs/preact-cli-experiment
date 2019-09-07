import path from "path";
import mkdirp from "mkdirp";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import chalk from "chalk";

export function cli(api: PluginAPI, { packageManager, cwd }: Record<string, any>) {
	api.registerCommand("new <name> [dir]")
		.description("Creates a new Preact project")
		.action(async (name: string, dir?: string, argv?: Record<string, any>) => {
			cwd = argv && argv.cwd ? argv.cwd : cwd;
			if (!dir) dir = "./" + name;
			const fullDir = path.resolve(cwd, dir);
			api.setStatus("Creating project in " + chalk.magenta(fullDir));
			mkdirp.sync(fullDir);

			const pkg = {
				name,
				version: "0.1.0",
				author: {},
				dependencies: {
					preact: "^10.0.0-rc1"
				},
				devDependencies: {
					"@preact/cli": "latest"
				}
			};
			const pm = getPackageManager(packageManager);
			const templateBase = path.join(__dirname, "../../assets/baseProject");
			const files = await api.applyTemplate(
				templateBase,
				{
					name,
					"npm-install": pm.getInstallCommand(),
					"npm-run-dev": pm.getRunCommand("dev"),
					"npm-run-build": pm.getRunCommand("build"),
					"npm-run-serve": pm.getRunCommand("serve"),
					"npm-run-test": pm.getRunCommand("test")
				},
				templateBase
			);
			files["package.json"] = JSON.stringify(pkg, null, 2);
			api.debug("Writing file tree: %O", files);
			await api.writeFileTree(files, fullDir);
			await pm.runInstall({ cwd });
			api.setStatus("Created project in " + chalk.magenta(fullDir), "success");
		});
}
