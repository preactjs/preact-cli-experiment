import chalk from "chalk";
import _debug from "debug";

const debug = _debug("@preact/cli:lib/template");

export function renderTemplate(input: string, context: Record<string, string>): string {
	const dict = new Map<RegExp, string>();
	Object.keys(context).forEach(k => dict.set(templateVar(k), context[k]));
	const result = [...dict.entries()].reduce((text, [regex, value]) => text.replace(regex, value), input);
	if (debug.enabled) {
		const match = result.match(/{{\s?([a-z\-_][a-z0-9\-_]*)\s?}}/gi);
		if (match && match.length > 0) {
			console.warn(
				"The following variables weren't found: " + chalk.yellow([...new Set(match).values()].join(", "))
			);
		}
	}
	return result;
}

export const templateVar = (str: string) => new RegExp(`{{\\s?${str}\\s?}}`, "g");
