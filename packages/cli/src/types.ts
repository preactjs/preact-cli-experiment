import Config from "webpack-chain";
import { PackageManager } from "./api/PackageManager";
import { CommanderStatic } from "commander";

export interface CLIArguments {
	version: string;
	cwd: string;
	pm: PackageManager;
	debug: boolean;
}
export interface WebpackBuildExtra {
	isProd: boolean;
	isWatch: boolean;
	src: string;
	pkg: any;
	manifest?: any;
	source(src: string): string;
	log(msg?: string, mode?: "info" | "error" | "success" | "fatal"): void;
}

export type CommandArguments<T> = { parent: CommanderStatic } & T;

export type WebpackEnvironment<T> = CLIArguments & T;
export type WebpackTransformer = (config: Config) => PromiseLike<Config> | Config;

export type Common<T1, T2> = Partial<T1> & Partial<T2> & Pick<T1 & T2, keyof (T1 | T2)>;
