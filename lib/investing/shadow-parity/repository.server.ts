import type {ShadowParityCycle,ShadowParityProgress} from "./types";
export interface ShadowParityRepository{record(cycle:ShadowParityCycle):Promise<Readonly<{cycle:ShadowParityCycle;reused:boolean}>>;
 progress(scope:ShadowParityCycle["scope"]):Promise<ShadowParityProgress>}
