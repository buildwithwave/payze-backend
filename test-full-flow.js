const crypto = require('crypto');

async function runFlow() {
  const BASE_URL = 'http://localhost:4000/api';
  console.log(`Starting full user flow testing on ${BASE_URL}...\n`);

  // Generate unique user
  const email = `testuser_${crypto.randomBytes(4).toString('hex')}@testpayze.com`;
  const password = "password123";
  let token = "";

  console.log(`1. Registering user: ${email}`);
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const registerData = await registerRes.json();
  if (!registerRes.ok) throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
  console.log(`   - User registered successfully.`);

  console.log(`2. Logging in user`);
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  token = loginData.token || loginData.session?.access_token || loginData.access_token;
  console.log(`   - Logged in successfully. Token received.`);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log(`3. Creating a store`);
  const storeRes = await fetch(`${BASE_URL}/stores`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: "My Awesome Test Store" }),
  });
  const storeData = await storeRes.json();
  if (!storeRes.ok) throw new Error(`Store creation failed: ${JSON.stringify(storeData)}`);
  const storeId = storeData.id || storeData.data?.id; // Depends on response format
  console.log(`   - Store created. ID: ${storeId}`);

  console.log(`4. Creating a product`);
  const productRes = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      store_id: storeId,
      name: "Test Product",
      price: 1500,
      stock_quantity: 10,
      barcode: "1234567890123"
    }),
  });
  const productData = await productRes.json();
  if (!productRes.ok) throw new Error(`Product creation failed: ${JSON.stringify(productData)}`);
  const productId = productData.id || productData.data?.id;
  console.log(`   - Product created. ID: ${productId}`);

  console.log(`5. Creating a checkout session (Testing Nomba Integration)`);
  const checkoutRes = await fetch(`${BASE_URL}/checkout/session`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      storeId: storeId,
      items: [
        {
          productId: productId,
          quantity: 2
        }
      ]
    }),
  });
  const checkoutData = await checkoutRes.json();
  if (!checkoutRes.ok) throw new Error(`Checkout session failed: ${JSON.stringify(checkoutData)}`);
  console.log(`   - Checkout session created successfully!`);
  console.log(`   - Total amount: ${checkoutData.total || checkoutData.data?.total}`);
  console.log(`   - Nomba Checkout Link: ${checkoutData.checkoutLink || checkoutData.data?.checkoutLink}`);

  console.log(`\n✅ Full user flow completed successfully!`);
}

runFlow().catch(console.error);
