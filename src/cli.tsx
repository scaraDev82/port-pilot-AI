import React from "react";
import {render} from "ink";
import chalk from "chalk";
import {Command} from "commander";
import {formatDetails, formatTable} from "./format.js";
import {getPortDetails, getListeningPorts, killPortProcess} from "./system.js";
import {PortsApp} from "./tui.js";

const program = new Command();

program
  .name("ports")
  .description("Inspect and manage listening TCP ports on your machine.")
  .action(() => {
    render(<PortsApp />);
  });

program
  .command("list")
  .description("Print a static table of all listening ports.")
  .option("--json", "Output the listening port data as JSON")
  .action(async (options: {json?: boolean}) => {
    const rows = await getListeningPorts();
    if (options.json) {
      console.log(JSON.stringify(rows.map(toJsonRow), null, 2));
      return;
    }

    console.log(formatTable(rows));
  });

program
  .command("check")
  .description("Show detailed information about a single port.")
  .argument("<port>", "Port number to inspect")
  .action(async (portText: string) => {
    const port = parsePort(portText);
    const row = await getPortDetails(port);

    if (!row) {
      console.log(chalk.yellow(`Port ${port} is free.`));
      process.exitCode = 1;
      return;
    }

    console.log(formatDetails(row));
  });

program
  .command("kill")
  .description("Kill the process listening on a port.")
  .argument("<port>", "Port number to kill")
  .action(async (portText: string) => {
    const port = parsePort(portText);
    const result = await killPortProcess(port);

    if (!result) {
      console.log(chalk.yellow(`Port ${port} is already free.`));
      process.exitCode = 1;
      return;
    }

    console.log(
      chalk.green(
        `Killed ${result.process.command} (PID ${result.process.pid}) on port ${port} with ${result.signal}.`
      )
    );
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exitCode = 1;
});

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return port;
}

function toJsonRow(row: Awaited<ReturnType<typeof getListeningPorts>>[number]) {
  return {
    port: row.port,
    pid: row.pid,
    command: row.command,
    projectName: row.projectName,
    framework: row.framework,
    memoryKB: row.rssKb,
    uptime: row.elapsed
  };
}
