import { assertEquals } from "jsr:@std/assert@1";
import { extractInstagramMessages, verifyMetaSignature } from "./validation.ts";

Deno.test("rejects unsigned webhook", async () => {
  assertEquals(await verifyMetaSignature(new TextEncoder().encode("{}"), null, "secret"), false);
});

Deno.test("validates signed webhook", async () => {
  const body = new TextEncoder().encode('{"object":"instagram"}');
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  const header = "sha256=" + Array.from(digest, b=>b.toString(16).padStart(2,"0")).join("");
  assertEquals(await verifyMetaSignature(body, header, "secret"), true);
  assertEquals(await verifyMetaSignature(new TextEncoder().encode("{}"), header, "secret"), false);
});

Deno.test("extracts inbound text and skips echoes", () => {
  const result = extractInstagramMessages({object:"instagram",entry:[{id:"ig_1",messaging:[
    {sender:{id:"user_1"},message:{mid:"m1",text:"hola"},timestamp:123},
    {sender:{id:"ig_1"},message:{mid:"m2",text:"hola",is_echo:true}},
  ]}]});
  assertEquals(result, [{accountId:"ig_1",senderId:"user_1",messageId:"m1",text:"hola",timestamp:123}]);
});
