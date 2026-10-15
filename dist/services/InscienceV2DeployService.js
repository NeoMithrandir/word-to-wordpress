"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InscienceV2DeployService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const inscienceV2Path_1 = require("./inscienceV2Path");
const spawnCommand_1 = require("./spawnCommand");
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
function lastNonEmptyLine(text) {
    return text.split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
}
function parseDeployTarget(raw) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'vercel')
        return 'vercel';
    return 'cloudflare';
}
function deploySpec(target) {
    switch (target) {
        case 'cloudflare':
            return {
                command: 'npm',
                args: ['run', 'deploy:cloudflare'],
                label: 'Cloudflare (npm run deploy:cloudflare)'
            };
        case 'vercel':
            return {
                command: 'npx',
                args: ['vercel', '--prod', '--yes'],
                label: 'Vercel (npx vercel --prod --yes)'
            };
        default: {
            const _exhaustive = target;
            return _exhaustive;
        }
    }
}
function runDeploy(repoDir, target, timeoutMs) {
    const spec = deploySpec(target);
    return new Promise((resolve) => {
        let child;
        try {
            child = (0, spawnCommand_1.spawnCommand)(spec.command, spec.args, {
                cwd: repoDir,
                env: { ...process.env }
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start inscience-v2 deploy';
            resolve({
                ok: false,
                message,
                output: ''
            });
            return;
        }
        let output = '';
        const append = (chunk) => {
            output += chunk.toString();
        };
        child.stdout?.on('data', append);
        child.stderr?.on('data', append);
        const timer = setTimeout(() => {
            child.kill();
            resolve({
                ok: false,
                message: `inscience-v2 deploy timed out after ${Math.round(timeoutMs / 1000)}s (${spec.label})`,
                output
            });
        }, timeoutMs);
        child.on('error', (error) => {
            clearTimeout(timer);
            resolve({
                ok: false,
                message: error.message,
                output
            });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            const trimmed = output.trim();
            if (code === 0) {
                resolve({
                    ok: true,
                    message: `Rebuilt and deployed inscience-v2 via ${spec.label}`,
                    output: trimmed
                });
                return;
            }
            resolve({
                ok: false,
                message: lastNonEmptyLine(trimmed) || `inscience-v2 deploy exited with code ${code} (${spec.label})`,
                output: trimmed
            });
        });
    });
}
class InscienceV2DeployService {
    async redeploy() {
        const repoDir = (0, inscienceV2Path_1.defaultInscienceV2Dir)();
        const packageJson = path_1.default.join(repoDir, 'package.json');
        if (!fs_1.default.existsSync(packageJson)) {
            return {
                ok: false,
                message: `inscience-v2 not found at ${repoDir}. Set INSCIENCE_V2_DIR.`,
                output: ''
            };
        }
        const target = parseDeployTarget(process.env.INSCIENCE_V2_DEPLOY || 'cloudflare');
        if (target === 'cloudflare') {
            const wranglerConfig = path_1.default.join(repoDir, 'wrangler.jsonc');
            if (!fs_1.default.existsSync(wranglerConfig)) {
                return {
                    ok: false,
                    message: `wrangler.jsonc not found in ${repoDir}. Set INSCIENCE_V2_DEPLOY=vercel to use Vercel instead.`,
                    output: ''
                };
            }
        }
        const timeoutMs = Number(process.env.INSCIENCE_V2_DEPLOY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
        console.log(`Deploying inscience-v2 from ${repoDir} (target=${target}, timeout=${timeoutMs}ms)`);
        return runDeploy(repoDir, target, timeoutMs);
    }
}
exports.InscienceV2DeployService = InscienceV2DeployService;
//# sourceMappingURL=InscienceV2DeployService.js.map