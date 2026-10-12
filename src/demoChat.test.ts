import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("every customer turn uses the generated reply and preserves conversation context", async () => {
  const originalCwd = process.cwd();
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const directory = await mkdtemp(join(tmpdir(), "bakerspal-chat-test-"));
  try {
    process.chdir(directory);
    await mkdir("data");
    await writeFile("data/bakery-profiles.json", JSON.stringify({
      fixture: { products: { items: [{ name: "brownie", price: "20", variations: "6" }] } },
    }));
    process.env.OPENAI_API_KEY = "offline-test";
    const { handleDemoChat } = await import("./demoChat.js");
    const turns = [
      ["hello", "Hello!"],
      ["how are you", "Doing well, thanks for asking. How's your day going?"],
      ["do you sell macarons?", "Macarons aren't on our menu, but we do brownies."],
      ["how much are brownies?", "Six brownies are £20."],
      ["can I order cookies and brownies?", "We offer brownies, but cookies aren't on our menu."],
      ["https://instagram.com/p/example how much are brownies?", "Six brownies are £20. Could you upload the reference picture here?"],
      ["thanks, just browsing", "Enjoy having a look!"],
    ];
    let calls = 0;
    let sessionId: string | undefined;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.latestCustomerMessage, turns[calls]?.[0]);
      assert.equal(context.recentMessages.length, calls * 2);
      assert.match(body.messages[0].content, /brownie/);
      assert.doesNotMatch(body.messages[0].content, /Cake sizes: 4 inch/);
      const reply = turns[calls++]?.[1];
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        aiSummary: "Browsing", confidence: "high", conversationMove: "chat", replyToCustomer: reply,
      }) } }] }));
    };
    for (const [message, expected] of turns) {
      const result = await handleDemoChat({ bakeryId: "fixture", sessionId, message });
      sessionId = result.sessionId;
      assert.equal(result.assistantMessage, expected);
      assert.equal(result.decision.replyToCustomer, expected);
      assert.equal(result.decision.shouldEmailBaker, false);
      assert.equal(result.lead.productType, undefined);
      assert.equal(result.decision.nextState, "new_lead");
    }
    assert.equal(calls, turns.length);
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ aiSummary: "Empty reply", confidence: "low" }) } }],
    }));
    await assert.rejects(handleDemoChat({ bakeryId: "fixture", sessionId, message: "hello again" }), /replyToCustomer/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
});
