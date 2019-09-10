/* eslint-disable @typescript-eslint/camelcase */
import fs from "fs";
import path from "path";
import util from "util";
import _glob from "glob";
import inquirer from "inquirer";
import isValidName from "validate-npm-package-name";
import _mkdirp from "mkdirp";
import gittar from "gittar";
import { isDir } from "../utils";
import PluginAPI from "../api/plugin";
import { CLIArguments, CommandArguments } from "../types";
import { renderTemplate } from "../lib/template";
import chalk from "chalk";
import { addScripts, initGit } from "../setup";
import { getPackageManager } from "../api/PackageManager";

type CreateArgv = CommandArguments<{
	install: boolean;
	license: string;
	git: boolean;
}>;
interface ExtraArgs {
	template?: string;
	name?: string;
	dest?: string;
}

const ORG = "preacjs-templates";
const MEDIA_EXT = /\.(woff2?|ttf|eot|jpe?g|ico|png|gif|webp|mp4|mov|ogg|webm)(\?.*)?$/i;

const mkdirp = util.promisify(_mkdirp);
const copyFile = util.promisify(fs.copyFile);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const glob = util.promisify(_glob);

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("create [template] <name> [dest]")
		.description("Legacy command to create a project from either the official template, or a user-defined one")
		.option("--no-install", "Disable package-manager installation of dependencies")
		.option("--license <license>", "License to use", "MIT")
		.option("--git", "Setup a git repository")
		.action(async (template: string | undefined, name: string, dest: string | undefined, argv: CreateArgv) => {
			const answers = await api.prompt(
				requestMissingParams(api, Object.assign({ template, name, dest }, argv, opts))
			);
			const { cwd, ...finalOptions }: CLIArguments & CreateArgv & Required<ExtraArgs> = Object.assign(
				{ template, name, dest },
				argv,
				opts,
				answers
			);
			const target = path.resolve(cwd, finalOptions.dest);
			const { errors } = isValidName(finalOptions.name);
			if (exists(errors)) {
				errors.unshift("Invalid package name: " + finalOptions.name);
				(errors as string[]).map(capitalize).forEach(e => api.setStatus(e, "error"));
				api.setStatus(undefined, "fatal");
			}
			if (!finalOptions.template.includes("/")) {
				template = `${ORG}/${finalOptions.name}`;
				api.setStatus(`Assuming you meant ${template}...`, "info");
			}
			const sourceFolder = path.resolve(target, "src");
			if (!fs.existsSync(sourceFolder)) {
				await util.promisify(mkdirp)(sourceFolder);
			}

			api.setStatus("Fetching template");

			const archive = await gittar.fetch(template).catch(err => {
				err = err || { message: "An error occured while fetching template." };

				return api.setStatus(err.code === 404 ? `Could not find repository ${template}` : err.message);
			});

			api.setStatus("Creating project");

			const keeps: any[] = [];
			await gittar.extract(archive, target, {
				strip: 2,
				filter(path: string, obj: any) {
					if (path.includes("/template/")) {
						obj.on("end", () => {
							if (obj.type === "File" && MEDIA_EXT.test(obj.path)) {
								keeps.push(obj.absolute);
							}
						});
					}
				}
			});

			if (keeps.length) {
				const context = {
					"pkg-install": opts.pm.getInstallCommand(),
					"pkg-run": opts.pm.getRunCommand(""),
					"pkg-add": opts.pm.getAddCommand(false, ""),
					"now-year": new Date().getFullYear().toFixed(),
					license: argv.license,
					name
				};

				let buf: string;
				const enc = "utf8";
				for (const entry of keeps) {
					buf = await util.promisify(fs.readFile)(entry, enc);
					await util.promisify(fs.writeFile)(entry, renderTemplate(buf, context), enc);
				}
			} else {
				api.setStatus(
					`No ${chalk.magenta("template")} directory found within ${chalk.magenta(template)}`,
					"fatal"
				);
			}

			api.setStatus("Parsing " + chalk.green("package.json"));

			const pkgFile = path.resolve(target, "package.json");
			if (fs.existsSync(pkgFile)) {
				const pkgData = JSON.parse(
					await util
						.promisify(fs.readFile)(pkgFile)
						.then(b => b.toString())
				);
				pkgData.scripts = exists(pkgData.scripts)
					? Object.assign(pkgData.scripts, addScripts(cwd, opts.pm))
					: addScripts(cwd, opts.pm);
				api.setStatus(`Updating ${chalk.magenta("name")} in ${chalk.green("package.json")}`);
				pkgData.name = finalOptions.name.toLowerCase().replace(/\s+/g, "_");

				const manifestFiles = await glob(path.join(target, "/**/manifest.json"));
				const manifest = exists(manifestFiles[0])
					? JSON.parse(await readFile(manifestFiles[0]).then(b => b.toString()))
					: null;
				if (manifest !== null) {
					api.setStatus(`Updating ${chalk.magenta("name")} within ${chalk.green("manifest.json")}`);
					manifest.name = manifest.short_name = finalOptions.name;
					await writeFile(manifestFiles[0], JSON.stringify(manifest, null, 2));
					if (finalOptions.name.length > 12) {
						api.setStatus(
							`You should edit the ${chalk.magenta("short_name")} property of your ${chalk.green(
								"manifest.json"
							)} to shorten it to max. 12 characters long.`,
							"info"
						);
					}
				}

				await writeFile(pkgFile, JSON.stringify(pkgData, null, 2));
			} else {
				api.setStatus("Couldn't find " + chalk.green("package.json"), "fatal");
			}

			const templateSrc = path.resolve(__dirname, "../../assets/template.html");
			await copyFile(templateSrc, target);

			if (finalOptions.install) {
				api.setStatus("Installing dependencies");
				await opts.pm.runInstall();
			}

			if (finalOptions.git) {
				api.setStatus("Initializing git");
				if (!(await initGit(target).catch(_ => false))) {
					api.setStatus("Couldn't initialize git!", "error");
				}
			}

			api.setStatus("Done!", "success");

			api.setStatus("Created project in " + chalk.magenta(target), "success");
			api.setStatus("You can now start working on your project!", "info");
			api.setStatus(`\t${chalk.green("cd")} ${chalk.magenta(path.relative(process.cwd(), target))}`, "info");
			if (!argv.install) {
				api.setStatus(
					`\tInstall dependencies with ${["npm", "yarn"]
						.map(getPackageManager)
						.map(pm => chalk.magenta(pm.getInstallCommand()))
						.join(" or ")}`,
					"info"
				);
			}
			api.setStatus();
		});
}

function requestMissingParams(
	api: PluginAPI,
	argv: CLIArguments & CreateArgv & ExtraArgs
): inquirer.QuestionCollection {
	return [
		{
			type: "select",
			when: !exists(argv.template),
			name: "template",
			message: "Pick a template",
			choices: [
				{
					value: "preactjs-templates/default",
					title: "Default (JavaScript)",
					description: "Default template with all features"
				},
				{
					value: "preactjs-templates/typescript",
					title: "Default (TypeScript)",
					description: "Default template with all features"
				},
				{
					value: "preactjs-templates/material",
					title: "Material",
					description: "Material template using preact-material-components"
				},
				{
					value: "preactjs-templates/simple",
					title: "Simple",
					description: "The simplest possible preact setup in a single file"
				},
				{
					value: "preactjs-templates/widget",
					title: "Widget",
					description: "Template for a widget to be embedded in another website"
				},
				new inquirer.Separator(),
				{
					value: "custom",
					title: "Custom",
					description: "Use your own template"
				}
			],
			initial: 0
		},
		{
			type: "input",
			when: answers => answers.template === "custom",
			name: "template",
			message: "Remote template to clone (user/repo#tag)"
		},
		{
			type: "input",
			when: !exists(argv.dest),
			name: "dest",
			message: "Directory to create the app"
		},
		{
			type: "confirm",
			when: answers => isDir(path.resolve(argv.cwd, answers.dest || argv.dest)),
			name: "force",
			message: "The destination directory exists. Overwrite?",
			initial: false,
			validate: input => {
				if (!input) api.setStatus("Aborting due to existing folder", "fatal");
				return input;
			}
		},
		{
			type: "input",
			when: !exists(argv.name),
			name: "name",
			message: "Name of your application",
			validate: name => exists(isValidName(name).errors)
		},
		{
			type: "confirm",
			name: "install",
			message: "Install dependencies",
			initial: true
		}
	];
}

function exists<T>(obj: T | undefined): obj is T {
	return typeof obj !== undefined;
}

const capitalize = (x: string) => x.charAt(0).toLowerCase() + x.substr(1);
