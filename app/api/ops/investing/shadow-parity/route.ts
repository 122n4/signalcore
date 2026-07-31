import {NextResponse} from "next/server";import {createProductionShadowParityServiceV1} from "@/lib/investing/shadow-parity/composition.server";
export const runtime="nodejs";export const dynamic="force-dynamic";const noStore={"Cache-Control":"no-store"};
export async function GET(){const result=await createProductionShadowParityServiceV1().progress();return NextResponse.json(result,{status:result.ok?200:403,headers:noStore})}
export async function POST(req:Request){const body=await req.json().catch(()=>({})),now=new Date(),dayKey=typeof body.dayKey==="string"?body.dayKey:now.toISOString().slice(0,10);
 const observedAt=typeof body.observedAt==="string"?body.observedAt:now.toISOString();const result=await createProductionShadowParityServiceV1().run({dayKey,observedAt});
 const status=result.ok?200:("reason" in result&&result.reason==="shadow_parity_not_authorized"?403:409);return NextResponse.json(result,{status,headers:noStore})}
