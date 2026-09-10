// bb-plugin-hmm-floating-terminal — frontend.
//
// Three registrations drive one window: a launcher in the thread header's
// action row, a launcher in the sidebar footer that is reachable with no
// project open, and an app overlay that owns the floating window itself.
//
// The scope is the project you are looking at, not the thread and not whatever
// was last clicked. The window remembers which projects it is open in, so
// leaving a project hides it and returning shows that project's own tabs again
// with its dev script still running. A project's shells outlive its threads.
//
// No project on screen means no window: BB gives every thread a project, so a
// projectless route is the home screen, settings, or a panel — nowhere a shell
// belongs to.
//
// ponytail: one window follows the app-level project. A split layout showing
// two projects at once would need one window per pane.
//
// Terminal bytes never pass through the plugin server: once the tab list
// returns terminal ids, xterm attaches straight to the host's own
// `/ws/terminals/<id>` socket.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  definePluginApp,
  experimental_useCodeTheme,
  useBbContext,
  useRpc,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { clampSize, defaultSize, maxSize, type Size } from "@/lib/frame";
import { resolveScope, type LoadedTabs, type Tab } from "@/lib/scope";
import { cn } from "@/lib/utils";
import "@xterm/xterm/css/xterm.css";

/** Launcher -> window. A window event keeps the registrations independent:
 *  any one can mount first, and none needs a shared React tree. It carries no
 *  payload: the window reads the current project from its own context. */
const OPEN_EVENT = "hmm-floating-terminal:open";

type Mode = "normal" | "maximized" | "minimized";

/** A session is created before its pane exists; the pane resizes the PTY the
 *  moment it attaches, so this only has to be a sane shell width. */
const INITIAL_GRID = { cols: 80, rows: 24 };

/** ESC, built rather than written, so the source carries no control bytes. */
const ESC = String.fromCharCode(27);

/** Nerd Font first so powerline prompts render; every fallback is monospace. */
const FONT_FAMILY =
  '"MesloLGS Nerd Font", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "SFMono-Regular", Menlo, Consolas, monospace';

/** xterm's 16-colour palette, in ANSI order: `--ansi-0` is `black`. */
const ANSI = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

/** The palette BB paints its own terminal with. Reading the same variables is
 *  what keeps this window on the user's theme instead of xterm's defaults.
 *
 *  A throwaway span resolves each variable through `color`, so an `oklch()`
 *  or a chained `var()` reaches xterm as the plain `rgb()` string it parses. */
function xtermTheme(): ITheme {
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const read = (variable: string): string | undefined => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim();
    if (value === "") return undefined;
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const theme: ITheme = {
    background: read("--sidebar"),
    foreground: read("--foreground"),
    cursor: read("--foreground"),
    cursorAccent: read("--sidebar"),
    selectionBackground: read("--muted"),
    ...Object.fromEntries(
      ANSI.map((name, index) => [name, read(`--ansi-${index}`)]),
    ),
  };
  probe.remove();
  return theme;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** The host serves the terminal socket from the same origin that served this
 *  bundle — including through `bb connect`, where that origin is remote. */
function socketUrl(terminalId: string): string {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/ws/terminals/${encodeURIComponent(terminalId)}`;
  url.search = "";
  url.hash = "";
  return url.href;
}

/** One xterm bound to one existing session. A remount (bumped `attempt`, or a
 *  tab switch) is the reconnect path: the session lives on the server and the
 *  host replays its scrollback, so nothing is lost.
 *
 *  ponytail: only the active tab is mounted, so switching tabs costs a replay.
 *  Keep every pane mounted and hidden if that replay ever becomes visible. */
function TerminalPane({
  attempt,
  onReconnect,
  terminalId,
}: {
  attempt: number;
  onReconnect: () => void;
  terminalId: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The code theme carries both the palette and light/dark, and BB derives the
  // ANSI variables from it: when it changes, the terminal's colours are stale.
  const { mode, name } = experimental_useCodeTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    setFailure(null);
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: FONT_FAMILY,
      fontSize: 12,
      fontWeight: "400",
      fontWeightBold: "700",
      scrollback: 5000,
      theme: xtermTheme(),
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    term.focus();

    const socket = new WebSocket(socketUrl(terminalId));
    let disposed = false;

    const send = (message: unknown) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };

    const observer = new ResizeObserver(() => {
      // Minimizing hides the body; fitting a zero box would resize the PTY to
      // nothing and reflow the shell's output.
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      fit.fit();
      send({ type: "resize", cols: term.cols, rows: term.rows });
    });
    observer.observe(host);

    const input = term.onData((data) => {
      send({ type: "input", dataBase64: encodeBase64(data) });
    });

    socket.onopen = () => {
      send({ type: "resize", cols: term.cols, rows: term.rows });
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        type: string;
        chunk?: { dataBase64: string };
        message?: string;
      };
      if (message.type === "output" && message.chunk !== undefined) {
        term.write(decodeBase64(message.chunk.dataBase64));
        return;
      }
      if (message.type === "exited") {
        term.writeln(`\r\n${ESC}[2m[process exited]${ESC}[0m`);
        return;
      }
      if (message.type === "error") {
        setFailure(message.message ?? "Terminal error");
      }
    };
    socket.onerror = () => {
      if (!disposed) setFailure("Terminal connection failed");
    };
    socket.onclose = () => {
      if (!disposed) setFailure("Terminal disconnected");
    };

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      socket.close();
      term.dispose();
      termRef.current = null;
    };
  }, [attempt, terminalId]);

  useEffect(() => {
    const term = termRef.current;
    if (term !== null) term.options.theme = xtermTheme();
  }, [mode, name]);

  return (
    <div className="relative min-h-0 flex-1 bg-sidebar">
      <div className="absolute inset-0 p-2" ref={hostRef} />
      {failure === null ? null : (
        <div
          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2"
          role="alert"
        >
          <span className="min-w-0 truncate text-xs text-destructive">
            {failure}
          </span>
          <Button onClick={onReconnect} size="sm" variant="ghost">
            <Icon name="RotateCcw" className="size-3.5" />
            Reconnect
          </Button>
        </div>
      )}
    </div>
  );
}

function FloatingTerminalWindow() {
  const rpc = useRpc<typeof rpcContract>();
  const { projectId } = useBbContext();
  // Openness is per project, so navigating hides and shows the window on its
  // own instead of leaving one project's shells over another's — or over a
  // screen that has no project at all.
  const [openProjects, setOpenProjects] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const isOpen = projectId !== null && openProjects.has(projectId);
  // Tabs carry the scope they were loaded for; see `resolveScope`.
  const [loaded, setLoaded] = useState<LoadedTabs>(null);
  const [activeByScope, setActiveByScope] = useState<Record<string, string>>(
    {},
  );
  // `""` matches no loaded scope, so a projectless route resolves to no tabs.
  const scopeKey = projectId ?? "";
  const { tabs, activeId } = resolveScope(
    loaded,
    scopeKey,
    activeByScope[scopeKey],
  );
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState<Size>(() =>
    defaultSize(window.innerWidth, window.innerHeight),
  );

  const open = useCallback(() => {
    if (projectId === null) return;
    setOpenProjects((current) => new Set(current).add(projectId));
    setMode("normal");
  }, [projectId]);

  const close = useCallback(() => {
    if (projectId === null) return;
    setOpenProjects((current) => {
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
  }, [projectId]);

  useEffect(() => {
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key !== "`") return;
      // Capture phase: xterm would otherwise post the backtick to the shell
      // before a window-level listener ever saw the shortcut.
      event.preventDefault();
      event.stopPropagation();
      if (isOpen) {
        if (mode === "maximized") {
          setMode("minimized");
          return;
        }
        if (mode === "minimized") {
          setMode("maximized");
          return;
        }
        close();
        return;
      }
      open();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [close, isOpen, mode, open]);

  // The project's live sessions become the tabs; an empty scope gets its first.
  // This refires on every scope change, so returning to a project reads its
  // shells back from BB rather than trusting anything cached here.
  useEffect(() => {
    if (!isOpen || projectId === null) return;
    let cancelled = false;
    setLoadFailure(null);
    rpc.call("session_list", { projectId }).then(
      async (listed) => {
        const ready =
          listed.tabs.length > 0
            ? listed.tabs
            : [await rpc.call("session_create", { ...INITIAL_GRID, projectId })];
        if (cancelled) return;
        setLoaded({ scope: scopeKey, tabs: ready });
      },
      (cause: unknown) => {
        if (cancelled) return;
        setLoadFailure(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, rpc, scopeKey]);

  useEffect(() => {
    const onResize = () => {
      setSize((current) =>
        clampSize(current, window.innerWidth, window.innerHeight),
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const selectTab = (terminalId: string) => {
    setActiveByScope((current) => ({ ...current, [scopeKey]: terminalId }));
  };

  const addTab = () => {
    // Unreachable while the window renders, which needs a project; the guard is
    // what tells the compiler so.
    if (projectId === null) return;
    rpc.call("session_create", { ...INITIAL_GRID, projectId }).then(
      (created) => {
        setLoaded({ scope: scopeKey, tabs: [...tabs, created] });
        selectTab(created.terminalId);
      },
      (cause: unknown) => {
        setLoadFailure(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  const closeTab = (terminalId: string) => {
    // Optimistic: the pane unmounts now, and a failed close only leaves an
    // orphan session that BB's own terminal panel can still reach. The active
    // tab is derived from `tabs`, so it falls back on its own.
    const remaining = tabs.filter((tab) => tab.terminalId !== terminalId);
    setLoaded({ scope: scopeKey, tabs: remaining });
    // The last tab closing closes the window — an empty frame has no use.
    if (remaining.length === 0) close();
    void rpc.call("session_close", { terminalId });
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "normal") return;
    const grip = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY, ...size };
    grip.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      // Anchored bottom-right: dragging the grip up and left grows the window.
      setSize(
        clampSize(
          {
            width: origin.width + (origin.x - move.clientX),
            height: origin.height + (origin.y - move.clientY),
          },
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };
    const stop = () => {
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
    };
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
  };

  if (!isOpen) return null;

  const frame =
    mode === "maximized" ? maxSize(window.innerWidth, window.innerHeight) : size;

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl",
        mode === "maximized"
          ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          : "bottom-4 right-4",
      )}
      // Minimized drops the explicit box entirely: the bar shrinks to its own
      // tabs and buttons instead of keeping the window's width as dead space.
      style={
        mode === "minimized"
          ? undefined
          : { width: frame.width, height: frame.height }
      }
    >
      {mode === "normal" ? (
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 size-4 cursor-nwse-resize"
          onPointerDown={startResize}
        />
      ) : null}

      <div
        className={cn(
          "flex h-9 shrink-0 items-center gap-1 border-b border-border pr-1.5",
          // Extra left padding only where the resize grip sits.
          mode === "normal" ? "pl-5" : "pl-3",
          mode === "minimized" && "border-b-0",
        )}
      >
        <Icon
          name="Terminal"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        {mode === "minimized" ? null : (
          <div
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            role="tablist"
          >
            {tabs.map((tab) => (
              <div
                className={cn(
                  "flex shrink-0 items-center rounded",
                  tab.terminalId === activeId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground",
                )}
                key={tab.terminalId}
              >
                <button
                  aria-selected={tab.terminalId === activeId}
                  className="px-2 py-0.5 text-xs hover:text-foreground"
                  onClick={() => selectTab(tab.terminalId)}
                  role="tab"
                  title={tab.cwd}
                  type="button"
                >
                  {tab.label}
                </button>
                <button
                  aria-label={`Close ${tab.label}`}
                  className="px-1 py-0.5 hover:text-foreground"
                  onClick={() => closeTab(tab.terminalId)}
                  type="button"
                >
                  <Icon name="X" className="size-3" />
                </button>
              </div>
            ))}
            <Button
              aria-label="New terminal tab"
              className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={addTab}
              size="icon"
              variant="ghost"
            >
              <Icon name="Plus" className="size-3.5" />
            </Button>
          </div>
        )}
        <Button
          aria-label={
            mode === "minimized" ? "Restore terminal" : "Minimize terminal"
          }
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() =>
            setMode((current) =>
              current === "minimized" ? "normal" : "minimized",
            )
          }
          size="icon"
          variant="ghost"
        >
          <Icon
            name={mode === "minimized" ? "ChevronsUp" : "ChevronsDown"}
            className="size-3.5"
          />
        </Button>
        <Button
          aria-label={
            mode === "maximized" ? "Restore terminal size" : "Maximize terminal"
          }
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() =>
            setMode((current) =>
              current === "maximized" ? "normal" : "maximized",
            )
          }
          size="icon"
          variant="ghost"
        >
          <Icon
            name={mode === "maximized" ? "Minimize2" : "Maximize2"}
            className="size-3.5"
          />
        </Button>
        <Button
          aria-label="Close terminal"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={close}
          size="icon"
          variant="ghost"
        >
          <Icon name="X" className="size-3.5" />
        </Button>
      </div>

      {/* Kept mounted while minimized: unmounting would drop the socket and
          reflow the shell on every collapse. */}
      <div
        className={cn("flex min-h-0 flex-1", mode === "minimized" && "hidden")}
      >
        {loadFailure !== null ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center px-3 text-xs text-destructive"
            role="alert"
          >
            {loadFailure}
          </div>
        ) : activeId === null ? null : (
          <TerminalPane
            attempt={attempt}
            key={activeId}
            onReconnect={() => setAttempt((current) => current + 1)}
            terminalId={activeId}
          />
        )}
      </div>
    </div>
  );
}

function openTerminal(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function ThreadHeaderTerminalAction(_props: PluginThreadHeaderActionProps) {
  return (
    <Button
      aria-label="Floating terminal (Ctrl+`)"
      className="size-7 text-muted-foreground hover:text-foreground"
      onClick={openTerminal}
      size="icon"
      variant="ghost"
    >
      <Icon name="Terminal" className="size-4" />
    </Button>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "floating-terminal",
    component: FloatingTerminalWindow,
  });
  app.slots.experimental_threadHeaderAction({
    id: "floating-terminal",
    title: "Floating terminal",
    component: ThreadHeaderTerminalAction,
  });
  // Host-rendered, always mounted: the one launcher that survives the new-thread
  // screen and an empty project list.
  app.slots.sidebarFooterAction({
    id: "floating-terminal",
    title: "Floating terminal (Ctrl+`)",
    icon: "Terminal",
    run: openTerminal,
  });
});
