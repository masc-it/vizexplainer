import { execFile } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "vizx-setup-")));
  dirs.push(dir);
  const repo = path.join(dir, "checkout with spaces");
  const home = path.join(dir, "home with spaces");
  const bin = path.join(dir, "bin");
  const log = path.join(dir, "npm.jsonl");
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  await mkdir(home);
  await mkdir(bin);
  await cp("scripts/setup.mjs", path.join(repo, "scripts/setup.mjs"));
  await cp("skill", path.join(repo, "skill"), { recursive: true });
  // Exercise the real setup entrypoint without installing packages or changing global npm links.
  await writeFile(path.join(bin, "npm"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.SETUP_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (args.join(" ") === process.env.FAIL_NPM_ON) process.exit(7);
`);
  await chmod(path.join(bin, "npm"), 0o755);
  const destinations = [".agents", ".claude"].map((folder) => path.join(home, folder, "skills/vizexplainer"));
  const run = (env: NodeJS.ProcessEnv = {}) => exec(process.execPath, [path.join(repo, "scripts/setup.mjs")], {
    cwd: dir,
    env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, SETUP_LOG: log, ...env },
  });
  const calls = async () => (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  return { repo, home, destinations, run, calls };
}

describe("setup", () => {
  it("installs, builds and links from the checkout, then copies the complete skill to both homes", async () => {
    const f = await fixture();
    const result = await f.run();
    expect(await f.calls()).toEqual([
      { args: ["ci", "--include=dev"], cwd: f.repo },
      { args: ["run", "build"], cwd: f.repo },
      { args: ["link"], cwd: f.repo },
    ]);
    for (const destination of f.destinations) {
      expect((await lstat(destination)).isSymbolicLink()).toBe(false);
      for (const file of ["SKILL.md", "references/document.md", "references/components.md", "references/writing.md", "references/custom-components.md"]) {
        expect(await readFile(path.join(destination, file), "utf8")).toBe(await readFile(path.join(f.repo, "skill", file), "utf8"));
      }
      expect(result.stdout).toContain(`Copied skill to ${destination}`);
    }
  });

  it("refreshes existing copies, removes stale files and leaves other skills untouched", async () => {
    const f = await fixture();
    await f.run();
    for (const destination of f.destinations) {
      await writeFile(path.join(destination, "obsolete.md"), "old");
      await writeFile(path.join(destination, "SKILL.md"), "local edit");
      await mkdir(path.join(path.dirname(destination), "other"));
      await writeFile(path.join(path.dirname(destination), "other/SKILL.md"), "leave me");
    }
    await writeFile(path.join(f.repo, "skill/SKILL.md"), "updated skill");
    await f.run();
    for (const destination of f.destinations) {
      expect(await readFile(path.join(destination, "SKILL.md"), "utf8")).toBe("updated skill");
      await expect(lstat(path.join(destination, "obsolete.md"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(path.join(path.dirname(destination), "other/SKILL.md"), "utf8")).toBe("leave me");
      expect((await readdir(path.dirname(destination))).sort()).toEqual(["other", "vizexplainer"]);
    }
  });

  it("replaces destination symlinks without modifying their targets", async () => {
    const f = await fixture();
    const external = path.join(f.home, "original-skill");
    await mkdir(external);
    await writeFile(path.join(external, "SKILL.md"), "keep original");
    for (const destination of f.destinations) {
      await mkdir(path.dirname(destination), { recursive: true });
      await symlink(external, destination);
    }
    await f.run();
    expect(await readFile(path.join(external, "SKILL.md"), "utf8")).toBe("keep original");
    expect(await readdir(external)).toEqual(["SKILL.md"]);
    for (const destination of f.destinations) expect((await lstat(destination)).isSymbolicLink()).toBe(false);
  });

  it.each(["ci --include=dev", "run build", "link"])("stops on npm %s failure without changing installed skills", async (command) => {
    const f = await fixture();
    for (const destination of f.destinations) {
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, "SKILL.md"), "previous");
    }
    await expect(f.run({ FAIL_NPM_ON: command })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining(`npm ${command} failed`) });
    const calls = await f.calls();
    expect(calls.at(-1).args.join(" ")).toBe(command);
    for (const destination of f.destinations) expect(await readFile(path.join(destination, "SKILL.md"), "utf8")).toBe("previous");
  });

  it("reports a missing npm executable", async () => {
    const f = await fixture();
    await expect(f.run({ PATH: "" })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("ENOENT") });
    for (const destination of f.destinations) await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves the old skill and removes staging files if copying fails", async () => {
    const f = await fixture();
    await rm(path.join(f.repo, "skill"), { recursive: true });
    await mkdir(f.destinations[0]!, { recursive: true });
    await writeFile(path.join(f.destinations[0]!, "SKILL.md"), "previous");
    await expect(f.run()).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Setup failed") });
    expect(await readFile(path.join(f.destinations[0]!, "SKILL.md"), "utf8")).toBe("previous");
    expect(await readdir(path.dirname(f.destinations[0]!))).toEqual(["vizexplainer"]);
  });
});
