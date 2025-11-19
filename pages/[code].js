
import { getLink, incrementClick } from "../lib/dynamo";

export async function getServerSideProps({params,res}){
  const {code}=params;
  const link=await getLink(code);
  if(!link) return {notFound:true};
  incrementClick(code).catch(()=>{});
  res.writeHead(302,{Location:link.url});
  res.end();
  return {props:{}};
}

export default function Page(){return null;}
