import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
export const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
export const json = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
export const env = (key:string)=>Deno.env.get(key) || "";
export const admin = ()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"));
export async function staffContext(req:Request) {
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.startsWith("Bearer ")) throw new Error("Unauthorized");
  const sb=admin();
  const {data:{user},error}=await sb.auth.getUser(authorization.slice(7));
  if(error||!user) throw new Error("Unauthorized");
  const {data:staff,error:staffError}=await sb.from("staff").select("organization_id").eq("id",user.id).single();
  if(staffError||!staff?.organization_id) throw new Error("Forbidden");
  return {sb,user,organizationId:staff.organization_id as string};
}
export async function encrypted(value:string) {
  const raw=Uint8Array.from(atob(env("INSTAGRAM_TOKEN_ENCRYPTION_KEY")),c=>c.charCodeAt(0));
  if(raw.length!==32) throw new Error("Encryption key must be 32 bytes");
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...iv,...cipher));
}
export async function decrypted(value:string) {
  const raw=Uint8Array.from(atob(env("INSTAGRAM_TOKEN_ENCRYPTION_KEY")),c=>c.charCodeAt(0));
  const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes.slice(0,12)},key,bytes.slice(12)));
}
export async function sendInstagram(accessToken:string,recipient:string,text:string) {
  const response=await fetch("https://graph.instagram.com/"+(env("META_GRAPH_VERSION")||"v24.0")+"/me/messages",{
    method:"POST",headers:{"Authorization":"Bearer "+accessToken,"Content-Type":"application/json"},
    body:JSON.stringify({recipient:{id:recipient},message:{text}})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error("Instagram API rejected message ("+response.status+")");
  return result;
}
