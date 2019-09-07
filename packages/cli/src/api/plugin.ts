import fs from "fs";
import path, { join } from "path";
import { Command, CommanderStatic, CommandOptions } from "commander";
import _debug from "debug";
import ora from "ora";
import Config from "webpack-chain";
import mkdirp from "mkdirp";
import chalk from "chalk";

type WebpackChainer = (webpack: Config) => void;

const debug = _debug("@preact/cli:plugin");

export default class PluginAPI {
	public readonly debug: _debug.Debugger;
	private webpackChainers: WebpackChainer[];
	private spinner: ora.Ora;
	constructor(
		private readonly base: string,
		public readonly id: string,
		public readonly importBase: string,
		private commander: CommanderStatic
	) {
		this.webpackChainers = [];
		this.spinner = ora({ color: "magenta", prefixText: id, text: "Invoking plugin..." });
		if (debug.extend) this.debug = debug.extend(id);
		else this.debug = _debug(`@preact/cli:plugin:${id}`);
	}

	public setStatus(text?: string, type?: "info" | "error" | "fatal" | "success") {
		if (text) {
			switch (type) {
				case "fatal":
					this.spinner.fail(text);
					process.exit(1);
					break;
				case "error":
					this.spinner.fail(text);
					break;
				case "success":
					this.spinner.succeed(text);
					break;
				case "info":
					this.spinner.info(text);
					break;
				default:
					this.spinner.start(text);
			}
		} else if (type) {
			switch (type) {
				case "fatal":
					this.spinner.fail();
					process.exit(1);
					break;
				case "error":
					this.spinner.fail();
					break;
				case "success":
					this.spinner.succeed();
					break;
				case "info":
					this.spinner.info();
					break;
				default:
					this.spinner.stopAndPersist();
					break;
			}
		} else this.spinner.stopAndPersist();
	}

	public registerCommand(name: string, options?: CommandOptions): Command {
		return this.commander.command(name, options);
	}

	public chainWebpack(chainer: WebpackChainer) {
		this.webpackChainers.push(chainer);
	}

	public async applyTemplate(
		fileOrFolder: string,
		context: Record<string, string>,
		base?: string
	): Promise<Record<string, string>> {
		const fullPath = path.resolve(process.cwd(), fileOrFolder);
		this.debug("Reading as template %o", fullPath);
		return applyTemplateRecursive(
			base || this.base,
			fullPath,
			Object.assign({}, { env: process.env, cwd: process.cwd() }, context)
		);
	}

	public async writeFileTree(files: Record<string, string>, base?: string) {
		return Promise.all(
			Object.keys(files).map(file => {
				const fullPath = path.join(base || this.base, file);
				if (!fs.existsSync(path.dirname(fullPath))) {
					mkdirp.sync(path.dirname(fullPath));
				}
				return new Promise<void>((resolve, reject) => {
					this.debug("Writing to path %o", fullPath);
					fs.writeFile(fullPath, files[file], err => {
						if (err) reject(err);
						else resolve();
					});
				});
			})
		);
	}

	public getChains(): WebpackChainer[] {
		return this.webpackChainers.slice();
	}
}

async function applyTemplateRecursive(
	base: string,
	fileOrFolder: string,
	context: Record<string, string>
): Promise<Record<string, string>> {
	return new Promise((resolve, reject) => {
		fs.exists(fileOrFolder, exists => {
			if (!exists) reject(new Error("File or folder '" + fileOrFolder + "' does not exist"));
			else
				fs.stat(fileOrFolder, (err, stats) => {
					if (err) reject(err);
					else if (stats.isDirectory()) {
						fs.readdir(fileOrFolder, (err, files) => {
							if (err) reject(err);
							else {
								debug("Reading files from directory %o: %O", fileOrFolder, files);
								Promise.all(
									files
										.map(f => {
											const joined = path.join(fileOrFolder, f);
											if (path.isAbsolute(joined)) return joined;
											return path.resolve(base, "./" + joined);
										})
										.map(file => applyTemplateRecursive(base, file, context))
								)
									.then(files => files.reduce((obj, file) => Object.assign(obj, file), {}))
									.then(resolve)
									.catch(reject);
							}
						});
					} else if (stats.isFile()) {
						fs.readFile(fileOrFolder, (err, data) => {
							if (err) reject(err);
							else
								resolve({
									[path.relative(base, fileOrFolder)]: renderTemplate(data.toString(), context)
								});
						});
					} else if (stats.isSymbolicLink()) {
						fs.readlink(fileOrFolder, (err, link) => {
							if (err) reject(err);
							else resolve(applyTemplateRecursive(base, link, context));
						});
					}
				});
		});
	});
}

function renderTemplate(input: string, context: Record<string, string>): string {
	const templateVar = (str: string) => new RegExp(`{{\\s?${str}\\s?}}`, "g");
	const dict = new Map<RegExp, string>();
	Object.keys(context).forEach(k => dict.set(templateVar(k), context[k]));

	for (const item of dict.entries()) {
		input = input.replace(item[0], item[1]);
	}
	if (debug.enabled) {
		const match = input.match(/{{\s?([a-z\-_][a-z0-9\-_]*)\s?}}/gi);
		if (match && match.length > 0) {
			console.warn(
				"The following variables weren't found: " + chalk.yellow([...new Set(match).values()].join(", "))
			);
		}
	}
	return input;
}
