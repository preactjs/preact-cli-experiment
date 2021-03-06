import fs from "fs";
import path from "path";
import { promisify } from "util";
import mkdirp from "mkdirp";
import deepmerge from "deepmerge";
import { QuestionCollection } from "inquirer";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import chalk from "chalk";
import { addScripts, initGit } from "../setup";
import { CommandArguments, CLIArguments } from "../types";

type Argv = CommandArguments<{ install: boolean; git: boolean; license: string }>;
interface Features {
	name: string;
	dir: string;
	features: string[];
}

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("new [name] [dir]")
		.option("--no-install", "Disable installation after project generation")
		.option("--license <license>", "Sets the project open-source license", "MIT")
		.option("--git", "Initialize a Git repository")
		.description("Creates a new Preact project")
		.action(async (_name: string, _dir?: string, argv?: Argv) => {
			const { name, dir, features } = Object.assign(
				{ name: _name, dir: _dir || _name },
				await api.prompt(getQuestions(_name, _dir))
			);
			api.debug("Features %o", features);
			const fullDir = path.resolve(opts.cwd, dir);
			api.setStatus("Creating project in " + chalk.magenta(fullDir));
			mkdirp.sync(fullDir);

			const pkg = {
				name,
				version: "0.1.0",
				license: argv.license,
				author: {},
				scripts: addScripts(fullDir, opts.pm),
				dependencies: {
					preact: "^10.4.6",
					"preact-render-to-string": "^5.1.10",
				},
				devDependencies: features.reduce<Record<string, string>>(
					(obj, p) => Object.assign(obj, { [p]: "latest" }),
					{ "if-env": "latest", "@preact/cli": "^" + opts.version }
				)
			};

			const templateBase = path.join(__dirname, "../../assets/baseProject");
			const files = await api.applyTemplate(
				templateBase,
				{
					name,
					"npm-install": opts.pm.getInstallCommand(),
					"npm-run-dev": opts.pm.getRunCommand("dev"),
					"npm-run-build": opts.pm.getRunCommand("build"),
					"npm-run-serve": opts.pm.getRunCommand("serve"),
					"npm-run-test": opts.pm.getRunCommand("test")
				},
				templateBase
			);
			files["package.json"] = JSON.stringify(pkg, null, 2);
			api.debug("Writing file tree: %O", Object.keys(files));
			await api.writeFileTree(files, fullDir);
			if (argv.install) {
				api.setStatus("Installing dependencies");
				try {
					await opts.pm.runInstall({ cwd: fullDir });
				} catch (err) {
					api.setStatus(`Error! ${err}`, "error");
				}
				api.setStatus("Invoking plugins...");
				api.getRegistry.deleteCache();
				const addedDependencies = await api
					.getRegistry(fullDir)
					.then(r =>
						r.invoke<{ dependencies?: object; devDependencies?: object } | undefined>("install", opts)
					);
				const pkgPath = path.resolve(fullDir, "package.json");
				let pkg = await readFile(pkgPath).then(b => JSON.parse(b.toString()));
				pkg = deepmerge.all([pkg, ...addedDependencies.filter(Boolean)]);
				await writeFile(pkgPath, JSON.stringify(pkg, null, "\t"));
				api.setStatus("Installing plugins' additional dependencies...");
				await opts.pm.runInstall();
			}

			if (argv.git) {
				api.setStatus("Initializing git");
				await initGit(fullDir);
			}

			api.setStatus();

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
				if (features.length > 0) {
					api.setStatus(
						"\tYou also need to manually invoke plugins with " +
							chalk.magenta("preact invoke") +
							"after installing plugins."
					);
				}
			}
		});
}

function getQuestions(name?: string, dir?: string): QuestionCollection<Features> {
	return [
		{
			type: "input",
			name: "name",
			message: "Name of the project",
			when: name === undefined,
			default: name || ""
		},
		{
			type: "input",
			name: "dir",
			message: "Directory to use",
			when: dir === undefined,
			default: (a: { name?: string }) => dir || name || a.name || ""
		},
		{
			type: "checkbox",
			name: "features",
			message: "Select features",
			choices: [
				{
					value: "@preact/cli-plugin-typescript",
					name: "TypeScript"
				},
				...["sass", "less", "stylus"].map(v => ({
					value: `@preact/cli-plugin-${v}`,
					name: v.charAt(0).toUpperCase() + v.substring(1).toLowerCase()
				})),
				{
					value: "@preact/cli-plugin-eslint",
					name: "Linting"
				},
				{
					value: "@preact/cli-plugin-legacy-config",
					name: "Legacy preact.config.js support"
				}
			]
		}
	];
}
