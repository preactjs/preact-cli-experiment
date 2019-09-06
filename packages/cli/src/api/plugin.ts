import fs from "fs";
import path from "path";
import { Command, CommanderStatic, CommandOptions } from "commander";
import _debug from "debug";
import Config from "webpack-chain";
import chalk from "chalk";
import mkdirp from "mkdirp";

type WebpackChainer = (webpack: Config) => void;

export default class PluginAPI {
	private webpackChainers: WebpackChainer[];
	private debug: _debug.Debugger;
	constructor(
		private readonly base: string,
		public readonly id: string,
		public readonly importBase: string,
		private commander: CommanderStatic
	) {
		this.webpackChainers = [];
		this.debug = _debug(`plugin:${id}`);
	}

	public registerCommand(name: string, options?: CommandOptions): Command {
		return this.commander.command(name, options);
	}

	public chainWebpack(chainer: WebpackChainer) {
		this.webpackChainers.push(chainer);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async applyTemplate(
		fileOrFolder: string,
		context: Record<string, string>,
		base?: string
	): Promise<Record<string, string>> {
		const fullPath = path.resolve(process.cwd(), fileOrFolder);
		this.debug(`Reading as template: ${chalk.grey(fullPath)}`);
		return applyTemplateRecursive(base || this.base, fileOrFolder, Object.assign({}, process, context));
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
		fs.stat(fileOrFolder, (err, stats) => {
			if (err) reject(err);
			if (stats.isDirectory()) {
				fs.readdir(fileOrFolder, (err, files) => {
					if (err) reject(err);
					else
						Promise.all(
							files
								.map(f => path.resolve(base, path.join(fileOrFolder, f)))
								.map(file => applyTemplateRecursive(base, file, context))
						)
							.then(files => files.reduce((obj, file) => Object.assign(obj, file), {}))
							.then(resolve)
							.catch(reject);
				});
			} else if (stats.isFile()) {
				fs.readFile(fileOrFolder, (err, data) => {
					if (err) reject(err);
					// TODO: Actually to templating
					else resolve({ [path.relative(base, fileOrFolder)]: data.toString() });
				});
			}
		});
	});
}
