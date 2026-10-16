import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function setup() {
  for (const args of [["ci", "--include=dev"], ["run", "build"], ["link"]]) {
    console.log(`Running npm ${args.join(" ")} in ${root}`);
    const result = spawnSync("npm", args, { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed (${result.signal ?? `exit ${result.status}`})`);
  }

  for (const folder of [".agents", ".claude"]) {
    const parent = path.join(homedir(), folder, "skills");
    const destination = path.join(parent, "vizexplainer");
    await mkdir(parent, { recursive: true });
    const staged = await mkdtemp(path.join(parent, ".vizexplainer-"));
    try {
      // Finish copying before replacing the old skill. rm removes a destination symlink, not its target.
      await cp(path.join(root, "skill"), staged, { recursive: true });
      await rm(destination, { recursive: true, force: true });
      await rename(staged, destination);
    } finally {
      await rm(staged, { recursive: true, force: true });
    }
    console.log(`Copied skill to ${destination}`);
  }
  console.log("Setup complete. vizx is linked through npm's global bin directory; keep this checkout in place.");
}

setup().catch((error) => {
  console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
