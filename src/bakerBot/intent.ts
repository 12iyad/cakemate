export type CustomerIntent =
  | "greeting"
  | "menu_question"
  | "pricing_question"
  | "image_reference"
  | "order_status"
  | "thanks"
  | "order_detail"
  | "unknown";

export interface IntentResult {
  intent: CustomerIntent;
  confidence: "low" | "medium" | "high";
}

export function detectCustomerIntent(message: string, hasImages: boolean): IntentResult {
  const normalized = normalize(message);

  if (hasImages) {
    return {
      intent: "image_reference",
      confidence: "high",
    };
  }

  if (/^(hi|hey|hiya|hello|heyy|hii|morning|afternoon|evening)\s*(x+)?$/.test(normalized)) {
    return {
      intent: "greeting",
      confidence: "high",
    };
  }

  if (/\b(thanks|thank you|ty|cheers|perfect thanks|okay thanks)\b/.test(normalized)) {
    return {
      intent: "thanks",
      confidence: "high",
    };
  }

  if (/\b(order|booking|cake)\b.*\b(status|track|where|ready|eta|update|collection)\b/.test(normalized)) {
    return {
      intent: "order_status",
      confidence: "medium",
    };
  }

  if (/\b(how much|price|pricing|cost|quote|charges?|how many pounds|£)\b/.test(normalized)) {
    return {
      intent: "pricing_question",
      confidence: "high",
    };
  }

  if (isMenuQuestion(normalized)) {
    return {
      intent: "menu_question",
      confidence: "high",
    };
  }

  if (/\b(cake|cupcake|brownie|cookie|red velvet|vanilla|chocolate|lemon|coffee|carrot|biscoff|inch|layers?|moana|birthday|baby shower|wedding)\b/.test(normalized)) {
    return {
      intent: "order_detail",
      confidence: "medium",
    };
  }

  return {
    intent: "unknown",
    confidence: "low",
  };
}

export function isMenuQuestion(message: string): boolean {
  const normalized = normalize(message);
  const asksOptions = /\?/.test(normalized) || /\b(what|which|list|options|available|do you do|have you got|have u got|can you do|can u do)\b/.test(normalized);
  const mentionsMenuArea = /\b(size|sizes|inch|inches|flavour|flavours|flavor|flavors|sponge|filling|fillings|buttercream|jam|biscoff|curd|layer|layers|topper|toppers|personalised|personalized|acrylic|charm|inspo|inspiration|decor|decoration|design ideas?|pictures?|pics?)\b/.test(normalized);

  return asksOptions && mentionsMenuArea;
}

function normalize(message: string): string {
  return message.trim().toLowerCase();
}
