import { env } from "./src/config/env";
import twilio from "twilio";

async function check() {
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  try {
    const msg = await client.messages.create({
      from: env.TWILIO_WHATSAPP_NUMBER,
      to: "whatsapp:+15553853348", // Using the sandbox number itself to test or a dummy
      contentSid: "HX9f0e450b9a23ca305abefe739e538387",
      contentVariables: JSON.stringify({ body: "This is a test from template!" })
    });
    console.log(msg.sid);
  } catch (err) {
    console.error(err);
  }
}
check();
