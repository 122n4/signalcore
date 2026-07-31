import "server-only";
import type {BetaReadinessOpsEntry} from "./opsTypes";
export interface BetaReadinessOpsRepository{read():Promise<readonly BetaReadinessOpsEntry[]>}
