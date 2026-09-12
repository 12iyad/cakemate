# BakersPal

AI lead-capture foundations for bakery enquiries from WhatsApp or Instagram.

## What Is Implemented

- Shared lead enquiry schema for customer, order, fulfilment, reference image, and missing-field data.
- Conversation state machine for collecting details, handling image references, sending baker handoff, and detecting order lookup requests.
- AI JSON contract and validator for turning customer messages into structured lead details.
- Standardized baker email renderer for new enquiry summaries.
- Instagram-first channel configuration, with WhatsApp config still available.
- Order lookup helper using order reference, phone, WhatsApp ID, Instagram handle, platform ID, name, and event date.

## Environment

Copy `.env.example` and fill the values needed by the integration you are testing.

For the MVP, Instagram is the first recommended channel because it avoids WhatsApp phone registration during early testing.

## Local Fake Chat Demo

The local demo has two tabs:

- **Train your agent** is a conversational baker onboarding flow. It builds an in-memory, structured bakery profile for `demo-bakery` and shows it live.
- **Test as a customer** uses that profile as runtime context for the customer-facing agent, so the baker can refine the agent before connecting Instagram or WhatsApp.

The profile is intentionally local and in-memory for this prototype; restarting the server resets it.

Create a `.env` file and add your OpenAI key:

```env
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-4o-mini
```

Start the local app:

```powershell
npm.cmd run dev
```

Open the demo in your browser:

```text
http://localhost:3000
```

The browser sends client messages to `/api/demo/chat`. The backend calls OpenAI, updates the structured bakery lead, and returns a baker email preview. Your OpenAI key stays on the server and is not exposed to the frontend.

To send real demo emails, add Resend credentials:

```env
RESEND_API_KEY=your_resend_api_key_here
EMAIL_FROM=onboarding@resend.dev
```

`onboarding@resend.dev` is fine for early Resend testing. Use a verified domain sender before a production demo.

## Local Webhooks

Start the local webhook server:

```powershell
$env:INSTAGRAM_VERIFY_TOKEN="bakerspal_instagram_verify_2026"
npm.cmd run dev
```

By default the server listens on port `3000`. To use a different port:

```powershell
$env:PORT="4000"
npm.cmd run dev
```

Expose the same local port with Cloudflare Tunnel:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Use the public Cloudflare URL in Meta with this path:

```text
https://your-tunnel.trycloudflare.com/webhooks/instagram
```

The Instagram verify token in Meta must match `INSTAGRAM_VERIFY_TOKEN`.

The WhatsApp endpoint still exists if you need it later:

```text
https://your-tunnel.trycloudflare.com/webhooks/whatsapp
```

## Important Product Rule

The AI should collect, summarize, and ask clarifying questions. It should not confirm availability, pricing, delivery, allergy-sensitive details, or final order acceptance without the baker.
