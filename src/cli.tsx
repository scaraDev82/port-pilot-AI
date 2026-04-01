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
  .action(async () => {
    const rows = await getListeningPorts();
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
    const row = await killPortProcess(port);

    if (!row) {
      console.log(chalk.yellow(`Port ${port} is already free.`));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.green(`Killed ${row.command} (PID ${row.pid}) on port ${port}.`));
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
