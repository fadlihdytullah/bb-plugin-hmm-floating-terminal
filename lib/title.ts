export const TITLE = "Hmm floating terminal";

const NAMED = " · ";

export function titleFor(name: string): string {
  return `${TITLE}${NAMED}${name}`;
}

export function labelOf(title: string): string {
  if (!title.startsWith(TITLE)) return title;
  const rest = title.slice(TITLE.length);
  return rest.startsWith(NAMED) ? rest.slice(NAMED.length) : `Terminal${rest}`;
}
