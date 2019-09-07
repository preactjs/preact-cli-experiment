import { resolve } from "path";
import program from "commander";
import _debug from "debug";

import { version } from "../package.json";
import { hookPlugins } from "./utils";
import PluginAPI from "./api/plugin";
import chalk from "chalk";

const debug = _debug("@preact/cli");

program.version(version);

hookPlugins(program).then(registry => {
	["new"].forEach(name => {
		const importPath = require.resolve(resolve(__dirname, "plugins", name));
		debug("Hooking internal plugin " + chalk.blue(name));
		registry.add(
			new PluginAPI(process.env.PREACT_CLI_CWD || process.cwd(), `@preact/cli:${name}`, importPath, program)
		);
	});
	registry.invoke("cli", program.opts());
	program.parse(process.argv);
});
