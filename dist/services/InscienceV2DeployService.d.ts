export interface DeployRunResult {
    ok: boolean;
    message: string;
    output: string;
}
export type InscienceV2DeployTarget = 'cloudflare' | 'vercel';
export declare class InscienceV2DeployService {
    redeploy(): Promise<DeployRunResult>;
}
//# sourceMappingURL=InscienceV2DeployService.d.ts.map