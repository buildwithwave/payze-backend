require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Setting up a test store and product...");
  // Create store
  const { data: store } = await supabaseAdmin.from('stores').insert({ name: "Webhook Test Store", user_id: "00000000-0000-0000-0000-000000000000" }).select().single();
  // We need a real user_id, let's just pick one
  const { data: users } = await supabaseAdmin.from('users').select('id').limit(1);
  if (!users.length) { console.log("No users found to create a store."); return; }
  
  const { data: realStore } = await supabaseAdmin.from('stores').insert({ name: "Webhook Test Store", user_id: users[0].id }).select().single();
  
  // Create product with 10 stock
  const { data: product } = await supabaseAdmin.from('products').insert({
    store_id: realStore.id,
    name: "Webhook Item",
    price: 100,
    stock_quantity: 10
  }).select().single();

  console.log("Created product with stock:", product.stock_quantity);

  // Create invoice and items
  const { data: invoice } = await supabaseAdmin.from('invoices').insert({
    store_id: realStore.id,
    total_amount: 200,
    status: 'pending'
  }).select().single();

  await supabaseAdmin.from('invoice_items').insert({
    invoice_id: invoice.id,
    product_id: product.id,
    quantity: 3,
    price: 100
  });

  const { data: payment } = await supabaseAdmin.from('payments').insert({
    invoice_id: invoice.id,
    provider: 'nomba',
    amount: 200,
    status: 'pending'
  }).select().single();

  // Now hit the webhook
  console.log("Sending mock webhook...");
  const payload = {
    event_type: "payment_success",
    requestId: "req_123",
    data: {
      transaction: { transactionId: "txn_888", type: "online", time: "2026-06-27T00:00:00Z", responseCode: "00" },
      order: { orderReference: `pz_${invoice.id}` },
      merchant: { userId: "u_1", walletId: "w_1" }
    }
  };

  const secret = process.env.NOMBA_WEBHOOK_SECRET || process.env.NOMBA_CLIENT_SECRET;
  const timeStamp = new Date().toISOString();
  
  const hashingPayload = `${payload.event_type}:${payload.requestId}:${payload.data.merchant.userId}:${payload.data.merchant.walletId}:${payload.data.transaction.transactionId}:${payload.data.transaction.type}:${payload.data.transaction.time}:${payload.data.transaction.responseCode}:${timeStamp}`;
  
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(hashingPayload);
  const signature = hmac.digest("base64");

  const res = await fetch("http://127.0.0.1:4000/api/payments/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "nomba-signature": signature,
      "nomba-timestamp": timeStamp
    },
    body: JSON.stringify(payload)
  });

  console.log("Webhook status:", res.status, await res.text());

  // Verify stock
  const { data: prodAfter } = await supabaseAdmin.from('products').select('stock_quantity').eq('id', product.id).single();
  console.log("Product stock after webhook:", prodAfter.stock_quantity);

  if (prodAfter.stock_quantity === 7) {
    console.log("✅ Stock decremented correctly (10 -> 7)");
  } else {
    console.log("❌ Stock decrement failed");
  }

  // Send duplicate webhook to test idempotency
  console.log("Sending duplicate webhook...");
  const res2 = await fetch("http://127.0.0.1:4000/api/payments/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "nomba-signature": signature,
      "nomba-timestamp": timeStamp
    },
    body: JSON.stringify(payload)
  });
  console.log("Duplicate Webhook status:", res2.status, await res2.text());

  // Verify receipts count
  const { data: receipts } = await supabaseAdmin.from('receipts').select('*').eq('payment_id', payment.id);
  if (receipts.length === 1) {
    console.log("✅ Only one receipt generated (idempotency works)");
  } else {
    console.log(`❌ Idempotency failed! Expected 1 receipt, found ${receipts.length}`);
  }
}

run();
