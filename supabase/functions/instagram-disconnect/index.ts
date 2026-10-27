import {staffContext,json,cors} from "../_shared/instagram.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const {sb,organizationId}=await staffContext(req);
  const {error}=await sb.from("instagram_connections").update({status:"disconnected",encrypted_access_token:null,token_expires_at:null,updated_at:new Date().toISOString()}).eq("organization_id",organizationId);
  if(error)throw error;
  return json({disconnected:true});
 }catch(e){return json({error:e.message},e.message==="Unauthorized"?401:e.message==="Forbidden"?403:500)}
});
