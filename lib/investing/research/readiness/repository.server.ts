import "server-only";
import type {BetaReadinessManifest,BetaReadinessReport} from "./types";
export type PersistedBetaReadiness=Readonly<{manifest:BetaReadinessManifest;
 report:BetaReadinessReport}>;
export interface BetaReadinessRepository{
 persist(value:PersistedBetaReadiness):Promise<Readonly<{value:PersistedBetaReadiness;
  reused:boolean}>>;
 get(reportHash:string):Promise<PersistedBetaReadiness|null>;
}
