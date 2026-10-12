import { formatMissingFields, getBlockingMissingFields, leadFieldLabels, } from "./leadIntake.js";
const maxQuestionsPerReply = 2;
export function decideNextStep(context) {
    const blockingMissingFields = getBlockingMissingFields(context.lead);
    if (isOrderLookupIntent(context.lastCustomerMessage)) {
        return {
            nextState: "order_lookup",
            action: "lookup_order",
            replyToCustomer: "Of course. I can help find your order. Please send your order reference if you have it, or confirm the name and date the order was for.",
            shouldEmailBaker: false,
        };
    }
    if (context.hasNewImage && context.currentState !== "ready_for_baker_review") {
        return {
            nextState: blockingMissingFields.length === 0 ? "ready_for_baker_review" : "collecting_order_details",
            action: blockingMissingFields.length === 0 ? "send_to_baker" : "ask_follow_up",
            replyToCustomer: buildImageFollowUp(blockingMissingFields),
            shouldEmailBaker: blockingMissingFields.length === 0,
        };
    }
    if (blockingMissingFields.length === 0) {
        return {
            nextState: "ready_for_baker_review",
            action: "send_to_baker",
            replyToCustomer: "Thanks, I have the key details. I will send this to the baker so they can confirm availability and come back with the next step.",
            shouldEmailBaker: true,
        };
    }
    return {
        nextState: "collecting_order_details",
        action: nextActionForMissingFields(blockingMissingFields),
        replyToCustomer: buildMissingDetailsQuestion(blockingMissingFields),
        shouldEmailBaker: false,
    };
}
export function buildMissingDetailsQuestion(missingFields) {
    const fieldsToAsk = missingFields.slice(0, maxQuestionsPerReply);
    const labels = fieldsToAsk.map((field) => leadFieldLabels[field]);
    if (labels.length === 1) {
        return `Thanks, I can help with that. Could you confirm the ${labels[0]}?`;
    }
    return `Thanks, I can help with that. Could you confirm the ${labels.join(" and ")}?`;
}
export function buildBakerHandoffMessage() {
    return "I have passed your enquiry to the baker. They will review availability, pricing, and any special requirements before confirming.";
}
export function summarizeMissingFieldsForBaker(missingFields) {
    return formatMissingFields(missingFields);
}
function buildImageFollowUp(missingFields) {
    if (missingFields.length === 0) {
        return "Thanks for the image. I will send the design reference and order details to the baker for review.";
    }
    return `Thanks for the image. I will include it as the design reference. ${buildMissingDetailsQuestion(missingFields)}`;
}
function nextActionForMissingFields(missingFields) {
    return missingFields.includes("designOrReference") ? "request_image" : "ask_follow_up";
}
function isOrderLookupIntent(message) {
    if (!message) {
        return false;
    }
    return /\b(order|booking|cake)\b.*\b(status|track|find|where|update)\b/i.test(message);
}
