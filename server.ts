// bb-plugin-hmm-floating-terminal — backend.
//
// BB already owns the PTYs: `bb.sdk.terminals` starts a session in the thread's
// scope and the host streams it at `/ws/terminals/<id>`. This server therefore
// only decides *which* sessions a scope has, and creates or closes them; the
// frontend attaches to the host socket directly instead of proxying every byte
// through the plugin.
import { homedir } from "node:os";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Marks the sessions this plugin owns, so terminals opened in BB's own panel
 *  are never hijacked by the floating window. Tabs are `<TITLE> <n>`. */
const TITLE = "Hmm floating terminal";

/** Null opens the global session — the launcher is reachable with no thread
 *  selected, and that shell belongs to the home directory. */
const scopeInput = z.object({ threadId: z.string().min(1).nullable() }).strict();

const tabOutput = z
  .object({ terminalId: z.string(), label: z.string(), cwd: z.string() })
  .strict();

export const rpcContract = defineRpcContract({
  session_list: {
    input: scopeInput,
    output: z.object({ tabs: z.array(tabOutput) }).strict(),
  },
  session_create: {
    input: scopeInput.extend({
      cols: z.number().int().min(1),
      rows: z.number().int().min(1),
    }),
    output: tabOutput,
  },
  session_close: {
    input: z.object({ terminalId: z.string().min(1) }).strict(),
    output: z.object({}).strict(),
  },
});

/** `"Floating terminal 3"` → `"Terminal 3"`; anything else stays as it is. */
function labelOf(title: string): string {
  return title.startsWith(TITLE) ? `Terminal${title.slice(TITLE.length)}` : title;
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  // ponytail: first connected host wins; add a host picker if the global
  // terminal ever needs to target more than one machine.
  const scopeOf = async (threadId: string | null) => {
    if (threadId !== null) {
      return { kind: "thread", threadId } as const;
    }
    const hosts = await bb.sdk.hosts.list();
    const host = hosts.find((one) => one.status === "connected") ?? hosts[0];
    if (host === undefined) {
      throw new Error("No BB host available for a global terminal");
    }
    return { kind: "host_path", hostId: host.id, cwd: homedir() } as const;
  };

  /** The plugin's own live sessions in one scope, in BB's order. */
  const own = async (threadId: string | null) => {
    const { sessions } = await bb.sdk.terminals.list({
      scope: await scopeOf(threadId),
    });
    return sessions.filter(
      (session) =>
        session.title !== null &&
        session.title.startsWith(TITLE) &&
        (session.status === "running" || session.status === "starting"),
    );
  };

  bb.rpc.register(rpcContract, {
    // Reopening the window reattaches to the live shells: closing it must not
    // cost the user their history, their ssh session, or a running build.
    session_list: async ({ threadId }) => ({
      tabs: (await own(threadId)).map((session) => ({
        terminalId: session.id,
        label: labelOf(session.title ?? TITLE),
        cwd: session.initialCwd,
      })),
    }),

    session_create: async ({ cols, rows, threadId }) => {
      const taken = new Set(
        (await own(threadId)).map((session) => session.title),
      );
      let index = 1;
      while (taken.has(`${TITLE} ${index}`)) {
        index += 1;
      }
      const title = `${TITLE} ${index}`;
      const created = await bb.sdk.terminals.create({
        cols,
        rows,
        scope: await scopeOf(threadId),
        title,
      });
      bb.log.info(`opened ${created.id} in ${created.initialCwd}`);
      return {
        terminalId: created.id,
        label: labelOf(title),
        cwd: created.initialCwd,
      };
    },

    session_close: async ({ terminalId }) => {
      await bb.sdk.terminals.close({ terminalId, mode: "force" });
      return {};
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
