// bb-plugin-hmm-floating-terminal — backend.
//
// BB already owns the PTYs: `bb.sdk.terminals` starts a session and the host
// streams it at `/ws/terminals/<id>`. This server therefore only decides *which*
// sessions a scope has, and creates or closes them; the frontend attaches to the
// host socket directly instead of proxying every byte through the plugin.
//
// The scope is the project's checkout, not a thread. A thread-scoped session
// would vanish the moment the user opened another thread in the same project,
// stranding a running dev script in a scope nothing links back to.
import { homedir } from "node:os";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { labelOf, TITLE, titleFor } from "./lib/title.ts";

/** Every scope is a project: BB has no thread without one, and the window is
 *  hidden wherever no project is open. "No project" is BB's Personal project,
 *  which has no checkout, so its shells open in the home directory. */
const scopeInput = z.object({ projectId: z.string().min(1) }).strict();

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
  session_rename: {
    input: z
      .object({ terminalId: z.string().min(1), name: z.string().trim().min(1).max(40) })
      .strict(),
    output: z.object({ label: z.string() }).strict(),
  },
  session_close: {
    input: z.object({ terminalId: z.string().min(1) }).strict(),
    output: z.object({}).strict(),
  },
});

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  // ponytail: the project's default source wins; add a source picker if a
  // multi-checkout project ever needs a terminal per checkout.
  const scopeOf = async (projectId: string) => {
    const { sources } = await bb.sdk.projects.get({ projectId });
    const source = sources.find((one) => one.isDefault) ?? sources[0];
    if (source !== undefined) {
      return {
        kind: "host_path",
        hostId: source.hostId,
        cwd: source.path,
      } as const;
    }
    // ponytail: the plugin server's own home on the first connected host, which
    // is the server machine on a single-machine setup; pick the server host by
    // role once the SDK exposes it, if a remote machine ever lists first.
    const hosts = await bb.sdk.hosts.list();
    const host = hosts.find((one) => one.status === "connected") ?? hosts[0];
    if (host === undefined) {
      throw new Error("No machine to open a terminal on");
    }
    return { kind: "host_path", hostId: host.id, cwd: homedir() } as const;
  };

  /** The plugin's own live sessions in one scope, in BB's order. */
  const own = async (projectId: string) => {
    const { sessions } = await bb.sdk.terminals.list({
      scope: await scopeOf(projectId),
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
    session_list: async ({ projectId }) => ({
      tabs: (await own(projectId)).map((session) => ({
        terminalId: session.id,
        label: labelOf(session.title ?? TITLE),
        cwd: session.initialCwd,
      })),
    }),

    session_create: async ({ cols, rows, projectId }) => {
      const taken = new Set(
        (await own(projectId)).map((session) => session.title),
      );
      let index = 1;
      while (taken.has(`${TITLE} ${index}`)) {
        index += 1;
      }
      const title = `${TITLE} ${index}`;
      const created = await bb.sdk.terminals.create({
        cols,
        rows,
        scope: await scopeOf(projectId),
        title,
      });
      bb.log.info(`opened ${created.id} in ${created.initialCwd}`);
      return {
        terminalId: created.id,
        label: labelOf(title),
        cwd: created.initialCwd,
      };
    },

    session_rename: async ({ terminalId, name }) => {
      await bb.sdk.terminals.rename({ terminalId, title: titleFor(name) });
      return { label: name };
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
