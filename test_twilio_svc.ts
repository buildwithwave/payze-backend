import { TwilioService } from "./src/services/twilio.service";

async function run() {
  try {
    const sid = await TwilioService.sendWhatsAppMessage("+15553853348", "Testing the new service implementation with template!");
    console.log("Success:", sid);
  } catch(err) {
    console.error(err);
  }
}
run();
