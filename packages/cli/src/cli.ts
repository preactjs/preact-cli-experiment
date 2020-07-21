import { resolve } from "path";
import * as commander from "commander";
import _debug from "debug";

import { hookPlugins } from "./utils";
import PluginAPI from "./api/plugin";
import chalk from "chalk";
import { getPackageManager } from "./api/PackageManager";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("../package");
const debug = _debug("@preact/cli");

export interface CommandObject {
	program: commander.Command;
	run: () => void;
}

export async function createProgram(argv?: string[]): Promise<CommandObject> {
	if (!argv) argv = process.argv;
	const program = new commander.Command();
	program.allowUnknownOption(false).name("preact").version(version);
	program.option("--cwd <cwd>", "Sets working directory", process.env.PREACT_CLI_CWD || process.cwd());
	program.option(
		"--pm <pm>",
		"Sets package manager",
		getPackageManager,
		getPackageManager(process.env.PREACT_CLI_PACKAGE_MANAGER || "npm")
	);
	program.option("-d, --debug", "Activate debug options");

	program.on("option:debug", () => {
		console.log(
			`${chalk.magenta("WARNING!")} Debug mode is verbose and ${chalk.bold(
				"will"
			)} slow down the program as well as clogging down your stdout.`
		);
		_debug.enable("@preact/cli");
	});

	const parsedArgs = program.parseOptions(argv);
	debug("Parsed arguments: %o", parsedArgs);
	const opts = program.opts();
	debug("Parsed options: %o", opts);
	await hookPlugins(program, opts.cwd).then((registry) => {
		debug("opts %O", opts);
		["add", "build", "create", "info", "invoke", "new"].forEach((name) => {
			const importPath = require.resolve(resolve(__dirname, "plugins", name));
			registry.add(new PluginAPI(opts.cwd, `@preact/cli:${name}`, importPath, program));
		});
		return registry.invoke("cli", opts);
	});
	return {
		program,
		run: () => {
			debug("Parsing arguments... %o", argv);
			program.parse(argv);
		},
	};
}
