import axios from "axios";
import crypto from "crypto";

async function run() {
  const secret = "NombaHackathon2026";
  const timeStamp = "2025-09-29T10:51:44Z";
  const payload = {
    "event_type": "payment_success",
    "requestId": "45f2dc2d-d559-4773-bba3-2d5ec17b2e20",
    "data": {
      "merchant": {
        "walletId": "6756ff80aafe04a795f18b38",
        "walletBalance": 6052,
        "userId": "b7b10e81-e57d-41d0-8fdc-f4e23a132bbf"
      },
      "terminal": {},
      "transaction": {
        "aliasAccountNumber": "5343270516",
        "fee": 5,
        "sessionId": "IFAP-TRANSFER-46501-e0339485-1a2f-4b43-9bd5-fec9649e5928",
        "type": "vact_transfer",
        "transactionId": "API-VACT_TRA-B7B10-0435b274-807a-4bc7-8abe-9dbb4548fd7a",
        "aliasAccountName": "ZAXBOX/EZENNA NWACHUKWU",
        "responseCode": "",
        "originatingFrom": "api",
        "transactionAmount": 10,
        "narration": "Habiblahi Hamzat Transfer 10.00 To ZAXBOX/EZENNA NWACHUKWU - Nomba",
        "time": "2025-09-29T10:51:44Z",
        "aliasAccountReference": "inv_32d19b6f-6d98-4a9d-974e-bad98e2c8677",
        "aliasAccountType": "VIRTUAL"
      },
      "customer": {
        "bankCode": "090645",
        "senderName": "Habiblahi Hamzat",
        "bankName": "Nombank",
        "accountNumber": "9617811496"
      }
    }
  };

  const hashingPayload = `payment_success:45f2dc2d-d559-4773-bba3-2d5ec17b2e20:b7b10e81-e57d-41d0-8fdc-f4e23a132bbf:6756ff80aafe04a795f18b38:API-VACT_TRA-B7B10-0435b274-807a-4bc7-8abe-9dbb4548fd7a:vact_transfer:2025-09-29T10:51:44Z::${timeStamp}`;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(hashingPayload);
  const sig = hmac.digest("base64");

  try {
    const res = await axios.post("http://localhost:4000/api/payments/webhook", payload, {
      headers: {
        "nomba-signature": sig,
        "nomba-timestamp": timeStamp
      }
    });
    console.log("Success:", res.status, res.data);
  } catch (err: any) {
    console.error("Error:", err.response?.status, err.response?.data);
  }
}
run();
