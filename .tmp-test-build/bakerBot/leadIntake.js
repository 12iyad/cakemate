export const requiredLeadFields = [
    "customerContact",
    "productType",
    "eventDate",
    "servingsOrQuantity",
    "designOrReference",
];
export const recommendedLeadFields = [
    "fulfilmentMethod",
    "allergies",
];
export const leadFieldLabels = {
    customerContact: "customer contact details",
    productType: "product type",
    eventDate: "date needed",
    servingsOrQuantity: "servings or quantity",
    designOrReference: "design notes or reference image",
    fulfilmentMethod: "pickup or delivery preference",
    allergies: "allergy or dietary requirements",
};
export function getMissingLeadFields(lead) {
    const missing = [];
    if (!lead.customer.phone && !lead.customer.instagramHandle && !lead.customer.whatsappId) {
        missing.push("customerContact");
    }
    if (!hasValue(lead.productType)) {
        missing.push("productType");
    }
    if (!hasValue(lead.eventDate)) {
        missing.push("eventDate");
    }
    if (!hasValue(lead.servingsOrQuantity)) {
        missing.push("servingsOrQuantity");
    }
    if (!hasValue(lead.designNotes) && lead.referenceImages.length === 0) {
        missing.push("designOrReference");
    }
    if (lead.fulfilmentMethod === "unknown") {
        missing.push("fulfilmentMethod");
    }
    if (!hasValue(lead.allergies)) {
        missing.push("allergies");
    }
    return missing;
}
export function getBlockingMissingFields(lead) {
    const missing = getMissingLeadFields(lead);
    return missing.filter((field) => requiredLeadFields.includes(field));
}
export function isReadyForBakerReview(lead) {
    return getBlockingMissingFields(lead).length === 0;
}
export function refreshMissingFields(lead) {
    return {
        ...lead,
        missingFields: getMissingLeadFields(lead),
    };
}
export function applyAiExtractionToLead(lead, extraction) {
    const nextLead = {
        ...lead,
        referenceImages: [...lead.referenceImages, ...(extraction.referenceImages ?? [])],
        confidence: extraction.confidence,
        aiSummary: extraction.aiSummary,
    };
    assignIfPresent(nextLead, "productType", extraction.productType);
    assignIfPresent(nextLead, "occasion", extraction.occasion);
    assignIfPresent(nextLead, "eventDate", extraction.eventDate);
    assignIfPresent(nextLead, "servingsOrQuantity", extraction.servingsOrQuantity);
    assignIfPresent(nextLead, "flavour", extraction.flavour);
    assignIfPresent(nextLead, "filling", extraction.filling);
    assignIfPresent(nextLead, "designNotes", extraction.designNotes);
    assignIfPresent(nextLead, "messageOnCake", extraction.messageOnCake);
    assignIfPresent(nextLead, "budget", extraction.budget);
    assignIfPresent(nextLead, "allergies", extraction.allergies);
    assignIfPresent(nextLead, "deliveryAddressOrArea", extraction.deliveryAddressOrArea);
    assignIfPresent(nextLead, "preferredTime", extraction.preferredTime);
    if (extraction.fulfilmentMethod) {
        nextLead.fulfilmentMethod = extraction.fulfilmentMethod;
    }
    return refreshMissingFields(nextLead);
}
export function formatMissingFields(fields) {
    if (fields.length === 0) {
        return "No missing details.";
    }
    return fields.map((field) => `- ${leadFieldLabels[field]}`).join("\n");
}
function hasValue(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function assignIfPresent(lead, key, value) {
    if (value !== undefined) {
        lead[key] = value;
    }
}
