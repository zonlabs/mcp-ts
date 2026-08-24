#!/usr/bin/env node
import { runCli } from "../cli.js";

const cliExitCode = await runCli(process.argv.slice(2));
process.exitCode ??= cliExitCode;
