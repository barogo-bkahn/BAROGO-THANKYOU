export const orgValue=value=>{
  const text=String(value??'').trim();
  return text===''||text==='-'?null:text;
};
// Directional rule: the sender's populated level determines the comparison.
export function sameOrganization(sender,recipient){
  if(sender.org_exempt===true)return false;
  const part3=orgValue(sender.part3),part2=orgValue(sender.part2);
  if(part3!==null)return part3===orgValue(recipient.part3);
  if(part2!==null)return part2===orgValue(recipient.part2);
  return null; // No usable sender organization; require People correction.
}
