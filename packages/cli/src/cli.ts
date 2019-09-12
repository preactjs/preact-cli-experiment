#!/usr/bin/env node
import { resolve } from "path";
import program from "commander";
import _debug from "debug";

import { hookPlugins } from "./utils";
import PluginAPI from "./api/plugin";
import chalk from "chalk";
import { getPackageManager } from "./api/PackageManager";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("../package");
const debug = _debug("@preact/cli");

program.version(version);
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

hookPlugins(program).then(registry => {
	const argv = program.parseOptions(process.argv);
	const opts = program.opts();
	["build", "create", "info", "new"].forEach(name => {
		const importPath = require.resolve(resolve(__dirname, "plugins", name));
		debug("Hooking internal plugin " + chalk.blue(name));
		registry.add(
			new PluginAPI(process.env.PREACT_CLI_CWD || process.cwd(), `@preact/cli:${name}`, importPath, program)
		);
	});
	registry.invoke("cli", opts);
	program.parse([...argv.args, ...argv.unknown]);
});
