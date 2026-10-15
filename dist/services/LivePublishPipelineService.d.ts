import { InscienceV2DeployService } from './InscienceV2DeployService';
import { LivePublishInput, LivePublishLogEntry, LivePublishLogService, LivePublishStepResult } from './LivePublishLogService';
import { SimplificationsService } from './SimplificationsService';
export interface LivePublishPipelineResult {
    entry: LivePublishLogEntry;
    simplifications: LivePublishStepResult;
    deploy: LivePublishStepResult;
}
export declare class LivePublishPipelineService {
    private readonly simplificationsService;
    private readonly deployService;
    private readonly logService;
    constructor(simplificationsService?: SimplificationsService, deployService?: InscienceV2DeployService, logService?: LivePublishLogService);
    getLogService(): LivePublishLogService;
    run(input: LivePublishInput): Promise<LivePublishPipelineResult>;
    runMany(inputs: LivePublishInput[]): Promise<LivePublishPipelineResult[]>;
    private toStepResult;
    private toStep;
}
//# sourceMappingURL=LivePublishPipelineService.d.ts.map