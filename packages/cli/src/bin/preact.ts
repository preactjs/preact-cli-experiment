#!/usr/bin/env node
import { createProgram } from "../cli";

createProgram().then(({ run }) => run());
