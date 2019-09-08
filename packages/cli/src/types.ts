import { PackageManager } from "./api/PackageManager";
import { BuildArgv } from "./plugins/build";
import Config = require("webpack-chain");
import { CommanderStatic } from "commander";

export type CLIArguments = {
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
	src: string;
	esm?: boolean;
	pkg?: any;
	sw?: any;
	source(src: string): string;
	log(msg: string, mode?: "info" | "error" | "success" | "fata"): void;
}>;
export type WebpackTransformer = (config: Config) => PromiseLike<Config> | Config;
