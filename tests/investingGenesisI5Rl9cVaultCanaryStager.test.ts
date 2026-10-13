import { describe, it, expect } from "vitest";
import {
  stageExistingPrivateVaultCanaryV1,
} from "../scripts/investing/rl9cVaultCanaryStager.mjs";
import {
  SYNTHETIC_MARKER, canarySubjectDigest,
} from "../scripts/investing/rl9c2b2cStorageIsolationProbe.mjs";

const config = Object.freeze({
  primaryProjectRef: "qdnvbamoamtkujzwrxdb",
  vaultProjectRef: "nlgxqbggvgigcggaybas",
  bucket: "syntrake-private-canary",
  objectPath: "rl9c2b2c-isolation-canary-v1/" + "a".repeat(32) + ".txt",
});
const key = "sb_secret_" + "A".repeat(22) + "_" + "B".repeat(8);
const root = `https://${config.vaultProjectRef}.supabase.co/storage/v1`;

function mockSuccess(calls: Array<{url:string;options:RequestInit}>) {
  return async (url:string, options:RequestInit) => {
    calls.push({url,options});
    const next = calls.length;
    if (next === 1) return new Response(JSON.stringify({
      id:config.bucket,name:config.bucket,public:false,
    }),{status:200});
    if (next === 2) return new Response("{}",{status:200});
    if (next === 3) return new Response(SYNTHETIC_MARKER,{status:200});
    throw new Error("Unexpected additional operation");
  };
}

describe("RL-9C Vault G2 canary stager (isolated operator only)", () => {
  it("verifies private bucket, uploads exactly marker without upsert, then byte-readback",async () => {
    const calls:Array<{url:string;options:RequestInit}> = [];
    const result = await stageExistingPrivateVaultCanaryV1({
      config,credential:key,fetcher:mockSuccess(calls),
    });
    expect(result).toEqual({
      classification:"OPERATOR_SYNTHETIC_CANARY_ONLY",
      status:"SYNTHETIC_CANARY_STAGED_AND_READBACK_VERIFIED",
      subjectDigest:canarySubjectDigest(config),
    });
    expect(calls).toHaveLength(3);
    expect(calls.map(x=>x.url)).toEqual([
      root + "/bucket/" + config.bucket,
      root + "/object/" + config.bucket + "/" + config.objectPath,
      root + "/object/authenticated/" + config.bucket + "/" + config.objectPath,
    ]);
    expect(calls.map(x=>x.options.method)).toEqual(["GET","POST","GET"]);
    const upload = calls[1].options;
    expect(upload.body).toBe(SYNTHETIC_MARKER);
    expect((upload.headers as Record<string,string>)["x-upsert"]).toBe("false");
    expect((upload.headers as Record<string,string>).apikey).toBe(key);
    expect((upload.headers as Record<string,string>)).not.toHaveProperty("authorization");
    for (const c of calls) {
      expect(c.options.redirect).toBe("manual");
      expect(c.options.cache).toBe("no-store");
    }
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(config.objectPath);
  });

  it("rejects public buckets without attempting any upload",async () => {
    const calls:string[]=[];
    const fetcher = async (url:string) => {
      calls.push(url);
      return new Response(JSON.stringify({id:config.bucket,name:config.bucket,public:true}),{status:200});
    };
    await expect(stageExistingPrivateVaultCanaryV1({config,credential:key,fetcher}))
      .rejects.toThrow("RL9C_CANARY_STAGE_BLOCKED");
    expect(calls).toEqual([root + "/bucket/" + config.bucket]);
  });

  it("rejects wrong bucket identity or malformed JSON before upload",async () => {
    for(const body of [
      "{nope",JSON.stringify({id:"another",name:config.bucket,public:false}),
      JSON.stringify({id:config.bucket,name:"another",public:false}),
      JSON.stringify({id:config.bucket,name:config.bucket,public:"false"}),
      "x".repeat(2100),
    ]) {
      let calls=0;
      const fetcher=async()=>{calls++;return new Response(body,{status:200});};
      await expect(stageExistingPrivateVaultCanaryV1({config,credential:key,fetcher}))
        .rejects.toThrow("RL9C_CANARY_STAGE_BLOCKED");
      expect(calls).toBe(1);
    }
  });

  it("rejects existing object collision, redirects, and unverified upload",async () => {
    for(const code of [302,401,403,404,409,500]) {
      let calls=0;
      const fetcher=async()=>{
        calls++;
        return calls===1
          ?new Response(JSON.stringify({id:config.bucket,name:config.bucket,public:false}),{status:200})
          :new Response("error",{status:code});
      };
      await expect(stageExistingPrivateVaultCanaryV1({config,credential:key,fetcher}))
        .rejects.toThrow("RL9C_CANARY_STAGE_BLOCKED");
      expect(calls).toBe(2);
    }
  });

  it("rejects successful upload when readback differs or is unavailable",async () => {
    for(const value of ["wrong", "x".repeat(1025), "", null]) {
      let calls=0;
      const fetcher=async()=>{
        calls++;
        if(calls===1) return new Response(JSON.stringify({
          id:config.bucket,name:config.bucket,public:false,
        }),{status:200});
        if(calls===2) return new Response("{}",{status:201});
        return value===null?new Response("missing",{status:404}):new Response(value,{status:200});
      };
      await expect(stageExistingPrivateVaultCanaryV1({config,credential:key,fetcher}))
        .rejects.toThrow("RL9C_CANARY_STAGE_BLOCKED");
      expect(calls).toBe(3);
    }
  });

  it("fails closed on network failure without credential or URL reflection",async()=>{
    await expect(stageExistingPrivateVaultCanaryV1({config,credential:key,
      fetcher:async()=>{throw Error("operator-private-key="+key);},
    })).rejects.toThrow("RL9C_CANARY_STAGE_BLOCKED");
  });

  it("rejects unsafe service credentials, provider refs or paths before network access",async()=>{
    const fetcher=async()=>{throw Error("MUST_NOT_FETCH");};
    for(const credential of ["",key+" ",key+"\\n","sb_publishable_"+ "A".repeat(22)+"_"+"B".repeat(8)]) {
      await expect(stageExistingPrivateVaultCanaryV1({config,credential,fetcher}))
        .rejects.toThrow("RL9C_CANARY_STAGE_BLOCKED");
    }
    for(const modified of [
      {...config,primaryProjectRef:config.vaultProjectRef},
      {...config,vaultProjectRef:"evil.example.com"},
      {...config,objectPath:"real-holdout.json"},
      {...config,bucket:"../../leak"},
    ]) {
      await expect(stageExistingPrivateVaultCanaryV1({config:modified,credential:key,fetcher}))
        .rejects.toThrow();
    }
  });
});
