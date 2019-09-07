import { ChildProcess, ExecOptions } from "child_process";
import { execAsync, memoize } from "../utils";

export abstract class PackageManager {
	name: string;
	abstract getInstallCommand(): string;
	abstract getAddCommand(...packages: string[]): string;
	abstract getRemoveCommand(...packages: string[]): string;
	abstract getRunCommand(script: string): string;
	async runInstall(options?: ExecOptions): Promise<ChildProcess> {
		return execAsync(this.getInstallCommand(), options);
	}
	async runAdd(options: ExecOptions, ...packages: string[]) {
		return execAsync(this.getAddCommand(...packages), options);
	}
	async runRemove(options: ExecOptions, ...packages: string[]) {
		return execAsync(this.getRemoveCommand(...packages), options);
	}
	async runScript(command: string, options?: ExecOptions) {
		return execAsync(this.getRunCommand(command), options);
	}
}

class NPM extends PackageManager {
	name = "npm";

	getInstallCommand(): string {
		return "npm i";
	}
	getAddCommand(...packages: string[]): string {
		return `npm i --save ${packages.join(" ")}`;
	}
	getRemoveCommand(...packages: string[]): string {
		return `npm r --save ${packages.join(" ")}`;
	}
	getRunCommand(script: string): string {
		return `npm run ${script}`;
	}
}

class Yarn extends PackageManager {
	name = "yarn";

	getInstallCommand(): string {
		return "yarn";
	}
	getAddCommand(...packages: string[]): string {
		return `yarn add ${packages.join(" ")}`;
	}
	getRemoveCommand(...packages: string[]): string {
		return `yarn remove ${packages.join(" ")}`;
	}
	getRunCommand(script: string): string {
		return `yarn ${script}`;
	}
}

export const getPackageManager = memoize(_getPM);

function _getPM(name: string) {
	switch (name) {
		case "yarn":
			return new Yarn();
		case "npm":
		default:
			return new NPM();
	}
}
