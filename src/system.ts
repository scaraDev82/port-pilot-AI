import {readFile} from "node:fs/promises";
import path from "node:path";
import {execa} from "execa";
import type {Framework, KillResult, PortProcessInfo, ProjectInfo} from "./types.js";

interface LsofRow {
  command: string;
  pid: number;
  name: string;
}

const FRAMEWORK_DEPENDENCIES: Array<{framework: Framework; packages: string[]}> = [
  {framework: "Next.js", packages: ["next"]},
  {framework: "Astro", packages: ["astro"]},
  {framework: "Remix", packages: ["@remix-run/dev", "@remix-run/node", "@remix-run/react"]},
  {framework: "Nuxt", packages: ["nuxt"]},
  {framework: "SvelteKit", packages: ["@sveltejs/kit"]},
  {framework: "Angular", packages: ["@angular/core", "@angular/cli"]},
  {framework: "Vite", packages: ["vite"]}
];

export async function getListeningPorts(): Promise<PortProcessInfo[]> {
  const rows = await listListeningRows();
  const uniqueRows = dedupeRows(rows);

  const processes = await Promise.all(uniqueRows.map(async (row) => buildPortProcessInfo(row)));

  return processes
    .filter((item): item is PortProcessInfo => item !== null)
    .sort((a, b) => a.port - b.port || a.pid - b.pid);
}

export async function getPortDetails(port: number): Promise<PortProcessInfo | null> {
  const ports = await getListeningPorts();
  return ports.find((item) => item.port === port) ?? null;
}

export async function killPortProcess(port: number): Promise<KillResult | null> {
  const details = await getPortDetails(port);
  if (!details) {
    return null;
  }

  return killProcess(details);
}

export async function openPortInBrowser(port: number): Promise<void> {
  const url = `http://localhost:${port}`;
  await openTarget(url);
}

export async function openProjectInEditor(cwd: string): Promise<"Cursor" | "VS Code"> {
  if (await tryOpenWithCommand("cursor", [cwd])) {
    return "Cursor";
  }

  if (await tryOpenWithMacApp("Cursor", cwd)) {
    return "Cursor";
  }

  if (await tryOpenWithCommand("code", [cwd])) {
    return "VS Code";
  }

  if (await tryOpenWithMacApp("Visual Studio Code", cwd)) {
    return "VS Code";
  }

  throw new Error("Could not open the project folder in Cursor or VS Code.");
}

async function listListeningRows(): Promise<LsofRow[]> {
  const stdout = await runCommand("lsof", ["-iTCP", "-sTCP:LISTEN", "-P", "-n"]);

  const lines = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map(parseLsofLine).filter((row): row is LsofRow => row !== null);
}

function parseLsofLine(line: string): LsofRow | null {
  const match = line.match(/^(\S+)\s+(\d+)\s+\S+\s+.+?\s(TCP\s+.+)$/);
  if (!match) {
    return null;
  }

  const [, command, pidText, networkPart] = match;
  const name = networkPart.replace(/^TCP\s+/, "").trim();
  const pid = Number.parseInt(pidText, 10);

  if (!Number.isInteger(pid)) {
    return null;
  }

  return {command, pid, name};
}

function dedupeRows(rows: LsofRow[]): LsofRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const port = extractPort(row.name);
    if (port === null) {
      return false;
    }

    const key = `${row.pid}:${port}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function buildPortProcessInfo(row: LsofRow): Promise<PortProcessInfo | null> {
  const port = extractPort(row.name);
  if (port === null) {
    return null;
  }

  const [cwd, processStats] = await Promise.all([getProcessCwd(row.pid), getProcessStats(row.pid)]);
  const projectInfo = cwd ? await getProjectInfo(cwd) : emptyProjectInfo();

  return {
    port,
    pid: row.pid,
    command: row.command,
    cwd,
    rssKb: processStats.rssKb,
    elapsed: processStats.elapsed,
    startedAt: processStats.startedAt,
    projectName: projectInfo.projectName,
    framework: projectInfo.framework
  };
}

function extractPort(name: string): number | null {
  const cleanName = name.replace(/\s+\(LISTEN\)$/, "");
  const match = cleanName.match(/[:.]([0-9]+)$/);
  if (!match) {
    return null;
  }

  const port = Number.parseInt(match[1], 10);
  return Number.isInteger(port) ? port : null;
}

async function getProcessCwd(pid: number): Promise<string | null> {
  const stdout = await runCommand("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);

  const line = stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("n"));

  return line ? line.slice(1) : null;
}

async function getProcessStats(pid: number): Promise<{
  rssKb: number | null;
  elapsed: string | null;
  startedAt: Date | null;
}> {
  const stdout = await runCommand("ps", ["-o", "rss=,etime=", "-p", String(pid)]);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {rssKb: null, elapsed: null, startedAt: null};
  }

  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return {rssKb: null, elapsed: trimmed, startedAt: null};
  }

  const rssKb = Number.parseInt(match[1], 10);
  const elapsed = match[2].trim();

  return {
    rssKb: Number.isInteger(rssKb) ? rssKb : null,
    elapsed,
    startedAt: parseStartedAt(elapsed)
  };
}

function parseStartedAt(elapsed: string | null): Date | null {
  if (!elapsed) {
    return null;
  }

  const daySplit = elapsed.split("-");
  const timePart = daySplit[daySplit.length - 1] ?? "";
  const timeParts = timePart.split(":").map((part) => Number.parseInt(part, 10));

  if (timeParts.some((value) => Number.isNaN(value))) {
    return null;
  }

  let totalSeconds = 0;
  if (daySplit.length === 2) {
    const days = Number.parseInt(daySplit[0], 10);
    if (Number.isNaN(days)) {
      return null;
    }
    totalSeconds += days * 24 * 60 * 60;
  }

  if (timeParts.length === 3) {
    totalSeconds += timeParts[0] * 60 * 60 + timeParts[1] * 60 + timeParts[2];
  } else if (timeParts.length === 2) {
    totalSeconds += timeParts[0] * 60 + timeParts[1];
  } else {
    return null;
  }

  return new Date(Date.now() - totalSeconds * 1000);
}

async function getProjectInfo(startDir: string): Promise<ProjectInfo> {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    const packageJson = await readJsonFile(packageJsonPath);
    if (packageJson) {
      return {
        packageJsonPath,
        projectName: typeof packageJson.name === "string" ? packageJson.name : path.basename(currentDir),
        framework: detectFramework(packageJson)
      };
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return emptyProjectInfo();
    }

    currentDir = parentDir;
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectFramework(packageJson: Record<string, unknown>): Framework {
  const dependencies = packageJson.dependencies as Record<string, unknown> | undefined;
  const devDependencies = packageJson.devDependencies as Record<string, unknown> | undefined;
  const allPackages = new Set([
    ...Object.keys(dependencies ?? {}),
    ...Object.keys(devDependencies ?? {})
  ]);

  for (const entry of FRAMEWORK_DEPENDENCIES) {
    if (entry.packages.some((dependency) => allPackages.has(dependency))) {
      return entry.framework;
    }
  }

  return "Unknown";
}

function emptyProjectInfo(): ProjectInfo {
  return {
    packageJsonPath: null,
    projectName: null,
    framework: "Unknown"
  };
}

async function runCommand(command: string, args: string[]): Promise<string> {
  try {
    const {stdout} = await execa(command, args, {reject: false});
    return stdout;
  } catch {
    return "";
  }
}

async function killProcess(details: PortProcessInfo): Promise<KillResult> {
  process.kill(details.pid, "SIGTERM");
  await delay(1000);

  if (!(await processExists(details.pid))) {
    return {process: details, signal: "SIGTERM"};
  }

  process.kill(details.pid, "SIGKILL");
  return {process: details, signal: "SIGKILL"};
}

async function processExists(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "ESRCH") {
      return false;
    }

    if (code === "EPERM") {
      return true;
    }

    return false;
  }
}

async function openTarget(target: string): Promise<void> {
  if (process.platform === "darwin") {
    await execa("open", [target]);
    return;
  }

  if (process.platform === "win32") {
    await execa("cmd", ["/c", "start", "", target]);
    return;
  }

  await execa("xdg-open", [target]);
}

async function tryOpenWithCommand(command: string, args: string[]): Promise<boolean> {
  try {
    await execa(command, args);
    return true;
  } catch {
    return false;
  }
}

async function tryOpenWithMacApp(appName: string, target: string): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }

  try {
    await execa("open", ["-a", appName, target]);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as {code?: string}).code)
    : undefined;
}
