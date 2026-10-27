import {admin,env,decrypted,sendInstagram,json} from "../_shared/instagram.ts";

/**
 * Internal worker invoked by a trusted scheduler with INSTAGRAM_WORKER_SECRET.
 * Chat is integrated with food-agent; order placement is deliberately not automated
 * until idempotent checkout and explicit customer phone collection are completed.
 */
Deno.serve(async request=>{
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 const expected=env("INSTAGRAM_WORKER_SECRET");
 if(!expected||request.headers.get("x-worker-secret")!==expected)return json({error:"Unauthorized"},401);
 const sb=admin();
 const {data:events,error}=await sb.from("channel_events").select("id,organization_id,provider_event_id,payload")
  .eq("channel","instagram").eq("event_type","message.received").eq("status","received").order("created_at").limit(20);
 if(error)return json({error:"Queue unavailable"},500);
 let processed=0,failed=0;
 for(const event of events||[]){
  const {data:claim,error:claimError}=await sb.from("channel_events").update({status:"processing"})
   .eq("id",event.id).eq("status","received").select("id").maybeSingle();
  if(claimError||!claim)continue;
  try{
   const p=event.payload;
   if(typeof p?.text!=="string"||!p.text.trim()){
    await sb.from("channel_events").update({status:"ignored",processed_at:new Date().toISOString()}).eq("id",event.id);
    continue;
   }
   const {data:connection}=await sb.from("instagram_connections").select("encrypted_access_token").eq("organization_id",event.organization_id).eq("instagram_user_id",p.account_id).eq("status","connected").maybeSingle();
   if(!connection?.encrypted_access_token)throw new Error("Connection unavailable");
   const {data:org}=await sb.from("organizations").select("slug").eq("id",event.organization_id).single();
   if(!org?.slug)throw new Error("Organization unavailable");
   const {data:conversation}=await sb.from("channel_conversations").select("id,mode").eq("organization_id",event.organization_id).eq("channel","instagram").eq("channel_account_id",p.account_id).eq("external_customer_id",p.sender_id).single();
   if(!conversation)throw new Error("Conversation missing");
   if(conversation.mode==="human"){
    await sb.from("channel_events").update({status:"processed",processed_at:new Date().toISOString()}).eq("id",event.id);
    processed++;continue;
   }
   const {data:session}=await sb.from("channel_sessions").select("session_data").eq("organization_id",event.organization_id).eq("channel","instagram").eq("channel_account_id",p.account_id).eq("external_customer_id",p.sender_id).maybeSingle();
   const state=session?.session_data||{messages:[],cart:[]};
   const normalized=p.text.trim();
   const checkout=state.checkout||{};
   const confirm=/^(confirmar|confirmo|sí|si|ok|dale|confirmar pedido)$/i.test(normalized);
   const phone=/^\\+?[0-9][0-9\\s-]{7,16}$/.test(normalized)?normalized.replace(/[\\s-]/g,""):null;
   let checkoutReply:string|null=null;
   let checkoutState={...checkout};
   if(checkout.step==="name" && normalized.length>=2 && normalized.length<=100){
     checkoutState={...checkoutState,name:normalized,step:"phone"};
     checkoutReply="Gracias. ¿Cuál es tu número de teléfono para registrar el pedido?";
   } else if(checkout.step==="phone" && phone){
     checkoutState={...checkoutState,phone,step:"delivery"};
     checkoutReply="¿Prefieres retiro en local o delivery?";
   } else if(checkout.step==="delivery"){
     if(/retiro|pickup/i.test(normalized)){
       checkoutState={...checkoutState,delivery:{type:"pickup"},step:"confirm"};
       checkoutReply="Tu pedido será para retiro. Responde CONFIRMAR para crearlo.";
     }else if(/delivery|despacho|envío/i.test(normalized)){
       checkoutState={...checkoutState,step:"address"};
       checkoutReply="Indica tu dirección completa de entrega.";
     }
   } else if(checkout.step==="address" && normalized.length>=8){
     checkoutState={...checkoutState,delivery:{type:"delivery",address:normalized},step:"confirm"};
     checkoutReply="Antes de confirmar, el local debe validar cobertura y costo de despacho. Responde RETIRO para continuar como retiro o espera atención humana.";
     checkoutState.step="delivery_review";
   } else if(checkout.step==="confirm" && confirm){
     const key="instagram:"+conversation.id+":"+(checkoutState.checkout_id||"");
     if(!checkoutState.checkout_id||!Array.isArray(state.cart)||!state.cart.length){
       checkoutReply="Tu carrito está vacío. Cuéntame qué deseas pedir.";
     }else{
       const confirmResponse=await fetch(env("SUPABASE_URL")+"/functions/v1/food-agent",{
         method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+env("SUPABASE_SERVICE_ROLE_KEY"),
         "x-instagram-checkout-secret":env("INSTAGRAM_CHECKOUT_SECRET")},
         body:JSON.stringify({organization_slug:org.slug,action:"confirm",channel:"instagram",
           idempotency_key:key,cart:state.cart,customer:{name:checkoutState.name,phone:checkoutState.phone},
           delivery:checkoutState.delivery})
       });
       const result=await confirmResponse.json();
       if(!confirmResponse.ok||!result.order_number)throw new Error(result.error||"Checkout failed");
       checkoutState={step:"completed",order_id:result.order_id,order_number:result.order_number};
       checkoutReply="✅ Pedido #"+result.order_number+" registrado correctamente. El local lo confirmará pronto.";
       state.cart=[];
     }
   } else if(checkout.step==="delivery_review"){
     checkoutReply="Para delivery necesitamos que el local valide la cobertura. Puedes responder RETIRO o pedir atención humana.";
     if(/retiro/i.test(normalized)){
       checkoutState={...checkoutState,delivery:{type:"pickup"},step:"confirm"};
       checkoutReply="Perfecto, retiro en local. Responde CONFIRMAR para crear tu pedido.";
     }
   } else if(confirm && Array.isArray(state.cart) && state.cart.length){
     checkoutState={checkout_id:crypto.randomUUID(),step:"name"};
     checkoutReply="¡Vamos a confirmar! ¿A nombre de quién hacemos el pedido?";
   }
   if(checkoutReply){
     const updated={...state,checkout:checkoutState};
     const {error:saveError}=await sb.from("channel_sessions").upsert({
       organization_id:event.organization_id,channel:"instagram",channel_account_id:p.account_id,
       external_customer_id:p.sender_id,session_data:updated,last_inbound_at:new Date().toISOString(),updated_at:new Date().toISOString()
     },{onConflict:"organization_id,channel,channel_account_id,external_customer_id"});
     if(saveError)throw saveError;
     await sb.from("channel_events").update({status:"processed",processed_at:new Date().toISOString()}).eq("id",event.id);
     const sent=await sendInstagram(await decrypted(connection.encrypted_access_token),p.sender_id,checkoutReply);
     await sb.from("channel_messages").insert({organization_id:event.organization_id,conversation_id:conversation.id,
       provider_message_id:sent.message_id||null,direction:"outbound",sender_type:"agent",body:checkoutReply,delivery_status:"sent"});
     processed++;continue;
   }
   const messages=[...(Array.isArray(state.messages)?state.messages:[]),{role:"user",content:p.text}].slice(-10);
   // The shared agent can recommend items but must not promise checkout completion.
   // Phone collection and explicit order confirmation are handled by a separate checkout flow.
   const response=await fetch(env("SUPABASE_URL")+"/functions/v1/food-agent",{
    method:"POST",headers:{"Authorization":"Bearer "+env("SUPABASE_SERVICE_ROLE_KEY"),"Content-Type":"application/json"},
    body:JSON.stringify({organization_slug:org.slug,action:"chat",messages,cart:state.cart||[]})
   });
   const reply=await response.json();
   if(!response.ok||reply.error||typeof reply.message!=="string")throw new Error("Agent failed");
   // Persist AI state before sending; retries must not re-run the AI for this event.
   const updated={...state,messages:[...messages,{role:"assistant",content:reply.message}].slice(-10),cart:reply.cart||[]};
   const {error:stateError}=await sb.from("channel_sessions").upsert({
    organization_id:event.organization_id,channel:"instagram",channel_account_id:p.account_id,external_customer_id:p.sender_id,
    session_data:updated,last_inbound_at:new Date().toISOString(),updated_at:new Date().toISOString()
   },{onConflict:"organization_id,channel,channel_account_id,external_customer_id"});
   if(stateError)throw stateError;
   // Mark processed before outbound send: avoids duplicate AI replies on worker retries.
   await sb.from("channel_events").update({status:"processed",processed_at:new Date().toISOString()}).eq("id",event.id);
   const outbound=await sendInstagram(await decrypted(connection.encrypted_access_token),p.sender_id,reply.message.slice(0,1000));
   await sb.from("channel_messages").insert({organization_id:event.organization_id,conversation_id:conversation.id,
    provider_message_id:outbound.message_id||null,direction:"outbound",sender_type:"agent",body:reply.message.slice(0,1000),delivery_status:"sent"});
   await sb.from("channel_conversations").update({last_message_preview:reply.message.slice(0,180),last_message_at:new Date().toISOString()}).eq("id",conversation.id);
   processed++;
  }catch(e){
   failed++;
   console.error("Instagram event failed",event.id,e instanceof Error?e.message:"unknown");
   // Failed events require operator intervention to avoid duplicate outbound sends.
   await sb.from("channel_events").update({status:"failed"}).eq("id",event.id);
  }
 }
 return json({processed,failed});
});
