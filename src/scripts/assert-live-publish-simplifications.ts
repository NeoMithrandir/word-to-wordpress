import assert from 'assert';
import { InscienceV2DeployService } from '../services/InscienceV2DeployService';
import {
  LivePublishInput,
  LivePublishLogEntry,
  LivePublishLogService,
  LivePublishStepResult,
  parseRunSimplifications
} from '../services/LivePublishLogService';
import {
  LivePublishPipelineService,
  SKIPPED_SIMPLIFICATIONS_RESULT
} from '../services/LivePublishPipelineService';
import { SimplificationsService } from '../services/SimplificationsService';

assert.strictEqual(parseRunSimplifications(undefined), true, 'missing flag defaults ON');
assert.strictEqual(parseRunSimplifications(true), true, 'true stays ON');
assert.strictEqual(parseRunSimplifications(false), false, 'false is OFF');

class RecordingSimplificationsService {
  readonly slugs: string[] = [];

  async generateForSlug(slug: string) {
    this.slugs.push(slug);
    return { ok: true, message: `generated ${slug}`, output: '' };
  }
}

class RecordingDeployService {
  calls = 0;

  async redeploy() {
    this.calls += 1;
    return { ok: true, message: 'deployed', output: '' };
  }
}

class RecordingLogService {
  readonly entries: LivePublishLogEntry[] = [];

  append(
    input: LivePublishInput & {
      simplifications: LivePublishStepResult;
      deploy: LivePublishStepResult;
    }
  ): LivePublishLogEntry {
    const entry: LivePublishLogEntry = {
      id: `${input.slug}-assert`,
      slug: input.slug,
      title: input.title,
      timestamp: '2026-01-01T00:00:00.000Z',
      source: input.source,
      simplifications: input.simplifications,
      deploy: input.deploy
    };
    this.entries.push(entry);
    return entry;
  }
}

function pipelineWith(
  simplifications: RecordingSimplificationsService,
  deploy: RecordingDeployService,
  log: RecordingLogService
): LivePublishPipelineService {
  return new LivePublishPipelineService(
    simplifications as unknown as SimplificationsService,
    deploy as unknown as InscienceV2DeployService,
    log as unknown as LivePublishLogService
  );
}

async function main(): Promise<void> {
  {
    const simplifications = new RecordingSimplificationsService();
    const deploy = new RecordingDeployService();
    const log = new RecordingLogService();
    const pipeline = pipelineWith(simplifications, deploy, log);
    const [result] = await pipeline.runMany([
      { slug: 'public-article', source: 'publish', runSimplifications: false }
    ]);

    assert.deepStrictEqual(simplifications.slugs, [], 'flag false must not spawn generate:simplifications');
    assert.strictEqual(deploy.calls, 1, 'deploy still runs when simplifications are skipped');
    assert.deepStrictEqual(result?.simplifications, SKIPPED_SIMPLIFICATIONS_RESULT);
    assert.strictEqual(result?.simplifications.skipped, true);
    assert.strictEqual(result?.deploy.ok, true);
  }

  {
    const simplifications = new RecordingSimplificationsService();
    const deploy = new RecordingDeployService();
    const log = new RecordingLogService();
    const pipeline = pipelineWith(simplifications, deploy, log);
    await pipeline.runMany([{ slug: 'public-article', source: 'publish' }]);

    assert.deepStrictEqual(
      simplifications.slugs,
      ['public-article'],
      'missing flag keeps current ON behavior'
    );
    assert.strictEqual(deploy.calls, 1, 'deploy runs after simplifications');
  }

  {
    const simplifications = new RecordingSimplificationsService();
    const deploy = new RecordingDeployService();
    const log = new RecordingLogService();
    const pipeline = pipelineWith(simplifications, deploy, log);
    await pipeline.runMany([
      { slug: 'public-article', source: 'replay', runSimplifications: true }
    ]);

    assert.deepStrictEqual(
      simplifications.slugs,
      ['public-article'],
      'explicit true still generates simplifications'
    );
  }

  console.log('live-publish simplifications asserts passed');
}

void main();
