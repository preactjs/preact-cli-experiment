import fs from "fs";
import path from "path";
import { Command, CommanderStatic, CommandOptions } from "commander";
import _debug from "debug";
import ora from "ora";
import Config from "webpack-chain";
import mkdirp from "mkdirp";
import inquirer from "inquirer";
import { PluginRegistry } from "./registry";
import { renderTemplate } from "../lib/template";
import { hookPlugins, memoize, memoizeAsync } from "../utils";

type WebpackChainer = (webpack: Config) => void;

export const debug = _debug("@preact/cli:plugin");

export default class PluginAPI {
	/// Outputs messages for debugging. Those messages are passed to the `debug` package, and can be shown with `DEBUG=*`
	public readonly debug: _debug.Debugger;
	private webpackChainers: WebpackChainer[];
	private spinner?: ora.Ora;
	private promptModule: inquirer.PromptModule;
	/**
	 * Initializes a new instance of a Preact CLI plugin
	 * @param base Base directory of the project, that is the root of it
	 * @param id Identifier for the plugin, internally defined as the package name
	 * @param importBase Resolved path to the plugin entrypoint
	 * @param commander commander instance for managing commands
	 */
	constructor(
		private readonly base: string,
		public readonly id: string,
		public readonly importBase: string,
		private commander: Command
	) {
		this.webpackChainers = [];
		if (debug.extend) this.debug = debug.extend(id);
		else this.debug = _debug(id.startsWith("@preact/cli") ? id : `@preact/cli:plugin:${id}`);
		this.promptModule = inquirer.createPromptModule();
	}

	/** Returns a prompt module from `inquirer`. */
	public get prompt() {
		return this.promptModule;
	}

	/**
	 * Sets the status, or stops the spinner.
	 * This method is used for feedback to the user about what is happening.
	 *
	 * **Tip**: In order to show a "final message", first stop the spinner by an argument-less call to this method, then
	 * print the message using the type argument.
	 * @param text Optional text changing the current status. If not defined, then the current status is used.
	 * @param type Type of status. If not defined, it changes the spinner text. If defined to one of the options, it
	 * outputs the text prefixed by an appropriate icon.
	 */
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

	/**
	 * Registers a command for the plugin.
	 * @param name Name and usage of the command; is passed to commander.command
	 * @param options Command options. Is passed to commander.command
	 */
	public registerCommand(name: string, options?: CommandOptions): Command {
		return this.commander.command(name, options);
	}

	/**
	 * Mutate the webpack configuration.
	 * @param chainer Callback function operating on a Config object from the `webpack-chain` package.
	 */
	public chainWebpack(chainer: WebpackChainer) {
		this.webpackChainers.push(chainer);
	}

	/**
	 * Render template from the file or files (and files in sub-folders).
	 * @returns An object with relative paths as keys and file contents as values. To be used with `writeFileTree`.
	 * @param fileOrFolder Input file or folder. If file, render the file; if folder, recursively render files and folders
	 * @param context Context object containing variables and their contents
	 * @param base Base folder to create relative paths from.
	 */
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

	/**
	 * Writes files onto disk.
	 * @param files Object of files to write, with keys representing relative paths and values their contents.
	 * @param base Base folder to create absolute paths from. If unspecified, the project root is used as base folder.
	 */
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

	/**
	 * Returns the Plugin Registry to interact with installed plugins
	 */
	public get getRegistry() {
		debug("Hooking plugins from %o", this.base);
		const f = async (cwd?: string) => hookPlugins(this.commander, cwd || this.base);
		f.deleteCache = () => hookPlugins.deleteCache();

		return f;
	}

	/**
	 * Return the list of webpack configuration transformer functions defined by the plugin.
	 * @ignore Internal function.
	 */
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
