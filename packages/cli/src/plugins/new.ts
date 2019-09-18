import path from "path";
import mkdirp from "mkdirp";

import PluginAPI from "../api/plugin";
import { getPackageManager } from "../api/PackageManager";
import chalk from "chalk";
import { addScripts, initGit } from "../setup";
import { CommandArguments, CLIArguments } from "../types";
import { QuestionCollection } from "inquirer";

type Argv = CommandArguments<{ install: boolean; git: boolean; license: string }>;
interface Features {
	name: string;
	dir: string;
	features: string[];
}

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("new [name] [dir]")
		.option("--no-install", "Disable installation after project generation")
		.option("--license <license>", "Sets the project open-source license", "MIT")
		.option("--git", "Initialize a Git repository")
		.description("Creates a new Preact project")
		.action(async (name: string, dir?: string, argv?: Argv) => {
			const features = await api.prompt(getQuestions(name, dir));
			if (!dir) dir = "./" + name;
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
					preact: "^10.0.0-rc.1"
				},
				devDependencies: features.features.reduce<Record<string, string>>(
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
			}

			api.setStatus("Invoking plugins...");
			await api.getRegistry().then(r => r.invoke("install", opts));

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
			}
		});
}

function getQuestions(name?: string, dir?: string): QuestionCollection<Features> {
	return [
		{
			type: "input",
			name: "name",
			message: "Name of the project",
			when: name === undefined
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
