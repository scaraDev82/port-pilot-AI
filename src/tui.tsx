import React, {useEffect, useState} from "react";
import {Box, Text, useApp, useInput} from "ink";
import chalk from "chalk";
import {formatMemory} from "./format.js";
import {getListeningPorts, getPortDetails, killPortProcess} from "./system.js";
import type {PortProcessInfo} from "./types.js";

const REFRESH_INTERVAL_MS = 3000;

export function PortsApp() {
  const {exit} = useApp();
  const [rows, setRows] = useState<PortProcessInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("Loading listening ports...");
  const [showDetails, setShowDetails] = useState(false);

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

  const selected = rows[selectedIndex] ?? null;

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(current + 1, Math.max(rows.length - 1, 0)));
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

    if (key.return && selected) {
      setShowDetails((current) => !current);
      return;
    }

    if (input === "k" && selected) {
      void handleKill(selected.port, setRows, setSelectedIndex, setStatus);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyanBright">ports</Text>
      <Text dimColor>Live listening TCP ports. Refreshes every 3 seconds.</Text>
      <Box marginTop={1} flexDirection="column">
        <Header />
        {rows.length === 0 ? (
          <Text color="yellow">No listening TCP ports found.</Text>
        ) : (
          rows.map((row, index) => <Row key={`${row.pid}-${row.port}`} row={row} selected={index === selectedIndex} />)
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
        <Text dimColor>Keys: ↑ ↓ navigate, enter details, r refresh, k kill, q quit</Text>
      </Box>
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
  const text = [
    pad(String(row.port), 7),
    pad(row.projectName ?? "-", 22),
    pad(row.framework, 12),
    pad(String(row.pid), 8),
    pad(formatMemory(row.rssKb), 10),
    pad(row.elapsed ?? "-", 12),
    row.command
  ].join("");

  return <Text color={selected ? "black" : undefined} backgroundColor={selected ? "cyan" : undefined}>{text}</Text>;
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

    await killPortProcess(port);
    const nextRows = await getListeningPorts();
    setRows(nextRows);
    setSelectedIndex((current) => Math.min(current, Math.max(nextRows.length - 1, 0)));
    setStatus(chalk.green(`Killed PID ${details.pid} on port ${port}.`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Kill failed: ${message}`);
  }
}
