"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivePublishLogService = void 0;
exports.parseLivePublishSource = parseLivePublishSource;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function isLivePublishSource(value) {
    return value === 'publish' || value === 'replay' || value === 'manual';
}
function parseLivePublishSource(value, fallback) {
    return isLivePublishSource(value) ? value : fallback;
}
class LivePublishLogService {
    constructor() {
        const dir = path_1.default.join(process.cwd(), 'saved-posts');
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        this.filePath = path_1.default.join(dir, 'live-publish-log.json');
    }
    list() {
        const log = this.read();
        return [...log.entries].reverse();
    }
    findById(id) {
        return this.read().entries.find((entry) => entry.id === id);
    }
    findLatestBySlug(slug) {
        const entries = this.list();
        return entries.find((entry) => entry.slug === slug);
    }
    append(input) {
        const timestamp = new Date().toISOString();
        const entry = {
            id: `${input.slug}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            slug: input.slug,
            title: input.title,
            postId: input.postId,
            postUrl: input.postUrl,
            publishedAt: input.publishedAt,
            timestamp,
            source: input.source,
            simplifications: input.simplifications,
            deploy: input.deploy
        };
        const log = this.read();
        log.entries.push(entry);
        fs_1.default.writeFileSync(this.filePath, JSON.stringify(log, null, 2), 'utf8');
        console.log(`Live publish log appended: ${entry.id}`);
        return entry;
    }
    read() {
        if (!fs_1.default.existsSync(this.filePath)) {
            return { version: 1, entries: [] };
        }
        try {
            const parsed = JSON.parse(fs_1.default.readFileSync(this.filePath, 'utf8'));
            if (!parsed || !Array.isArray(parsed.entries)) {
                return { version: 1, entries: [] };
            }
            return { version: 1, entries: parsed.entries };
        }
        catch (error) {
            console.error('Failed to read live-publish-log.json, starting a new log:', error);
            return { version: 1, entries: [] };
        }
    }
}
exports.LivePublishLogService = LivePublishLogService;
//# sourceMappingURL=LivePublishLogService.js.map