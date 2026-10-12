import assert from "node:assert/strict";
import test from "node:test";
import { buildProfileMenuReply } from "./flow.js";
import { detectCustomerIntent } from "./intent.js";
import type { BakeryProfile } from "./bakeryProfile.js";

const profile: BakeryProfile = {
  bakeryId: "test-bakery",
  setupComplete: true,
  business: { name: "crumbs" },
  products: {
    catalogue: ["cookie", "brownie"],
    items: [
      { name: "cookie", variations: "1", price: "5" },
      { name: "brownie", variations: "6", price: "20" },
    ],
  },
  ordering: { paymentMethods: [] },
  policies: {},
  languageProfile: {
    warmth: "medium",
    formality: "casual",
    replyLength: "short",
    emojiFrequency: "low",
    preferredPhrases: [],
    bannedPhrases: [],
    askOneQuestionAtATime: true,
  },
};

test("quotes the saved price for an existing item", () => {
  assert.equal(buildProfileMenuReply("how much are the brownies?", profile), "our brownie is £20 for 6.");
});

test("rejects an unavailable item and recommends real priced items", () => {
  assert.equal(
    buildProfileMenuReply("do you sell cupcakes?", profile),
    "we don't currently offer cupcakes, so there isn't a price for that. we do cookie (£5 for 1) and brownie (£20 for 6) if you'd like one of those instead.",
  );
});

test("recognises availability questions about products not named in the generic menu", () => {
  assert.equal(detectCustomerIntent("do you sell macarons?", false).intent, "menu_question");
});

test("answers social small talk before returning to the bakery conversation", () => {
  assert.equal(detectCustomerIntent("how are you", false).intent, "small_talk");
});

test("handles an unavailable order request and removes fulfilment details from the item name", () => {
  assert.equal(
    buildProfileMenuReply("can i get a biscoff cake for saturday?", profile),
    "we don't currently offer biscoff cake, so there isn't a price for that. we do cookie (£5 for 1) and brownie (£20 for 6) if you'd like one of those instead.",
  );
});

test("lists configured products and their saved prices", () => {
  assert.equal(
    buildProfileMenuReply("what do you sell?", profile),
    "we currently do cookie (£5 for 1) and brownie (£20 for 6).",
  );
});
