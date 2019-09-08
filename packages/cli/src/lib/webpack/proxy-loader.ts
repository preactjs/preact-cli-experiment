import utils from "loader-utils";
import requireRelative from "require-relative";
import { loader } from "webpack";
import { RawSourceMap } from "source-map";

export default function proxyLoader(this: loader.LoaderContext, source: string | Buffer, map: RawSourceMap) {
	const options = utils.getOptions(this);

	// First run proxy-loader run
	if (!this.query.__proxy_loader__) {
		// Store passed options for future calls to proxy-loader with same loaderContext (this)
		// e.g. calls via 'this.addDependency' from actual loader
		// eslint-disable-next-line @typescript-eslint/camelcase
		this.query.__proxy_loader__ = { loader: options.loader, cwd: options.cwd };

		// Remove proxy-loader options and make this.query act as requested loader query
		swapOptions(this, options.options);
	}
	const proxyOptions = this.query.__proxy_loader__;

	let loader: loader.Loader;
	try {
		loader = requireRelative(proxyOptions.loader, proxyOptions.cwd);
	} catch (e) {
		loader = require(proxyOptions.loader);
	}

	// Run actual loader
	return loader.call(this, source, map);
}

function swapOptions(loaderContext: loader.LoaderContext, newOptions: any) {
	const copy: any = {};
	let key = "";

	for (key in newOptions) {
		copy[key] = newOptions[key];
	}

	// Delete all existing loader options
	delete loaderContext.query.options;
	delete loaderContext.query.loader;
	delete loaderContext.query.cwd;

	// Add new options
	for (key in copy) {
		loaderContext.query[key] = copy[key];
	}
}
