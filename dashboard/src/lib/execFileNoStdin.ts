import { execFile, type ExecFileOptions } from "node:child_process";

export function execFileNoStdin(
  file: string,
  args: readonly string[],
  options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { ...options, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stdout, stderr });
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end();
  });
}
