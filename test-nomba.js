require('dotenv').config();

async function testNomba() {
  const mainAccountId = process.env.NOMBA_ACCOUNT_ID;
  const subAccountId = process.env.NOMBA_SUB_ACCOUNT_ID || process.env.NOMBA_ACCOUNT_ID;
  const clientId = process.env.NOMBA_CLIENT_ID;
  const clientSecret = process.env.NOMBA_CLIENT_SECRET;
  const baseUrl = process.env.NOMBA_BASE_URL || 'https://api.nomba.com';

  console.log('Fetching token...');
  const tokenRes = await fetch(`${baseUrl}/v1/auth/token/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "accountId": mainAccountId,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    console.error('Token error:', await tokenRes.text());
    return;
  }
  const tokenData = await tokenRes.json();
  const token = tokenData.data.access_token;
  console.log('Token received.');

  console.log('Creating order with subAccountId:', subAccountId);
  const orderRes = await fetch(`${baseUrl}/v1/checkout/order`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "accountId": subAccountId,
    },
    body: JSON.stringify({
      order: {
        orderReference: `test_order_${Date.now()}`,
        amount: "3000",
        currency: "NGN",
        customerEmail: "test@example.com",
        callbackUrl: "http://localhost:4000/api/payments/webhook",
      },
    }),
  });

  const orderText = await orderRes.text();
  console.log('Order status:', orderRes.status);
  console.log('Order response:', orderText);
}

testNomba();
