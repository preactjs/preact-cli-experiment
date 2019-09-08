import { ChildProcess, ExecOptions } from "child_process";
import { execAsync, memoize } from "../utils";

export abstract class PackageManager {
	name: string;
	abstract getInstallCommand(): string;
	abstract getAddCommand(dev: boolean, ...packages: string[]): string;
	abstract getRemoveCommand(...packages: string[]): string;
	abstract getRunCommand(script: string, extraArguments?: string): string;
	async runInstall(options?: ExecOptions): Promise<ChildProcess> {
		return execAsync(this.getInstallCommand(), options);
	}
	async runAdd(dev: boolean, options: ExecOptions, ...packages: string[]) {
		return execAsync(this.getAddCommand(dev, ...packages), options);
	}
	async runRemove(options: ExecOptions, ...packages: string[]) {
		return execAsync(this.getRemoveCommand(...packages), options);
	}
	async runScript(command: string, extraArguments?: string, options?: ExecOptions) {
		return execAsync(this.getRunCommand(command, extraArguments), options);
	}
}

class NPM extends PackageManager {
	name = "npm";

	getInstallCommand(): string {
		return "npm install";
	}
	getAddCommand(dev: boolean, ...packages: string[]): string {
		return `npm i ${dev ? "--save-dev" : "--save"} ${packages.join(" ")}`;
	}
	getRemoveCommand(...packages: string[]): string {
		return `npm r --save ${packages.join(" ")}`;
	}
	getRunCommand(script: string, extraArguments = ""): string {
		return `npm run ${extraArguments} ${script}`;
	}
}

class Yarn extends PackageManager {
	name = "yarn";

	getInstallCommand(): string {
		return "yarn";
	}
	getAddCommand(dev: boolean, ...packages: string[]): string {
		return `yarn add${dev ? " --dev" : ""} ${packages.join(" ")}`;
	}
	getRemoveCommand(...packages: string[]): string {
		return `yarn remove ${packages.join(" ")}`;
	}
	getRunCommand(script: string, extraArguments = ""): string {
		return `yarn ${extraArguments} ${script}`;
	}
}

export const getPackageManager = memoize(_getPM);

function _getPM(name: string): PackageManager {
	switch (name) {
		case "yarn":
			return new Yarn();
		case "npm":
		default:
			return new NPM();
	}
}
