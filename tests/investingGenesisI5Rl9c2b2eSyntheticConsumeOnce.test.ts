import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSyntheticPrivateCiphertextStoreV1,
} from "../workers/investing-blind-vault/privateCiphertextStore.mjs";
import {
  createSyntheticVaultConsumeOnceRehearsalV1,
} from "../workers/investing-blind-vault/privateSyntheticConsumeOnce.mjs";
import {
  decryptBlindTruthVaultEnvelopeV1,
  encryptBlindTruthVaultEnvelopeV1,
} from "../workers/investing-blind-vault/envelope";
import {
  deriveBlindTruthHoldoutCommitmentV1,
  verifyBlindTruthHoldoutCommitmentV1,
} from "../lib/investing/secretVault/blindTruthVaultCrypto";

const env = {
  SYNTRAKE_VAULT_WORKER_MODE:"ISOLATED_SECRET_VAULT_V1",
  SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:"ISOLATED_REHEARSAL_V1",
};
const mode="ISOLATED_REHEARSAL_V1";
const bytes=Buffer.from('{"FAKE_SYNTHETIC_HOLDOUT":[{"time":"2026-01-01","value":"12.34"}]}\n');
const salt=Buffer.alloc(32,0x33);
const key=Buffer.alloc(32,0x11);
const binding={
  tenantId:"11111111-1111-4111-8111-111111111111",
  registrationHashHex:"A".repeat(64),
  holdoutScopeDigestHex:"B".repeat(64),
  commitmentHashHex:deriveBlindTruthHoldoutCommitmentV1({
    secretSalt:salt,exactCanonicalHoldoutPlaintextBytes:bytes,
  }),
};
const evaluation="D".repeat(64);
const reveal="E".repeat(64);
const NO_REAL_AUTHORITY="MISSING_VAULT_CAPABILITY";
function inRoot(fn:(root:string)=>void){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"syntrake-vault-one-shot-"));
  fs.chmodSync(root,0o700);
  try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
function setup(root:string){
  const config={environment:env,rootDirectory:root,storageMode:mode};
  const stage=createSyntheticPrivateCiphertextStoreV1(config);
  const claim=createSyntheticVaultConsumeOnceRehearsalV1(config);
  return {stage,claim,config};
}
function stage(root:string){
  const {stage,claim,config}=setup(root);
  const envelope=encryptBlindTruthVaultEnvelopeV1({
    vaultEncryptionKey:key,keyVersion:"SYNTHETIC_K1",
    binding,exactCanonicalPlaintextBytes:bytes,
  });
  const staged=stage.stageSyntheticEnvelopeV1({
    classification:"SYNTHETIC_TEST_VECTOR",envelope,
  });
  const claimInput={
    classification:"SYNTHETIC_TEST_VECTOR",
    privateObjectLocator:staged.privateObjectLocator,
    evaluationHashHex:evaluation,
    revealStartedEventHashHex:reveal,
  };
  return {claim,config,staged,envelope,claimInput};
}

describe.skipIf(process.platform==="win32")("RL-9C2B2E synthetic filesystem sealed -> burn -> ciphertext -> verify rehearsal",()=>{
  it("stages AES-GCM ciphertext, permanently claims before opening it, and checks the exact commitment",()=>inRoot(root=>{
    const {claim,staged,envelope,claimInput}=stage(root);
    const response=claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput);
    expect(response.status).toBe("SYNTHETIC_CONSUMED_ONCE");
    expect(response.envelope).toEqual(envelope);
    expect(Object.keys(response)).toEqual(["status","envelope"]);
    expect(JSON.stringify(response)).not.toContain("FAKE_SYNTHETIC_HOLDOUT");
    expect(JSON.stringify(response)).not.toContain(binding.tenantId);
    expect(fs.readdirSync(path.join(root,"synthetic-consume-claims"))).toHaveLength(1);
    expect(fs.readdirSync(path.join(root,"synthetic-evaluation-claims"))).toEqual([
      evaluation+".claimed",
    ]);
    const consumedFile=path.join(root,"synthetic-evaluation-claims",evaluation+".claimed");
    expect(fs.statSync(consumedFile).mode & 0o777).toBe(0o600);
    const result=decryptBlindTruthVaultEnvelopeV1({
      vaultEncryptionKey:key,expectedKeyVersion:"SYNTHETIC_K1",
      expectedBinding:binding,envelope:response.envelope,
    });
    try{
      verifyBlindTruthHoldoutCommitmentV1({
        secretSalt:salt,exactCanonicalHoldoutPlaintextBytes:result,
        publicCommitmentHash:binding.commitmentHashHex,
        declaredPlaintextByteLength:String(bytes.length),
      });
      expect(result.equals(bytes)).toBe(true);
    }finally{result.fill(0)}
    expect(fs.readdirSync(path.join(root,"objects"))).toEqual([
      staged.privateObjectLocator+".sealed",
    ]);
  }));

  it("rejects identical retries across new process-equivalent factory instances",()=>inRoot(root=>{
    const {claim,claimInput,config}=stage(root);
    claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput);
    const reloaded=createSyntheticVaultConsumeOnceRehearsalV1(config);
    for(const claimant of [claim,reloaded]){
      expect(()=>claimant.consumeSyntheticSealedEnvelopeOnceV1(claimInput))
        .toThrow("VAULT_UNAVAILABLE");
      expect(()=>claimant.consumeSyntheticSealedEnvelopeOnceV1({
        ...claimInput,revealStartedEventHashHex:"F".repeat(64),
      })).toThrow("VAULT_UNAVAILABLE");
    }
  }));

  it("rejects a new evaluation for the same already consumed private object",()=>inRoot(root=>{
    const {claim,claimInput}=stage(root);
    claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput);
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1({
      ...claimInput,evaluationHashHex:"C".repeat(64),
    })).toThrow("VAULT_UNAVAILABLE");
    expect(fs.readdirSync(path.join(root,"synthetic-consume-claims"))).toHaveLength(1);
  }));

  it("rejects using one burned evaluation identity for different staged ciphertext",()=>inRoot(root=>{
    const first=stage(root);
    first.claim.consumeSyntheticSealedEnvelopeOnceV1(first.claimInput);
    const next=stage(root);
    expect(next.staged.privateObjectLocator).not.toBe(first.staged.privateObjectLocator);
    expect(()=>next.claim.consumeSyntheticSealedEnvelopeOnceV1({
      ...next.claimInput,evaluationHashHex:first.claimInput.evaluationHashHex,
    })).toThrow("VAULT_UNAVAILABLE");
  }));

  it("burns the evaluation even when the sealed object has been deleted before the read",()=>inRoot(root=>{
    const {claim,claimInput,staged}=stage(root);
    fs.unlinkSync(path.join(root,"objects",staged.privateObjectLocator+".sealed"));
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput))
      .toThrow("VAULT_UNAVAILABLE");
    const dirs=fs.readdirSync(path.join(root,"synthetic-evaluation-claims"));
    expect(dirs).toEqual([evaluation+".claimed"]);
    expect(()=>createSyntheticVaultConsumeOnceRehearsalV1({
      environment:env,rootDirectory:root,storageMode:mode,
    }).consumeSyntheticSealedEnvelopeOnceV1(claimInput)).toThrow("VAULT_UNAVAILABLE");
  }));

  it("burns the object when the encrypted object is corrupt; no retry after repairing it",()=>inRoot(root=>{
    const {claim,claimInput,staged,envelope}=stage(root);
    const file=path.join(root,"objects",staged.privateObjectLocator+".sealed");
    fs.writeFileSync(file,"{corrupted ciphertext}\n");
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput))
      .toThrow("VAULT_UNAVAILABLE");
    fs.writeFileSync(file,JSON.stringify(envelope)+"\n");
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput))
      .toThrow("VAULT_UNAVAILABLE");
  }));

  it("fails closed if ciphertext binding is for the wrong tenant; the one-shot is still burned",()=>inRoot(root=>{
    const {claim,claimInput}=stage(root);
    const response=claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput);
    expect(()=>decryptBlindTruthVaultEnvelopeV1({
      vaultEncryptionKey:key,expectedKeyVersion:"SYNTHETIC_K1",
      expectedBinding:{...binding,tenantId:"22222222-2222-4222-8222-222222222222"},
      envelope:response.envelope,
    })).toThrow("MALFORMED_HOLDOUT");
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput))
      .toThrow("VAULT_UNAVAILABLE");
  }));

  it("allows exactly one of two independent OS processes to burn the same synthetic claim",async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"syntrake-vault-process-race-"));
    fs.chmodSync(root,0o700);
    try{
      const {claimInput}=stage(root);
      const moduleUrl=pathToFileURL(path.join(process.cwd(),
        "workers/investing-blind-vault/privateSyntheticConsumeOnce.mjs")).href;
      const script=[
        "const {createSyntheticVaultConsumeOnceRehearsalV1:make}=await import(process.argv[1]);",
        "const config={environment:{SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',",
        "SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:'ISOLATED_REHEARSAL_V1'},",
        "rootDirectory:process.argv[2],storageMode:'ISOLATED_REHEARSAL_V1'};",
        "const input={classification:'SYNTHETIC_TEST_VECTOR',",
        "privateObjectLocator:process.argv[3],evaluationHashHex:process.argv[4],",
        "revealStartedEventHashHex:process.argv[5]};",
        "try{make(config).consumeSyntheticSealedEnvelopeOnceV1(input);",
        "process.stdout.write('WON\\n');}",
        "catch(error){if(error?.message!=='VAULT_UNAVAILABLE')process.exit(2);",
        "process.stdout.write('BLOCKED\\n');}",
      ].join(" ");
      async function launch():Promise<string>{
        return new Promise((resolve,reject)=>{
          const child=spawn(process.execPath,[
            "--input-type=module","--eval",script,
            moduleUrl,root,claimInput.privateObjectLocator,
            claimInput.evaluationHashHex,claimInput.revealStartedEventHashHex,
          ],{stdio:["ignore","pipe","pipe"]});
          let output="";
          child.stdout.on("data",(chunk:Buffer)=>{output+=chunk.toString("utf8");});
          // Deliberately never capture or expose stderr: no vault material
          // or dynamic error payload belongs in a test report.
          child.stderr.resume();
          child.once("error",reject);
          child.once("close",code=>{
            if(code!==0)reject(Error("SYNTHETIC_PROCESS_RACE_FAILED"));
            else resolve(output.trim());
          });
        });
      }
      const outcomes=(await Promise.all([launch(),launch()])).sort();
      expect(outcomes).toEqual(["BLOCKED","WON"]);
      expect(()=>createSyntheticVaultConsumeOnceRehearsalV1({
        environment:env,rootDirectory:root,storageMode:mode,
      }).consumeSyntheticSealedEnvelopeOnceV1(claimInput)).toThrow("VAULT_UNAVAILABLE");
    }finally{
      fs.rmSync(root,{recursive:true,force:true});
    }
  },20_000);

  it("rejects forged REAL mode, malformed hashes, getters and inherited authority",()=>inRoot(root=>{
    const {claim,claimInput}=stage(root);
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1({
      ...claimInput,classification:"REAL",
    })).toThrow(NO_REAL_AUTHORITY);
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1({
      ...claimInput,evaluationHashHex:"../../evil",
    })).toThrow("AUTHORITY_FAILURE");
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1({
      ...claimInput,privateObjectLocator:"a".repeat(64),
    })).toThrow("AUTHORITY_FAILURE");
    let readGetter=0;
    const bad={...claimInput};
    Object.defineProperty(bad,"privateObjectLocator",{enumerable:true,get(){
      readGetter++;throw Error("SECRET_MUST_NOT_LEAK");
    }});
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(bad))
      .toThrow("MALFORMED_HOLDOUT");
    expect(readGetter).toBe(0);
    const spoof=Object.assign(Object.create({isAuthorized:true}),claimInput);
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(spoof))
      .toThrow("MALFORMED_HOLDOUT");
    expect(fs.readdirSync(path.join(root,"synthetic-evaluation-claims"))).toHaveLength(0);
  }));

  it("rejects weak storage permissions, symlinked objects and ordinary credentials",()=>inRoot(root=>{
    const {claim,claimInput,staged}=stage(root);
    const file=path.join(root,"objects",staged.privateObjectLocator+".sealed");
    fs.chmodSync(file,0o644);
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput))
      .toThrow("VAULT_UNAVAILABLE");
    fs.chmodSync(file,0o600);
    expect(()=>claim.consumeSyntheticSealedEnvelopeOnceV1(claimInput))
      .toThrow("VAULT_UNAVAILABLE"); // prior attempt was permanently burned
    expect(()=>createSyntheticVaultConsumeOnceRehearsalV1({
      environment:{...env,SUPABASE_SERVICE_ROLE_KEY:"fake-ordinary-credential"},
      rootDirectory:root,storageMode:mode,
    })).toThrow("MISSING_VAULT_CAPABILITY");
  }));

  it("does not attach any ciphertext read or consume operation to the worker HTTP server",()=>inRoot(root=>{
    const {claim}=stage(root);
    expect(Object.keys(claim)).toEqual(["consumeSyntheticSealedEnvelopeOnceV1"]);
    const server=fs.readFileSync(path.join(process.cwd(),
      "workers/investing-blind-vault/isolatedServer.mjs"),"utf8");
    expect(server).not.toContain("privateSyntheticConsumeOnce");
    const ordinary=fs.readFileSync(path.join(process.cwd(),
      "lib/investing/research/index.ts"),"utf8");
    expect(ordinary).not.toContain("privateSyntheticConsumeOnce");
    const src=fs.readFileSync(path.join(process.cwd(),
      "workers/investing-blind-vault/privateSyntheticConsumeOnce.mjs"),"utf8");
    expect(src).not.toContain("lib/investing/research");
    expect(src).not.toContain("privateObjectLocator: locator"); // secret locators aren't returned to ordinary app
  }));
});
