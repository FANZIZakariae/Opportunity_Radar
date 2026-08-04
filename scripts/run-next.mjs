import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_USE_SYSTEM_CA: "1" },
  windowsHide: true,
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
