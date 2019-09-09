import fs from "fs";
import path from "path";
import { Command, CommanderStatic, CommandOptions } from "commander";
import _debug from "debug";
import ora from "ora";
import Config from "webpack-chain";
import mkdirp from "mkdirp";
import { renderTemplate } from "../lib/template";

type WebpackChainer = (webpack: Config) => void;

export const debug = _debug("@preact/cli:plugin");

export default class PluginAPI {
	public readonly debug: _debug.Debugger;
	private webpackChainers: WebpackChainer[];
	private spinner?: ora.Ora;
	constructor(
		private readonly base: string,
		public readonly id: string,
		public readonly importBase: string,
		private commander: CommanderStatic
	) {
		this.webpackChainers = [];
		if (debug.extend) this.debug = debug.extend(id);
		else this.debug = _debug(id.startsWith("@preact/cli") ? id : `@preact/cli:plugin:${id}`);
	}

	public setStatus(text?: string, type?: "info" | "error" | "fatal" | "success") {
		if (!this.spinner) this.spinner = ora({ color: "magenta", prefixText: this.id });
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
		return applyTemplateRecursive(
			base || this.base,
			fileOrFolder,
			Object.assign({}, { env: process.env, cwd: process.cwd() }, context)
		);
	}

	public async writeFileTree(files: Record<string, string>, base?: string) {
		if (base && !path.isAbsolute(base)) base = path.join(this.base, base);
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
	const fullPath = path.isAbsolute(fileOrFolder) ? fileOrFolder : path.join(base, fileOrFolder);
	return new Promise((resolve, reject) => {
		fs.exists(fullPath, exists => {
			if (!exists) reject(new Error("File or folder '" + fullPath + "' does not exist"));
			else
				fs.stat(fullPath, (err, stats) => {
					if (err) reject(err);
					else if (stats.isDirectory()) {
						fs.readdir(fullPath, (err, files) => {
							if (err) reject(err);
							else {
								debug("Reading files from directory %o: %O", fullPath, files);
								Promise.all(
									files
										.map(f => {
											const joined = path.join(fullPath, f);
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
						fs.readFile(fullPath, (err, data) => {
							if (err) reject(err);
							else
								resolve({
									[path.relative(base, fullPath)]: renderTemplate(data.toString(), context)
								});
						});
					} else if (stats.isSymbolicLink()) {
						fs.readlink(fullPath, (err, link) => {
							if (err) reject(err);
							else resolve(applyTemplateRecursive(base, link, context));
						});
					}
				});
		});
	});
}
