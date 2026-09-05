import fs from 'fs';
import path from 'path';
import { defaultInscienceV2Dir } from './inscienceV2Path';
import { SpawnBin, spawnCommand } from './spawnCommand';

export interface DeployRunResult {
  ok: boolean;
  message: string;
  output: string;
}

export type InscienceV2DeployTarget = 'cloudflare' | 'vercel';

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function lastNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
}

function parseDeployTarget(raw: string): InscienceV2DeployTarget {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'vercel') return 'vercel';
  return 'cloudflare';
}

function deploySpec(target: InscienceV2DeployTarget): { command: SpawnBin; args: string[]; label: string } {
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
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

function runDeploy(
  repoDir: string,
  target: InscienceV2DeployTarget,
  timeoutMs: number
): Promise<DeployRunResult> {
  const spec = deploySpec(target);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnCommand(spec.command, spec.args, {
        cwd: repoDir,
        env: { ...process.env }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start inscience-v2 deploy';
      resolve({
        ok: false,
        message,
        output: ''
      });
      return;
    }

    let output = '';
    const append = (chunk: Buffer | string) => {
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
        message:
          lastNonEmptyLine(trimmed) || `inscience-v2 deploy exited with code ${code} (${spec.label})`,
        output: trimmed
      });
    });
  });
}

export class InscienceV2DeployService {
  async redeploy(): Promise<DeployRunResult> {
    const repoDir = defaultInscienceV2Dir();
    const packageJson = path.join(repoDir, 'package.json');
    if (!fs.existsSync(packageJson)) {
      return {
        ok: false,
        message: `inscience-v2 not found at ${repoDir}. Set INSCIENCE_V2_DIR.`,
        output: ''
      };
    }

    const target = parseDeployTarget(process.env.INSCIENCE_V2_DEPLOY || 'cloudflare');
    if (target === 'cloudflare') {
      const wranglerConfig = path.join(repoDir, 'wrangler.jsonc');
      if (!fs.existsSync(wranglerConfig)) {
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
