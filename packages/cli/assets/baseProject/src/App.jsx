import { h } from "preact";

export default function Application() {
	return (<div id="app">
		<h1>Hello, {{ name }}!</h1>
		<p>This is your Preact app. It is a bit barebones, but we try not to give you <em>too</em> much boilerplate so that you can start clean.</p>
	</div>);
}
