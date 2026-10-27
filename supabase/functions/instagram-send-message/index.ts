import {staffContext,json,cors,decrypted,sendInstagram} from "../_shared/instagram.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const {sb,organizationId}=await staffContext(req);
  const {conversation_id,text}=await req.json();
  if(typeof conversation_id!=="string"||typeof text!=="string"||!text.trim()||text.length>1000)return json({error:"Invalid message"},400);
  const {data:conversation,error:lookupError}=await sb.from("channel_conversations").select("id,channel_account_id,external_customer_id,mode,last_message_at").eq("id",conversation_id).eq("organization_id",organizationId).eq("channel","instagram").maybeSingle();
  if(lookupError)throw lookupError;
  if(!conversation)return json({error:"Conversation not found"},404);
  if(conversation.mode!=="human")return json({error:"Switch to human mode before sending"},409);
  const {data:connection,error:connectionError}=await sb.from("instagram_connections").select("encrypted_access_token").eq("organization_id",organizationId).eq("instagram_user_id",conversation.channel_account_id).eq("status","connected").maybeSingle();
  if(connectionError)throw connectionError;
  if(!connection?.encrypted_access_token)return json({error:"Instagram is not connected"},409);
  // Instagram's messaging window is policy-restricted. Block stale conversations conservatively.
  const {data:lastInbound,error:inboundError}=await sb.from("channel_messages").select("created_at").eq("conversation_id",conversation_id).eq("organization_id",organizationId).eq("direction","inbound").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(inboundError)throw inboundError;
  if(!lastInbound||Date.now()-new Date(lastInbound.created_at).getTime()>23*60*60*1000)return json({error:"Outside standard messaging window"},409);
  const result=await sendInstagram(await decrypted(connection.encrypted_access_token),conversation.external_customer_id,text.trim());
  const {error:insertError}=await sb.from("channel_messages").insert({organization_id:organizationId,conversation_id,direction:"outbound",sender_type:"staff",body:text.trim(),delivery_status:"sent",provider_message_id:result.message_id||null});
  if(insertError)throw insertError;
  await sb.from("channel_conversations").update({last_message_preview:text.trim().slice(0,180),last_message_at:new Date().toISOString()}).eq("id",conversation_id).eq("organization_id",organizationId);
  return json({sent:true});
 }catch(e){return json({error:e.message},e.message==="Unauthorized"?401:e.message==="Forbidden"?403:500)}
});
