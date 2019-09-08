import path from "path";
import mkdirp from "mkdirp";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import chalk from "chalk";
import { addScripts } from "../setup";
import { CommandArguments } from "../types";

type Argv = CommandArguments<{ install: boolean }>;

export function cli(api: PluginAPI) {
	api.registerCommand("new <name> [dir]")
		.option("--no-install", "Disable installation after project generation")
		.description("Creates a new Preact project")
		.action(async (name: string, dir?: string, argv?: Argv) => {
			if (!dir) dir = "./" + name;
			const fullDir = path.resolve(argv.cw, dir);
			api.setStatus("Creating project in " + chalk.magenta(fullDir));
			mkdirp.sync(fullDir);

			const pkg = {
				name,
				version: "0.1.0",
				author: {},
				scripts: addScripts(fullDir, argv.pm),
				dependencies: {
					preact: "^10.0.0-rc.1"
				},
				devDependencies: {
					"@babel/plugin-syntax-dynamic-import": "latest",
					"@babel/plugin-transform-object-assign": "latest",
					"@babel/plugin-proposal-decorators": "latest",
					"@babel/plugin-proposal-class-properties": "latest",
					"@babel/plugin-proposal-object-rest-spread": "latest",
					"babel-plugin-transform-react-remove-prop-types": "latest",
					"@babel/plugin-transform-react-jsx": "latest",
					"fast-async": "latest",
					"babel-plugin-macros": "latest",
					"react-hot-loader": "latest",
					"if-env": "latest"
				}
			};

			const templateBase = path.join(__dirname, "../../assets/baseProject");
			const files = await api.applyTemplate(
				templateBase,
				{
					name,
					"npm-install": argv.pm.getInstallCommand(),
					"npm-run-dev": argv.pm.getRunCommand("dev"),
					"npm-run-build": argv.pm.getRunCommand("build"),
					"npm-run-serve": argv.pm.getRunCommand("serve"),
					"npm-run-test": argv.pm.getRunCommand("test")
				},
				templateBase
			);
			files["package.json"] = JSON.stringify(pkg, null, 2);
			api.debug("Writing file tree: %O", Object.keys(files));
			await api.writeFileTree(files, fullDir);
			if (argv.install) {
				api.setStatus("Installing dependencies");
				try {
					await argv.pm.runInstall({ cwd: fullDir });
				} catch (err) {
					api.setStatus(`Error! ${err}`, "error");
				}
			}
			api.setStatus("Created project in " + chalk.magenta(fullDir), "success");
			api.setStatus("You can now start working on your project!", "info");
			api.setStatus(`\t${chalk.green("cd")} ${chalk.magenta(path.relative(process.cwd(), fullDir))}`, "info");
			if (!argv.install) {
				api.setStatus(
					`\tInstall dependencies with ${["npm", "yarn"]
						.map(getPackageManager)
						.map(pm => chalk.magenta(pm.getInstallCommand()))
						.join(" or ")}`,
					"info"
				);
			}
		});
}
