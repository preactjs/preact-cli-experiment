import { CLIArguments, CommandArguments } from "../types";
import PluginAPI from "../api/plugin";

type Argv = CommandArguments<{
	hook: string;
}>;

export function cli(api: PluginAPI, opts: CLIArguments) {
	api.registerCommand("invoke [plugin]")
		.description("Invokes plugin(s) to finish installation")
		.option("--hook [hook]", "Change hook to use (WARNING: internal)", "install")
		.action(async (plugin: string | undefined, argv: Argv) => {
			const registry = await api.getRegistry();
			if (plugin != undefined) {
				await registry.plugin(plugin).invoke("install", opts);
			} else await registry.invoke("install", opts);
			api.setStatus();
			api.setStatus("Done", "success");
		});
}
