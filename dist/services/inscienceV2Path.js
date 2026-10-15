"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultInscienceV2Dir = defaultInscienceV2Dir;
const path_1 = __importDefault(require("path"));
/** Sibling inscience-v2 checkout. Override with INSCIENCE_V2_DIR. */
function defaultInscienceV2Dir() {
    const fromEnv = process.env.INSCIENCE_V2_DIR?.trim();
    if (fromEnv)
        return path_1.default.resolve(fromEnv);
    // src/services or dist/services → repo sibling ../inscience-v2
    return path_1.default.resolve(__dirname, '..', '..', '..', 'inscience-v2');
}
//# sourceMappingURL=inscienceV2Path.js.map