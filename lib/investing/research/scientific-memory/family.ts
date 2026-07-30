export const scientificMemoryFamilyId=(hypothesisId:string,hypothesisVersion:string)=>
  `irfamily_v1_${hypothesisId.length}_${hypothesisId}_${hypothesisVersion}`;
