export function findCustomerOrder(orders, query) {
    const exactMatch = findExactMatch(orders, query);
    if (exactMatch) {
        return {
            exactMatch,
            possibleMatches: [],
            customerMessage: formatOrderStatusMessage(exactMatch),
        };
    }
    const possibleMatches = orders
        .map((order) => ({ order, score: scoreOrderMatch(order, query) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ order }) => order);
    return {
        possibleMatches,
        customerMessage: buildLookupFallbackMessage(possibleMatches),
    };
}
export function formatOrderStatusMessage(order) {
    const status = order.status.replaceAll("_", " ");
    const detail = order.statusMessage ? ` ${order.statusMessage}` : "";
    return `I found your order ${order.orderReference}. It is currently ${status}.${detail}`;
}
function findExactMatch(orders, query) {
    if (query.orderReference) {
        const normalizedReference = normalize(query.orderReference);
        const byReference = orders.find((order) => normalize(order.orderReference) === normalizedReference);
        if (byReference) {
            return byReference;
        }
    }
    const strongMatches = orders.filter((order) => scoreOrderMatch(order, query) >= 4);
    return strongMatches.length === 1 ? strongMatches[0] : undefined;
}
function scoreOrderMatch(order, query) {
    let score = 0;
    const customer = query.customer;
    if (query.eventDate && order.eventDate === query.eventDate) {
        score += 1;
    }
    if (customer?.phone && order.customer.phone === customer.phone) {
        score += 3;
    }
    if (customer?.whatsappId && order.customer.whatsappId === customer.whatsappId) {
        score += 3;
    }
    if (customer?.instagramHandle &&
        normalize(order.customer.instagramHandle) === normalize(customer.instagramHandle)) {
        score += 3;
    }
    if (customer?.platformUserId && order.customer.platformUserId === customer.platformUserId) {
        score += 2;
    }
    if (customer?.name && normalize(order.customer.name) === normalize(customer.name)) {
        score += 1;
    }
    return score;
}
function buildLookupFallbackMessage(possibleMatches) {
    if (possibleMatches.length === 0) {
        return "I could not find an order yet. Please send your order reference, or the name and date the order was for.";
    }
    return "I found a possible matching order, but I need the order reference or event date to confirm it is yours.";
}
function normalize(value) {
    return value?.trim().toLowerCase() ?? "";
}
