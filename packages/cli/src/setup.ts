import util from "util";
import _which from "which";
import { PackageManager } from "./api/PackageManager";
import { execAsync } from "./utils";

const which = util.promisify(_which);

const GIT_AUTHOR_NAME = "Preact CLI";
const GIT_AUTHOR_EMAIL = "preact-cli@users.noreply.github.com";

export function addScripts(cwd: string, pm: PackageManager) {
	return {
		build: "preact build",
		start: `if-env NODE_ENV=production && ${pm.getRunCommand("serve", "-s")} || ${pm.getRunCommand("watch", "-s")}`,
		watch: "preact watch"
	};
}

export async function initGit(folder: string): Promise<boolean> {
	const hasGit = await which("git")
		.then(_ => true)
		.catch(_ => false);

	if (hasGit) {
		const cwd = folder;
		await execAsync("git init", { cwd });
		await execAsync("git add -A", { cwd });

		const gitUser = await execAsync("git config user.name", { cwd })
			.then<string>(c => c.stdout)
			.catch(_ => "Preact CLI");
		const gitEmail = await execAsync("git config user.email", { cwd })
			.then<string>(c => c.stdout)
			.catch(_ => "preact-cli@users.noreply.github.com");

		await execAsync('git commit -m"Initial commit from Preact CLI"', {
			cwd,
			env: {
				GIT_COMMITTER_NAME: gitUser,
				GIT_COMMITTER_EMAIL: gitEmail,
				GIT_AUTHOR_NAME,
				GIT_AUTHOR_EMAIL
			}
		});
	}

	return hasGit;
}
