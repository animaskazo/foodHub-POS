import {staffContext,json,cors} from "../_shared/instagram.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const {sb,organizationId}=await staffContext(req);
  const {conversation_id,mode}=await req.json();
  if(!/^[0-9a-f-]{36}$/i.test(conversation_id||"")||!["ai","human"].includes(mode))return json({error:"Invalid input"},400);
  const {data,error}=await sb.from("channel_conversations").update({mode,updated_at:new Date().toISOString()}).eq("id",conversation_id).eq("organization_id",organizationId).eq("channel","instagram").select("id,mode").maybeSingle();
  if(error)throw error;
  if(!data)return json({error:"Conversation not found"},404);
  return json(data);
 }catch(e){return json({error:e.message},e.message==="Unauthorized"?401:e.message==="Forbidden"?403:500)}
});
