A shell where the work is: a floating, tabbed terminal window over any project —
or over no project at all — without leaving the conversation for a panel or
another app.

## What you get

- A terminal glyph in the thread header that opens a floating window in the
  project's checkout. The shells belong to the project, so moving between its
  threads keeps the same tabs and the same running dev script.
- A launcher in the sidebar footer that works with no project selected,
  including on the new-thread screen. It opens a global shell in your home
  directory.
- Tabs in the window's title bar: `+` adds another shell in the same scope, `x`
  closes one. Each project's tabs are its own; the global tabs are separate.
- Ctrl and backtick to toggle the window from the keyboard.
- A resizable window: drag its top-left grip, or minimize and maximize it from
  the title bar. Minimizing keeps every shell attached.

## How it works

BB already runs terminal sessions. This plugin asks for them in the project's
checkout, or in your home directory on the connected machine, and attaches
xterm to the host's live socket. Nothing is proxied through the plugin, and
closing the window leaves every shell running — reopening replays the
scrollback and picks up where you left off. Closing a tab is what ends a shell.

## Requirements

BB 0.42 or newer with Plugin SDK 0.4.47 or newer. No account, service, or
separate install.
