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
    .map((row, rowIndex) =>
      row
        .map((cell, index) => colorizeCell(rows[rowIndex], index, cell).padEnd(widths[index]))
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

export function isNodeRuntime(command: string): boolean {
  const normalized = command.toLowerCase();
  return normalized.includes("node") || normalized.includes("deno") || normalized.includes("bun");
}

export function isDevProcess(row: PortProcessInfo): boolean {
  return row.framework !== "Unknown" || isNodeRuntime(row.command);
}

export function isHighMemoryProcess(row: PortProcessInfo): boolean {
  if (row.rssKb === null) {
    return false;
  }

  return row.rssKb / 1024 > 500;
}

function colorizeCell(row: PortProcessInfo, index: number, value: string): string {
  let styled = value;

  if (index === 0) {
    styled = chalk.cyan(value);
  } else if (index === 2) {
    styled = value === "Unknown" ? chalk.gray(value) : chalk.green(value);
  } else if (index === 4 && isHighMemoryProcess(row)) {
    styled = chalk.red(value);
  }

  if (isHighMemoryProcess(row) && index !== 4) {
    styled = chalk.red(styled);
  } else if (!isDevProcess(row)) {
    styled = chalk.dim(styled);
  }

  return styled;
}
