import {staffContext,json,cors} from "../_shared/instagram.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const {sb,organizationId}=await staffContext(req);
  const {data,error}=await sb.from("instagram_connections").select("status,username,connected_at,token_expires_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  return json(data||{status:"disconnected"});
 }catch(e){return json({error:e.message},e.message==="Unauthorized"?401:e.message==="Forbidden"?403:500)}
});
