import { PackageManager } from "./api/PackageManager";

export type CLIArguments = Record<string, any> & {
	cwd: string;
	pm: PackageManager;
	debug: boolean;
};

export type CommandArguments<T> = CLIArguments & T;
