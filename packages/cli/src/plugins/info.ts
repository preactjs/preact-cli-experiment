import chalk from "chalk";
import envinfo from "envinfo";
import PluginAPI from "../api/plugin";
import { CLIArguments } from "../types";

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("info")
		.description("Outputs information about your system. Used to troubleshoot issues.")
		.action(async () => {
			everyLine(
				`${chalk.magenta("Environment information")}:${await envinfo.run({
					System: ["OS", "CPU"],
					Binaries: ["Node", "Yarn", "npm"],
					Browsers: ["Chrome", "Edge", "Firefox", "Safari"],
					npmPackages: ["preact", "@preact/cli", "preact-router", "preact-render-to-string"],
					npmGlobalPackages: ["@preact/cli"]
				})}`,
				s => api.setStatus(s, "info")
			);
		});
}

function everyLine(input: string, cb: (s: string) => void): void {
	input.split("\n").forEach(cb);
}
