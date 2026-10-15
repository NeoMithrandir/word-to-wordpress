import { ChildProcess, SpawnOptions } from 'child_process';
export type SpawnBin = 'npm' | 'npx';
/**
 * Node 20+ rejects spawning `.cmd`/`.bat` without a shell (EINVAL / CVE-2024-27980).
 */
export declare function spawnCommandOptions(): Pick<SpawnOptions, 'shell' | 'windowsHide'>;
export declare function spawnCommand(command: SpawnBin, args: string[], options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
}): ChildProcess;
//# sourceMappingURL=spawnCommand.d.ts.map