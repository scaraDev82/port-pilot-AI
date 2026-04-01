export type Framework =
  | "Next.js"
  | "Astro"
  | "Vite"
  | "Remix"
  | "Nuxt"
  | "SvelteKit"
  | "Angular"
  | "Unknown";

export interface ProjectInfo {
  packageJsonPath: string | null;
  projectName: string | null;
  framework: Framework;
}

export interface PortProcessInfo {
  port: number;
  pid: number;
  command: string;
  cwd: string | null;
  rssKb: number | null;
  elapsed: string | null;
  startedAt: Date | null;
  projectName: string | null;
  framework: Framework;
}

export interface KillResult {
  process: PortProcessInfo;
  signal: "SIGTERM" | "SIGKILL";
}
