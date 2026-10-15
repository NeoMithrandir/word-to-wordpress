"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivePublishPipelineService = void 0;
const InscienceV2DeployService_1 = require("./InscienceV2DeployService");
const LivePublishLogService_1 = require("./LivePublishLogService");
const SimplificationsService_1 = require("./SimplificationsService");
class LivePublishPipelineService {
    constructor(simplificationsService = new SimplificationsService_1.SimplificationsService(), deployService = new InscienceV2DeployService_1.InscienceV2DeployService(), logService = new LivePublishLogService_1.LivePublishLogService()) {
        this.simplificationsService = simplificationsService;
        this.deployService = deployService;
        this.logService = logService;
    }
    getLogService() {
        return this.logService;
    }
    async run(input) {
        const [result] = await this.runMany([input]);
        if (!result) {
            throw new Error('Live-publish pipeline produced no result');
        }
        return result;
    }
    async runMany(inputs) {
        const prepared = inputs.map((input) => ({
            ...input,
            slug: (0, SimplificationsService_1.normalizeSimplificationSlug)(input.slug) ||
                (0, SimplificationsService_1.normalizeSimplificationSlug)(input.postUrl ?? '')
        }));
        const validInputs = prepared.filter((input) => (0, SimplificationsService_1.isSafeSimplificationSlug)(input.slug));
        const simpBySlug = new Map();
        for (const input of validInputs) {
            if (simpBySlug.has(input.slug))
                continue;
            try {
                const result = await this.simplificationsService.generateForSlug(input.slug);
                simpBySlug.set(input.slug, this.toStepResult(result));
            }
            catch (error) {
                simpBySlug.set(input.slug, {
                    ok: false,
                    message: error instanceof Error ? error.message : 'generate:simplifications failed'
                });
            }
        }
        const deploy = validInputs.length === 0
            ? { ok: false, message: 'Skipped deploy because no valid slugs were provided' }
            : await this.toStep(this.deployService.redeploy());
        return prepared.map((input) => {
            const simplifications = (0, SimplificationsService_1.isSafeSimplificationSlug)(input.slug)
                ? simpBySlug.get(input.slug) ?? { ok: false, message: 'Simplifications did not run' }
                : { ok: false, message: 'Invalid post slug' };
            const deployForEntry = (0, SimplificationsService_1.isSafeSimplificationSlug)(input.slug)
                ? deploy
                : { ok: false, message: 'Skipped deploy because slug is invalid' };
            const entry = this.logService.append({
                ...input,
                simplifications,
                deploy: deployForEntry
            });
            return { entry, simplifications, deploy: deployForEntry };
        });
    }
    toStepResult(result) {
        const output = result.output?.trim();
        return {
            ok: result.ok,
            message: result.message,
            ...(output ? { output: output.length > 4000 ? output.slice(-4000) : output } : {})
        };
    }
    async toStep(resultPromise) {
        try {
            return this.toStepResult(await resultPromise);
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : 'inscience-v2 deploy failed'
            };
        }
    }
}
exports.LivePublishPipelineService = LivePublishPipelineService;
//# sourceMappingURL=LivePublishPipelineService.js.map