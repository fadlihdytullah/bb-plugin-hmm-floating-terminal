A shell where the work is: a floating, tabbed terminal window that follows the
project you are in, without leaving the conversation for a panel or another app.

## What you get

- Open it once per project and it stays open for that project. Leave for
  another project and the window steps aside; come back and it returns with the
  same tabs and the same dev server still running.
- Tabs belong to the project checkout, not to a thread, so moving between a
  project's threads never costs you a shell.
- A launcher in the thread header and one in the sidebar footer, the second
  reachable with no project selected — on the new-thread screen it opens a
  global shell in your home directory.
- `+` in the title bar adds another shell in the same project, `x` closes one.
  The tab you were last on is the tab you come back to.
- Ctrl and backtick toggles the window for wherever you are.
- Drag the top-left grip to resize, or minimize and maximize from the title
  bar. Minimizing keeps every shell attached.

## How it works

BB already runs terminal sessions. This plugin asks for them in the project's
checkout, or in your home directory on the connected machine, and attaches
xterm to the host's live socket. Nothing is proxied through the plugin, and
closing the window leaves every shell running — reopening replays the
scrollback and picks up where you left off. Closing a tab is what ends a shell.

## Requirements

BB 0.42 or newer with Plugin SDK 0.4.47 or newer. No account, service, or
separate install.
