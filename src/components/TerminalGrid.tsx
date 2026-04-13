import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { spawn } from "tauri-pty";
import type { IPty } from "tauri-pty";
import { getThemeById, DEFAULT_THEME_ID } from "../lib/terminalThemes";
import "@xterm/xterm/css/xterm.css";
import "../styles/terminal-grid.css";

/* ------------------------------------------------------------------ */
/*  TerminalPreview — lightweight read-only terminal in a tile         */
/* ------------------------------------------------------------------ */

interface TerminalPreviewProps {
  cwd: string;
  shell: string;
  themeId?: string;
}

export function TerminalPreview({ cwd, shell, themeId }: TerminalPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const ptyRef = useRef<IPty | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const theme = getThemeById(themeId || DEFAULT_THEME_ID);
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', monospace",
      fontSize: 11,
      lineHeight: 1.3,
      theme: theme.theme,
      cursorBlink: false,
      scrollback: 1000,
      allowProposedApi: true,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    el.replaceChildren();
    term.open(el);

    // No WebGL — canvas renderer avoids browser context limits with many tiles.

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const initTimer = setTimeout(() => {
      if (cancelled) return;

      try {
        fitAddon.fit();
      } catch {
        // fit can throw if dimensions are 0
      }

      try {
        const pty = spawn(shell, [], {
          name: "xterm-256color",
          cols: Math.max(term.cols, 1),
          rows: Math.max(term.rows, 1),
          cwd,
          env: {
            TERM: "xterm-256color",
            TERM_PROGRAM: "workroot",
            COLORTERM: "truecolor",
          },
        });

        if (cancelled) {
          try {
            pty.kill();
          } catch {
            // ignore
          }
          return;
        }

        ptyRef.current = pty;

        pty.onData((data: string | Uint8Array) => {
          if (!termRef.current) return;
          term.write(data);
        });

        pty.onExit(() => {
          if (termRef.current) {
            term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
          }
        });
      } catch (err) {
        if (!cancelled && termRef.current) {
          term.write(
            `\r\n\x1b[31mFailed to spawn shell: ${err}\x1b[0m\r\n`,
          );
        }
      }
    }, 100);

    // ResizeObserver to refit when tile resizes
    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // ignore
        }
      }
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      observer.disconnect();
      try {
        ptyRef.current?.kill();
      } catch {
        // ignore
      }
      term.dispose();
      termRef.current = null;
      ptyRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cwd, shell, themeId]);

  return <div className="terminal-preview" ref={containerRef} />;
}
