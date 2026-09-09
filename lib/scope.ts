// What the window shows for the scope it is currently looking at.
//
// Both rules exist because the window outlives a project switch: the tab list
// it holds may belong to the project the user just left, and the tab it
// remembers for this project may have been closed since. Getting either wrong
// puts a pane — and a live socket — on another project's shell.

export type Tab = { terminalId: string; label: string; cwd: string };

/** The tab list loaded from BB, tagged with the scope it was loaded for. */
export type LoadedTabs = { scope: string; tabs: readonly Tab[] } | null;

export type ScopeView = { tabs: readonly Tab[]; activeId: string | null };

export function resolveScope(
  loaded: LoadedTabs,
  scopeKey: string,
  remembered: string | undefined,
): ScopeView {
  // Tabs from another scope are not this scope's tabs, they are nothing yet.
  const tabs = loaded !== null && loaded.scope === scopeKey ? loaded.tabs : [];
  const activeId =
    remembered !== undefined &&
    tabs.some((tab) => tab.terminalId === remembered)
      ? remembered
      : (tabs[0]?.terminalId ?? null);
  return { tabs, activeId };
}
