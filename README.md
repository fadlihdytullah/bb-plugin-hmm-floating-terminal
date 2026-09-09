# Hmm Floating Terminal

Real shells in a floating, tabbed window, opened from the sidebar footer, the
thread header, or `Ctrl+``.

## Access

- **Sidebar footer** — always available, including on the new-thread screen and
  with no thread selected. Opens the global session, started in `~`.
- **Thread header** — the terminal glyph in the header action row, left of BB's
  own controls. Each pane in a split layout opens its own thread's terminal.
- **`Ctrl+``** — toggles the window for the thread you are looking at, or the
  global session when you are not looking at one.

The window is anchored bottom-right: drag the grip in its top-left corner to
resize, or use the header buttons to minimize (collapse to the tab bar) and
maximize (90% of the viewport, centered). Minimizing keeps the session
attached — the shell is not restarted.

## Tabs

`+` in the tab bar adds a shell in the same scope; `x` on a tab closes that
shell for good. Closing the last tab closes the window. Tabs are per scope: a
thread's tabs are its own, and the sidebar's global tabs are shared across the
app. Only the active tab is mounted — switching back replays the session's
scrollback from BB rather than restarting anything.

## What runs

The plugin does not spawn processes. `session_list` / `session_create` /
`session_close` ask BB for terminals (`bb.sdk.terminals`) titled
`Hmm floating terminal <n>` — scoped to the thread, or to the connected host's home
directory when there is no thread — and the frontend attaches xterm to the
host's own socket at `/ws/terminals/<id>`. Consequences worth knowing:

- The shell is the thread environment's default shell, started in its worktree;
  the global one starts in `~` on the first connected host.
- Closing the window leaves every session running. Reopening reattaches to
  them as tabs, with scrollback replayed; a build or an ssh session survives.
  Closing a *tab* kills that shell.
- Terminals you open in BB's own terminal panel are untouched — the plugin only
  reuses sessions it created itself.
- `bb terminal list --thread <id>` shows the session like any other.

## Development

```sh
npm install
node --test lib/frame.test.ts   # window geometry
npx tsc --noEmit
bb plugin build
bb plugin reload floating-terminal
```

`bb plugin dev .` rebuilds and reloads on every change.
