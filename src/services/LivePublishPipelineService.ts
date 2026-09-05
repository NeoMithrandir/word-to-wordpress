import { InscienceV2DeployService } from './InscienceV2DeployService';
import {
  LivePublishInput,
  LivePublishLogEntry,
  LivePublishLogService,
  LivePublishStepResult
} from './LivePublishLogService';
import {
  isSafeSimplificationSlug,
  normalizeSimplificationSlug,
  SimplificationsService
} from './SimplificationsService';

export interface LivePublishPipelineResult {
  entry: LivePublishLogEntry;
  simplifications: LivePublishStepResult;
  deploy: LivePublishStepResult;
}

export class LivePublishPipelineService {
  constructor(
    private readonly simplificationsService = new SimplificationsService(),
    private readonly deployService = new InscienceV2DeployService(),
    private readonly logService = new LivePublishLogService()
  ) {}

  getLogService(): LivePublishLogService {
    return this.logService;
  }

  async run(input: LivePublishInput): Promise<LivePublishPipelineResult> {
    const [result] = await this.runMany([input]);
    if (!result) {
      throw new Error('Live-publish pipeline produced no result');
    }
    return result;
  }

  async runMany(inputs: LivePublishInput[]): Promise<LivePublishPipelineResult[]> {
    const prepared = inputs.map((input) => ({
      ...input,
      slug:
        normalizeSimplificationSlug(input.slug) ||
        normalizeSimplificationSlug(input.postUrl ?? '')
    }));

    const validInputs = prepared.filter((input) => isSafeSimplificationSlug(input.slug));
    const simpBySlug = new Map<string, LivePublishStepResult>();

    for (const input of validInputs) {
      if (simpBySlug.has(input.slug)) continue;
      try {
        const result = await this.simplificationsService.generateForSlug(input.slug);
        simpBySlug.set(input.slug, this.toStepResult(result));
      } catch (error) {
        simpBySlug.set(input.slug, {
          ok: false,
          message: error instanceof Error ? error.message : 'generate:simplifications failed'
        });
      }
    }

    const deploy: LivePublishStepResult =
      validInputs.length === 0
        ? { ok: false, message: 'Skipped deploy because no valid slugs were provided' }
        : await this.toStep(this.deployService.redeploy());

    return prepared.map((input) => {
      const simplifications = isSafeSimplificationSlug(input.slug)
        ? simpBySlug.get(input.slug) ?? { ok: false, message: 'Simplifications did not run' }
        : { ok: false, message: 'Invalid post slug' };
      const deployForEntry = isSafeSimplificationSlug(input.slug)
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

  private toStepResult(result: { ok: boolean; message: string; output?: string }): LivePublishStepResult {
    const output = result.output?.trim();
    return {
      ok: result.ok,
      message: result.message,
      ...(output ? { output: output.length > 4000 ? output.slice(-4000) : output } : {})
    };
  }

  private async toStep(
    resultPromise: Promise<{ ok: boolean; message: string; output?: string }>
  ): Promise<LivePublishStepResult> {
    try {
      return this.toStepResult(await resultPromise);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'inscience-v2 deploy failed'
      };
    }
  }
}
