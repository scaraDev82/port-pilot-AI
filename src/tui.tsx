import React, {useEffect, useState} from "react";
import {Box, Text, useApp, useInput} from "ink";
import chalk from "chalk";
import {formatMemory, isDevProcess, isHighMemoryProcess} from "./format.js";
import {
  getListeningPorts,
  getPortDetails,
  killPortProcess,
  openPortInBrowser,
  openProjectInEditor
} from "./system.js";
import type {PortProcessInfo} from "./types.js";

const REFRESH_INTERVAL_MS = 3000;
const FILTERS = ["all", "dev", "node"] as const;

type FilterMode = (typeof FILTERS)[number];

export function PortsApp() {
  const {exit} = useApp();
  const [rows, setRows] = useState<PortProcessInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("Loading listening ports...");
  const [showDetails, setShowDetails] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);

  useEffect(() => {
    let active = true;

    const refresh = async (reason?: string) => {
      try {
        const data = await getListeningPorts();
        if (!active) {
          return;
        }

        setRows(data);
        setSelectedIndex((current) => Math.min(current, Math.max(data.length - 1, 0)));
        setStatus(reason ?? `Updated ${new Date().toLocaleTimeString()}`);
      } catch (error) {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Refresh failed: ${message}`);
      }
    };

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const visibleRows = rows.filter(
    (row) => matchesFilter(row, filterMode) && matchesSearch(row, isSearchActive ? searchDraft : searchQuery)
  );
  const selected = visibleRows[selectedIndex] ?? null;

  useInput((input, key) => {
    if (isSearchActive) {
      if (key.escape) {
        setIsSearchActive(false);
        setSearchDraft("");
        setSearchQuery("");
        setSelectedIndex(0);
        setShowDetails(false);
        return;
      }

      if (key.return) {
        setIsSearchActive(false);
        setSearchQuery(searchDraft);
        setSelectedIndex(0);
        setShowDetails(false);
        return;
      }

      if (key.backspace || key.delete) {
        setSearchDraft((current) => current.slice(0, -1));
        setSelectedIndex(0);
        setShowDetails(false);
        return;
      }

      if (!key.ctrl && !key.meta && input) {
        setSearchDraft((current) => current + input);
        setSelectedIndex(0);
        setShowDetails(false);
      }

      return;
    }

    if (input === "/") {
      setIsSearchActive(true);
      setSearchDraft(searchQuery);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(current + 1, Math.max(visibleRows.length - 1, 0)));
      return;
    }

    if (input === "q") {
      exit();
      return;
    }

    if (input === "r") {
      void manualRefresh(setRows, setSelectedIndex, setStatus);
      return;
    }

    if (input === "f") {
      setFilterMode((current) => nextFilterMode(current));
      setSelectedIndex(0);
      setShowDetails(false);
      return;
    }

    if (key.return && selected) {
      setShowDetails((current) => !current);
      return;
    }

    if ((input === "k" || input === "K") && selected) {
      void handleKill(selected.port, setRows, setSelectedIndex, setStatus);
      return;
    }

    if (input === "o" && selected) {
      void handleOpenBrowser(selected.port, setStatus);
      return;
    }

    if (input === "e" && selected) {
      void handleOpenEditor(selected, setStatus);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyanBright">ports</Text>
      <Text dimColor>Live listening TCP ports. Refreshes every 3 seconds.</Text>
      <Box marginTop={1} flexDirection="column">
        <Header />
        <Text dimColor>{`Filter: ${getFilterLabel(filterMode)}${searchQuery ? `  Search: ${searchQuery}` : ""}`}</Text>
        {visibleRows.length === 0 ? (
          <Text color="yellow">No listening TCP ports found.</Text>
        ) : (
          visibleRows.map((row, index) => (
            <Row key={`${row.pid}-${row.port}`} row={row} selected={index === selectedIndex} />
          ))
        )}
      </Box>

      {showDetails && selected ? (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text color="green">Selected port details</Text>
          <Text>Port: {selected.port}</Text>
          <Text>Project: {selected.projectName ?? "-"}</Text>
          <Text>Framework: {selected.framework}</Text>
          <Text>PID: {selected.pid}</Text>
          <Text>Memory: {formatMemory(selected.rssKb)}</Text>
          <Text>Uptime: {selected.elapsed ?? "-"}</Text>
          <Text>Command: {selected.command}</Text>
          <Text>Working dir: {selected.cwd ?? "-"}</Text>
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        <Text>{status}</Text>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑↓ Move  / Search  Enter Details  F Filter  R Refresh  K Kill  O Open localhost  E Open project  Q Quit
        </Text>
      </Box>

      {isSearchActive ? (
        <Box marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text color="cyan">{`/ ${searchDraft}`}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function Header() {
  return (
    <Text bold>
      {pad("PORT", 7)}
      {pad("PROJECT", 22)}
      {pad("FRAMEWORK", 12)}
      {pad("PID", 8)}
      {pad("MEM", 10)}
      {pad("UPTIME", 12)}
      COMMAND
    </Text>
  );
}

function Row({row, selected}: {row: PortProcessInfo; selected: boolean}) {
  const isHeavy = isHighMemoryProcess(row);
  const isDev = isDevProcess(row);
  const backgroundColor = selected ? "cyan" : undefined;
  const defaultColor = selected ? "black" : isHeavy ? "red" : undefined;
  const frameworkColor = selected ? "black" : isHeavy ? "red" : row.framework === "Unknown" ? "gray" : "green";
  const portColor = selected ? "black" : isHeavy ? "red" : "cyan";
  const dimColor = !selected && !isHeavy && !isDev;

  return (
    <Box>
      <Text color={portColor} backgroundColor={backgroundColor} dimColor={dimColor}>
        {pad(String(row.port), 7)}
      </Text>
      <Text color={defaultColor} backgroundColor={backgroundColor} dimColor={dimColor}>
        {pad(row.projectName ?? "-", 22)}
      </Text>
      <Text color={frameworkColor} backgroundColor={backgroundColor} dimColor={dimColor}>
        {pad(row.framework, 12)}
      </Text>
      <Text color={defaultColor} backgroundColor={backgroundColor} dimColor={dimColor}>
        {pad(String(row.pid), 8)}
      </Text>
      <Text color={selected ? "black" : isHeavy ? "red" : defaultColor} backgroundColor={backgroundColor} dimColor={dimColor}>
        {pad(formatMemory(row.rssKb), 10)}
      </Text>
      <Text color={defaultColor} backgroundColor={backgroundColor} dimColor={dimColor}>
        {pad(row.elapsed ?? "-", 12)}
      </Text>
      <Text color={defaultColor} backgroundColor={backgroundColor} dimColor={dimColor}>
        {row.command}
      </Text>
    </Box>
  );
}

function pad(value: string, width: number): string {
  const trimmed = value.length > width - 1 ? `${value.slice(0, width - 2)}…` : value;
  return trimmed.padEnd(width);
}

async function manualRefresh(
  setRows: React.Dispatch<React.SetStateAction<PortProcessInfo[]>>,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  setStatus: React.Dispatch<React.SetStateAction<string>>
) {
  try {
    const data = await getListeningPorts();
    setRows(data);
    setSelectedIndex((current) => Math.min(current, Math.max(data.length - 1, 0)));
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Refresh failed: ${message}`);
  }
}

async function handleKill(
  port: number,
  setRows: React.Dispatch<React.SetStateAction<PortProcessInfo[]>>,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  setStatus: React.Dispatch<React.SetStateAction<string>>
) {
  try {
    const details = await getPortDetails(port);
    if (!details) {
      setStatus(`Port ${port} is already free.`);
      return;
    }

    const result = await killPortProcess(port);
    if (!result) {
      setStatus(`Port ${port} is already free.`);
      return;
    }

    const nextRows = await getListeningPorts();
    setRows(nextRows);
    setSelectedIndex((current) => Math.min(current, Math.max(nextRows.length - 1, 0)));
    setStatus(chalk.green(`Killed PID ${details.pid} on port ${port} with ${result.signal}.`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Kill failed: ${message}`);
  }
}

async function handleOpenBrowser(
  port: number,
  setStatus: React.Dispatch<React.SetStateAction<string>>
) {
  try {
    await openPortInBrowser(port);
    setStatus(chalk.green(`Opened http://localhost:${port}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Open failed: ${message}`);
  }
}

async function handleOpenEditor(
  selected: PortProcessInfo,
  setStatus: React.Dispatch<React.SetStateAction<string>>
) {
  if (!selected.cwd) {
    setStatus(`No working directory found for PID ${selected.pid}.`);
    return;
  }

  try {
    const editor = await openProjectInEditor(selected.cwd);
    setStatus(chalk.green(`Opened ${selected.cwd} in ${editor}.`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Open failed: ${message}`);
  }
}

function nextFilterMode(current: FilterMode): FilterMode {
  const index = FILTERS.indexOf(current);
  return FILTERS[(index + 1) % FILTERS.length];
}

function matchesFilter(row: PortProcessInfo, filterMode: FilterMode): boolean {
  if (filterMode === "all") {
    return true;
  }

  if (filterMode === "dev") {
    return row.port >= 3000 && row.port <= 9999;
  }

  return isDevProcess(row);
}

function getFilterLabel(filterMode: FilterMode): string {
  switch (filterMode) {
    case "all":
      return "all ports";
    case "dev":
      return "dev ports";
    case "node":
      return "node only";
  }
}

function matchesSearch(row: PortProcessInfo, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    row.projectName ?? "",
    row.command,
    String(row.port)
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}
