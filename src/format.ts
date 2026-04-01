import chalk from "chalk";
import type {PortProcessInfo} from "./types.js";

export function formatTable(rows: PortProcessInfo[]): string {
  if (rows.length === 0) {
    return chalk.yellow("No listening TCP ports found.");
  }

  const headers = ["PORT", "PROJECT", "FRAMEWORK", "PID", "MEM", "UPTIME", "COMMAND"];
  const matrix = rows.map((row) => [
    String(row.port),
    row.projectName ?? "-",
    row.framework,
    String(row.pid),
    formatMemory(row.rssKb),
    row.elapsed ?? "-",
    row.command
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...matrix.map((row) => row[index].length))
  );

  const headerLine = headers
    .map((header, index) => chalk.bold(header.padEnd(widths[index])))
    .join("  ");

  const body = matrix
    .map((row) =>
      row
        .map((cell, index) => colorizeCell(index, cell).padEnd(widths[index]))
        .join("  ")
    )
    .join("\n");

  return `${headerLine}\n${body}`;
}

export function formatDetails(row: PortProcessInfo): string {
  const entries: Array<[string, string]> = [
    ["Port", String(row.port)],
    ["Project", row.projectName ?? "-"],
    ["Framework", row.framework],
    ["PID", String(row.pid)],
    ["Memory", formatMemory(row.rssKb)],
    ["Uptime", row.elapsed ?? "-"],
    ["Command", row.command],
    ["Working dir", row.cwd ?? "-"],
    ["Started", row.startedAt ? row.startedAt.toLocaleString() : "-"]
  ];

  return entries
    .map(([label, value]) => `${chalk.bold(label.padEnd(12))} ${value}`)
    .join("\n");
}

export function formatMemory(rssKb: number | null): string {
  if (rssKb === null) {
    return "-";
  }

  const mb = rssKb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function colorizeCell(index: number, value: string): string {
  if (index === 0) {
    return chalk.cyan(value);
  }

  if (index === 2) {
    return value === "Unknown" ? chalk.gray(value) : chalk.green(value);
  }

  return value;
}
