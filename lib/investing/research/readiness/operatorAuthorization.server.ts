import "server-only";export const BETA_OPERATOR_USER_IDS_ENV="INVESTING_BETA_OPERATOR_USER_IDS" as const;
const user=/^user_[A-Za-z0-9_-]{1,128}$/u;export function isAuthorizedBetaOperator(authenticatedUserId:unknown,raw:unknown){
 if(typeof authenticatedUserId!=="string"||!user.test(authenticatedUserId)||typeof raw!=="string")return false;
 const entries=raw.split(",").map(v=>v.trim()).filter(Boolean);return entries.length>0&&new Set(entries).size===entries.length
  &&entries.every(v=>user.test(v))&&entries.includes(authenticatedUserId)}
