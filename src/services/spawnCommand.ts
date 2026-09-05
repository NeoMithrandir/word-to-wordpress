import { spawn, ChildProcess, SpawnOptions } from 'child_process';

export type SpawnBin = 'npm' | 'npx';

/**
 * Node 20+ rejects spawning `.cmd`/`.bat` without a shell (EINVAL / CVE-2024-27980).
 */
export function spawnCommandOptions(): Pick<SpawnOptions, 'shell' | 'windowsHide'> {
  return {
    windowsHide: true,
    shell: process.platform === 'win32'
  };
}

export function spawnCommand(
  command: SpawnBin,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): ChildProcess {
  const bin = process.platform === 'win32' ? `${command}.cmd` : command;
  return spawn(bin, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    ...spawnCommandOptions()
  });
}
