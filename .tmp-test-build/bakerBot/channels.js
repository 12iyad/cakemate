export const firstMvpChannel = "instagram";
export function loadWhatsAppChannelConfig(env) {
    return {
        channel: "whatsapp",
        accessToken: readRequiredEnv(env, "WHATSAPP_ACCESS_TOKEN"),
        phoneNumberId: readRequiredEnv(env, "WHATSAPP_PHONE_NUMBER_ID"),
        verifyToken: readRequiredEnv(env, "WHATSAPP_VERIFY_TOKEN"),
        graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0",
    };
}
export function loadInstagramChannelConfig(env) {
    return {
        channel: "instagram",
        pageAccessToken: readRequiredEnv(env, "INSTAGRAM_PAGE_ACCESS_TOKEN"),
        verifyToken: readRequiredEnv(env, "INSTAGRAM_VERIFY_TOKEN"),
        graphApiVersion: env.INSTAGRAM_GRAPH_API_VERSION ?? "v20.0",
    };
}
export function getWebhookVerifyResponse(mode, token, challenge, expectedVerifyToken) {
    if (mode === "subscribe" && token === expectedVerifyToken && challenge) {
        return challenge;
    }
    return null;
}
function readRequiredEnv(env, key) {
    const value = env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}.`);
    }
    return value;
}
