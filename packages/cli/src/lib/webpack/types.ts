import { WebpackEnvironment, WebpackBuildExtra, Common } from "../../types";

import { BuildArgv, WatchArgv } from "../../plugins/build";

export type WebpackEnvironmentBuild = WebpackEnvironment<BuildArgv & WebpackBuildExtra>;
export type WebpackEnvironmentWatch = WebpackEnvironment<WatchArgv & WebpackBuildExtra>;

export type CommonWebpackEnv = Common<WebpackEnvironmentBuild, WebpackEnvironmentWatch>;
