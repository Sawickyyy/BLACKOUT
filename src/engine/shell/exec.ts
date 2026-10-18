// The shell executor. Turns a command line into results by tokenizing,
// parsing, then running pipelines with redirection and && || ; control flow.
// Builtins handled here (cd/export live as registry commands because they only
// mutate the session): exit/logout (pop the ssh hop stack) and bare
// VAR=value assignments.

import { parse, type Pipeline, type Program, type SimpleCommand } from "./parse";
import { tokenize } from "./tokenize";
import { ok, type CommandRegistry, type CommandResult, type ShellContext } from "./context";
import { collectSudoers, mayRun, mayRunAll, rulesForUser } from "./sudoers";
import type { Principal } from "../fs/vfs";

const ROOT_PRINCIPAL: Principal = { uid: 0, gid: 0, groups: [0] };

/** Group names the current user belongs to on the current host. */
function userGroupNames(ctx: ShellContext): string[] {
  const gids = new Set([ctx.user.gid, ...ctx.user.groups]);
  return ctx.host.groups.filter((g) => gids.has(g.gid)).map((g) => g.name);
}

/** A context clone that acts as root on the same host/session. */
function elevated(ctx: ShellContext): ShellContext {
  const rootUser = ctx.host.users.find((u) => u.uid === 0) ?? {
    name: "root",
    uid: 0,
    gid: 0,
    groups: [0],
    home: "/root",
    shell: "/bin/bash",
  };
  return { ...ctx, principal: ROOT_PRINCIPAL, user: rootUser };
}

export interface ExecOutcome extends CommandResult {
  /** True if the session host changed (ssh/exit) so the UI can refresh. */
  sessionChanged: boolean;
}

function isAssignment(tok: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tok);
}

function fileReadInto(ctx: ShellContext, path: string): { text: string; error?: string } {
  try {
    return { text: ctx.vfs.readFile(ctx.resolve(path), ctx.principal) };
  } catch (e) {
    return { text: "", error: `bash: ${path}: ${(e as Error).message}` };
  }
}

function writeOut(ctx: ShellContext, path: string, data: string, append: boolean): string | null {
  // /dev/null discards everything written to it.
  if (ctx.resolve(path) === "/dev/null") return null;
  try {
    if (append) ctx.vfs.appendFile(ctx.resolve(path), data, ctx.principal);
    else ctx.vfs.writeFile(ctx.resolve(path), data, ctx.principal);
    return null;
  } catch (e) {
    return `bash: ${path}: ${(e as Error).message}`;
  }
}

function runSimple(
  cmd: SimpleCommand,
  registry: CommandRegistry,
  ctx: ShellContext,
  pipedStdin: string,
): { result: CommandResult; sessionChanged: boolean } {
  // Leading VAR=value assignments.
  let i = 0;
  const tempEnv: [string, string][] = [];
  while (i < cmd.argv.length && isAssignment(cmd.argv[i]!)) {
    const eq = cmd.argv[i]!.indexOf("=");
    tempEnv.push([cmd.argv[i]!.slice(0, eq), cmd.argv[i]!.slice(eq + 1)]);
    i++;
  }
  const rest = cmd.argv.slice(i);

  // Pure assignment line: persist to env.
  if (rest.length === 0) {
    for (const [k, v] of tempEnv) ctx.session.env[k] = v;
    return { result: ok(), sessionChanged: false };
  }

  const name = rest[0]!;
  const args = rest.slice(1);

  // input redirection
  let stdin = pipedStdin;
  const redirErrs: string[] = [];
  for (const r of cmd.redirs) {
    if (r.mode === "read") {
      const { text, error } = fileReadInto(ctx, r.target);
      if (error) redirErrs.push(error);
      else stdin = text;
    }
  }
  if (redirErrs.length) {
    return { result: { stdout: "", stderr: redirErrs.join("\n") + "\n", code: 1 }, sessionChanged: false };
  }

  // Builtins: exit / logout
  if (name === "exit" || name === "logout") {
    if (ctx.session.stack.length === 0) {
      return {
        result: { stdout: "", stderr: "logout: to jest Twoja maszyna — nie możesz się wylogować.\n", code: 1 },
        sessionChanged: false,
      };
    }
    const prev = ctx.session.stack.pop()!;
    ctx.session.hostId = prev.hostId;
    ctx.session.uid = prev.uid;
    ctx.session.cwd = prev.cwd;
    ctx.session.env.PWD = prev.cwd;
    return { result: ok("logout\n"), sessionChanged: true };
  }

  // temp env applied during this command
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of tempEnv) {
    saved[k] = ctx.session.env[k];
    ctx.session.env[k] = v;
  }

  let result: CommandResult;
  let sessionChanged = false;

  const runRegistry = (nm: string, as: ShellContext, argvRest: string[], stdinArg: string): CommandResult => {
    const spec = registry.get(nm);
    if (!spec) return { stdout: "", stderr: `bash: ${nm}: polecenie nieznalezione\n`, code: 127 };
    if (spec.requires && !as.hasCapability(spec.requires)) {
      return {
        stdout: "",
        stderr: `bash: ${nm}: polecenie niedostępne (wymaga narzędzia: ${spec.requires}). Sprawdź sklep (store).\n`,
        code: 127,
      };
    }
    as.emit({ kind: "command", hostId: as.host.id, data: { name: nm, args: argvRest } });
    try {
      return spec.run(as, { argv: argvRest, stdin: stdinArg });
    } catch (e) {
      return { stdout: "", stderr: `bash: ${nm}: błąd wykonania: ${(e as Error).message}\n`, code: 1 };
    }
  };

  if (name === "sudo") {
    ({ result, sessionChanged } = runSudo(ctx, args, stdin, runRegistry));
  } else if (name === "su") {
    ({ result, sessionChanged } = runSu(ctx, args));
  } else {
    const before = ctx.session.hostId;
    result = runRegistry(name, ctx, args, stdin);
    if (ctx.session.hostId !== before) sessionChanged = true;
  }

  // restore temp env
  for (const [k] of tempEnv) {
    if (saved[k] === undefined) delete ctx.session.env[k];
    else ctx.session.env[k] = saved[k]!;
  }

  // output redirection
  let finalStdout = result.stdout;
  let finalStderr = result.stderr;
  for (const r of cmd.redirs) {
    if (r.mode === "read") continue;
    const data = r.fd === 2 ? result.stderr : r.fd === "both" ? result.stdout + result.stderr : result.stdout;
    const e = writeOut(ctx, r.target, data, r.mode === "append");
    if (e) {
      finalStderr += e + "\n";
    } else {
      if (r.fd === 1) finalStdout = "";
      if (r.fd === 2) finalStderr = "";
      if (r.fd === "both") {
        finalStdout = "";
        finalStderr = "";
      }
    }
  }

  return { result: { stdout: finalStdout, stderr: finalStderr, code: result.code }, sessionChanged };
}

function runPipeline(
  pipeline: Pipeline,
  registry: CommandRegistry,
  ctx: ShellContext,
): { result: CommandResult; sessionChanged: boolean } {
  let piped = "";
  let last: CommandResult = ok();
  let sessionChanged = false;
  const stderrAccum: string[] = [];
  for (let idx = 0; idx < pipeline.commands.length; idx++) {
    const { result, sessionChanged: sc } = runSimple(pipeline.commands[idx]!, registry, ctx, piped);
    if (sc) sessionChanged = true;
    if (result.stderr) stderrAccum.push(result.stderr);
    last = result;
    piped = result.stdout;
  }
  return {
    result: { stdout: last.stdout, stderr: stderrAccum.join(""), code: last.code },
    sessionChanged,
  };
}

export function execProgram(
  program: Program,
  registry: CommandRegistry,
  ctx: ShellContext,
): ExecOutcome {
  let stdout = "";
  let stderr = "";
  let code = 0;
  let sessionChanged = false;

  for (const andor of program) {
    let prevCode = 0;
    let first = true;
    for (const item of andor.items) {
      if (!first) {
        if (item.op === "&&" && prevCode !== 0) continue;
        if (item.op === "||" && prevCode === 0) continue;
      }
      first = false;
      const { result, sessionChanged: sc } = runPipeline(item.pipeline, registry, ctx);
      if (sc) sessionChanged = true;
      stdout += result.stdout;
      stderr += result.stderr;
      code = result.code;
      prevCode = result.code;
    }
  }

  return { stdout, stderr, code, sessionChanged };
}

/** Full line → outcome. Tokenization errors surface as stderr with code 2. */
export function runLine(
  line: string,
  registry: CommandRegistry,
  ctx: ShellContext,
  lastExit: number,
): ExecOutcome {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) {
    return { stdout: "", stderr: "", code: 0, sessionChanged: false };
  }
  try {
    const tokens = tokenize(line, { env: ctx.session.env, lastExit });
    const program = parse(tokens);
    return execProgram(program, registry, ctx);
  } catch (e) {
    return { stdout: "", stderr: `bash: ${(e as Error).message}\n`, code: 2, sessionChanged: false };
  }
}

// ── sudo / su builtins ─────────────────────────────────────────────────────

function elevateSession(ctx: ShellContext, toUid: number, home: string, name: string): void {
  ctx.session.stack.push({ hostId: ctx.session.hostId, uid: ctx.session.uid, cwd: ctx.session.cwd });
  ctx.session.uid = toUid;
  ctx.session.cwd = home;
  ctx.session.env.PWD = home;
  ctx.session.env.HOME = home;
  ctx.session.env.USER = name;
}

function runSudo(
  ctx: ShellContext,
  args: string[],
  stdin: string,
  runRegistry: (nm: string, as: ShellContext, rest: string[], stdinArg: string) => CommandResult,
): { result: CommandResult; sessionChanged: boolean } {
  // Already root: sudo is transparent.
  const alreadyRoot = ctx.principal.uid === 0;
  const rules = collectSudoers(ctx.host, ctx.vfs);
  const applicable = rulesForUser(rules, ctx.user.name, userGroupNames(ctx));

  if (args[0] === "-l") {
    if (alreadyRoot) return { result: ok("Użytkownik root może uruchamiać dowolne polecenia.\n"), sessionChanged: false };
    if (!applicable.length)
      return {
        result: { stdout: "", stderr: `Użytkownik ${ctx.user.name} nie ma wpisów w sudoers.\n`, code: 1 },
        sessionChanged: false,
      };
    const lines = applicable.map(
      (r) => `    (ALL) ${r.nopasswd ? "NOPASSWD: " : ""}${r.commands === "ALL" ? "ALL" : r.commands.join(", ")}`,
    );
    return {
      result: ok(`Użytkownik ${ctx.user.name} może uruchamiać na ${ctx.host.hostname}:\n${lines.join("\n")}\n`),
      sessionChanged: false,
    };
  }

  // strip -u user / -k / -H style options we don't model, keep the command
  let i = 0;
  while (i < args.length && args[i]!.startsWith("-") && args[i] !== "-s" && args[i] !== "-i") {
    if (args[i] === "-u") i += 2;
    else i += 1;
  }
  const wantsShell = args.length === 0 || args[i] === "-s" || args[i] === "-i";
  const target = wantsShell ? [] : args.slice(i);

  const permittedAll = alreadyRoot || mayRunAll(applicable);

  if (wantsShell) {
    if (!permittedAll && !applicable.some((r) => r.commands !== "ALL" && r.commands.some((c) => c.endsWith("/bash") || c.endsWith("/sh")))) {
      return {
        result: { stdout: "", stderr: `${ctx.user.name} nie może uruchomić powłoki roota przez sudo.\n`, code: 1 },
        sessionChanged: false,
      };
    }
    if (!alreadyRoot) {
      elevateSession(ctx, 0, "/root", "root");
      ctx.emit({ kind: "privesc", hostId: ctx.host.id, data: { via: "sudo -s" } });
    }
    return { result: ok(), sessionChanged: !alreadyRoot };
  }

  const cmdName = target[0]!;
  const binOk =
    permittedAll ||
    mayRun(applicable, `/usr/bin/${cmdName}`) ||
    mayRun(applicable, `/bin/${cmdName}`) ||
    mayRun(applicable, `/usr/sbin/${cmdName}`);
  if (!binOk) {
    return {
      result: { stdout: "", stderr: `Przepraszamy, użytkownik ${ctx.user.name} nie może uruchomić '${cmdName}' jako root na ${ctx.host.hostname}.\n`, code: 1 },
      sessionChanged: false,
    };
  }
  ctx.emit({ kind: "privesc", hostId: ctx.host.id, data: { via: "sudo", cmd: cmdName } });
  const res = runRegistry(cmdName, alreadyRoot ? ctx : elevated(ctx), target.slice(1), stdin);
  return { result: res, sessionChanged: false };
}

function runSu(ctx: ShellContext, args: string[]): { result: CommandResult; sessionChanged: boolean } {
  const targetName = args.find((a) => !a.startsWith("-")) ?? "root";
  const targetUser = ctx.getUser(targetName);
  if (!targetUser) {
    return { result: { stdout: "", stderr: `su: użytkownik ${targetName} nie istnieje\n`, code: 1 }, sessionChanged: false };
  }
  if (ctx.principal.uid === 0) {
    elevateSession(ctx, targetUser.uid, targetUser.home, targetUser.name);
    return { result: ok(), sessionChanged: true };
  }
  // Non-root su cannot prompt for a password in this sim; direct the player to sudo.
  return {
    result: { stdout: "", stderr: `su: Authentication failure\n(wskazówka: w tej symulacji użyj 'sudo -s', jeśli masz uprawnienia)\n`, code: 1 },
    sessionChanged: false,
  };
}
