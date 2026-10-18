import { describe, expect, it } from "vitest";
import { tokenize } from "@/engine/shell/tokenize";
import { parse } from "@/engine/shell/parse";

const ctx = { env: { USER: "operator", FOO: "bar" }, lastExit: 0 };

describe("tokenize", () => {
  it("splits words and expands variables", () => {
    const t = tokenize('echo $USER "$FOO baz" end', ctx);
    expect(t).toEqual([
      { type: "word", value: "echo" },
      { type: "word", value: "operator" },
      { type: "word", value: "bar baz" },
      { type: "word", value: "end" },
    ]);
  });

  it("keeps single quotes literal", () => {
    const t = tokenize("echo '$USER'", ctx);
    expect(t[1]).toEqual({ type: "word", value: "$USER" });
  });

  it("recognizes operators", () => {
    const t = tokenize("a | b && c > f ; d", ctx);
    const ops = t.filter((x) => x.type === "op").map((x) => x.value);
    expect(ops).toEqual(["|", "&&", ">", ";"]);
  });

  it("expands $? to last exit code", () => {
    const t = tokenize("echo $?", { env: {}, lastExit: 42 });
    expect(t[1]).toEqual({ type: "word", value: "42" });
  });

  it("handles 2>> and &>", () => {
    const t = tokenize("cmd 2>> err &> both", ctx);
    const ops = t.filter((x) => x.type === "op").map((x) => x.value);
    expect(ops).toContain("2>>");
    expect(ops).toContain("&>");
  });
});

describe("parse", () => {
  it("builds a pipeline", () => {
    const prog = parse(tokenize("ls -la | grep foo", ctx));
    expect(prog).toHaveLength(1);
    expect(prog[0]!.items[0]!.pipeline.commands).toHaveLength(2);
    expect(prog[0]!.items[0]!.pipeline.commands[0]!.argv).toEqual(["ls", "-la"]);
  });

  it("captures redirections", () => {
    const prog = parse(tokenize("echo hi > out.txt", ctx));
    const cmd = prog[0]!.items[0]!.pipeline.commands[0]!;
    expect(cmd.redirs[0]).toEqual({ fd: 1, mode: "write", target: "out.txt" });
  });

  it("splits and-or lists and sequences", () => {
    const prog = parse(tokenize("a && b || c ; d", ctx));
    expect(prog).toHaveLength(2);
    expect(prog[0]!.items.map((i) => i.op)).toEqual([undefined, "&&", "||"]);
  });
});
