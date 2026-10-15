"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawnCommandOptions = spawnCommandOptions;
exports.spawnCommand = spawnCommand;
const child_process_1 = require("child_process");
/**
 * Node 20+ rejects spawning `.cmd`/`.bat` without a shell (EINVAL / CVE-2024-27980).
 */
function spawnCommandOptions() {
    return {
        windowsHide: true,
        shell: process.platform === 'win32'
    };
}
function spawnCommand(command, args, options) {
    const bin = process.platform === 'win32' ? `${command}.cmd` : command;
    return (0, child_process_1.spawn)(bin, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        ...spawnCommandOptions()
    });
}
//# sourceMappingURL=spawnCommand.js.map