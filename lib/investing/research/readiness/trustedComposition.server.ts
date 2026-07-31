import "server-only";
import {BETA_READINESS_GATE_IDS} from "./types";import {HttpTrustedAttestationSource} from "./trustedHttpSource.server";
import {TrustedBetaReadinessRuntime,type TrustedIssuer} from "./trustedRuntime.server";
export function createProductionTrustedBetaReadinessRuntime(){const baseUrl=process.env.BETA_ATTESTATION_URL??"";
 const token=process.env.BETA_ATTESTATION_TOKEN??"";const timeout=Number(process.env.BETA_ATTESTATION_TIMEOUT_MS??"5000");
 const issuers:TrustedIssuer[]=BETA_READINESS_GATE_IDS.map(gateId=>({gateId,
  issuerId:process.env[`BETA_ATTESTATION_${gateId.toUpperCase()}_ISSUER`]??"",
  publicKey:(process.env[`BETA_ATTESTATION_${gateId.toUpperCase()}_PUBLIC_KEY`]??"").replaceAll("\\n","\n")}));
 if(!token||issuers.some(v=>!v.issuerId||!v.publicKey))throw new Error("trusted_attestation_configuration_missing");
 return new TrustedBetaReadinessRuntime(new HttpTrustedAttestationSource(baseUrl,token),issuers,timeout)}
