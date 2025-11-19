
import { getLink, deleteLink } from "../../../lib/dynamo";

export default async function handler(req,res){
  const {code}=req.query;
  if(req.method==="GET"){
    const l=await getLink(code);
    if(!l) return res.status(404).json({error:"Not found"});
    return res.status(200).json(l);
  }
  if(req.method==="DELETE"){
    const l=await getLink(code);
    if(!l) return res.status(404).json({error:"Not found"});
    await deleteLink(code);
    return res.status(200).json({success:true});
  }
  res.status(405).end();
}
