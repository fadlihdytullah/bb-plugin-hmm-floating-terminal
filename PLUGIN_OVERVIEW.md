A shell where the work is: a floating, tabbed terminal window over any thread —
or over no thread at all — without leaving the conversation for a panel or
another app.

## What you get

- A terminal glyph in the thread header that opens a floating window on that
  thread's environment; each pane of a split layout gets its own.
- A launcher in the sidebar footer that works with no thread selected,
  including on the new-thread screen. It opens a global shell in your home
  directory.
- Tabs in the window's title bar: `+` adds another shell in the same scope, `x`
  closes one. A thread's tabs are its own; the global tabs are shared.
- Ctrl and backtick to toggle the window from the keyboard.
- A resizable window: drag its top-left grip, or minimize and maximize it from
  the title bar. Minimizing keeps every shell attached.

## How it works

BB already runs terminal sessions. This plugin asks for them in the thread's
scope, or in your home directory on the connected machine, and attaches xterm
to the host's live socket. Nothing is proxied through the plugin, and closing
the window leaves every shell running — reopening replays the scrollback and
picks up where you left off. Closing a tab is what ends a shell.

## Requirements

BB 0.42 or newer with Plugin SDK 0.4.47 or newer. No account, service, or
separate install.
