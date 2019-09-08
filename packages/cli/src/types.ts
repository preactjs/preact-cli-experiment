import { PackageManager } from "./api/PackageManager";
import { Argv as BuildArgv } from "./plugins/build";
import Config = require("webpack-chain");
import { CommanderStatic } from "commander";

export type CLIArguments = Record<string, any> & {
	version: string;
	cwd: string;
	pm: PackageManager;
	debug: boolean;
};

export type CommandArguments<T> = { parent: CommanderStatic } & T;

export type WebpackEnvironment<T> = CLIArguments & BuildArgv & T;
export type WebpackEnvExtra = WebpackEnvironment<{
	isProd: boolean;
	isWatch: boolean;
	source: (src: string) => string;
}>;
export type WebpackTransformer = (config: Config) => PromiseLike<Config> | Config;
