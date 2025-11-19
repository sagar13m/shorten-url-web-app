
import { createLink, listLinks } from "../../../lib/dynamo";

function validCode(c){return /^[A-Za-z0-9]{6,8}$/.test(c);}
function validUrl(u){try{new URL(u);return true;}catch{return false;}}

export default async function handler(req,res){
  if(req.method==="GET"){
    return res.status(200).json(await listLinks());
  }
  if(req.method==="POST"){
    const {url,code} = req.body;
    if(!validUrl(url)) return res.status(400).json({error:"Invalid URL"});
    let c = code;
    if(c && !validCode(c)) return res.status(400).json({error:"Invalid code"});
    if(!c){
      const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      c=[...crypto.getRandomValues(new Uint8Array(6))].map(b=>chars[b%62]).join("");
    }
    try{
      await createLink({code:c,url});
      return res.status(201).json({code:c,url});
    }catch(e){
      if((e+"").includes("ConditionalCheckFailed")) return res.status(409).json({error:"Code exists"});
      return res.status(500).json({error:"Internal"});
    }
  }
  res.status(405).end();
}
