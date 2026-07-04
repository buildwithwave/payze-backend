import { supabaseAdmin } from "../src/lib/supabase";
import { WalletService } from "../src/services/wallet.service";

async function backfill() {
  console.log("Fetching stores...");
  const { data: stores, error } = await supabaseAdmin.from("stores").select("*");
  
  if (error) {
    console.error("Failed to fetch stores:", error);
    process.exit(1);
  }

  console.log(`Found ${stores?.length || 0} stores.`);
  let backfilled = 0;

  for (const store of stores || []) {
    const { data: existing } = await supabaseAdmin
      .from("wallet_accounts")
      .select("id")
      .eq("store_id", store.id)
      .maybeSingle();

    if (!existing) {
      console.log(`[Store ${store.id}] No virtual account found. Creating one...`);
      const account = await WalletService.getWallet(store);
      if (account?.accountNumber) {
        console.log(`[Store ${store.id}] ✅ Created account: ${account.accountNumber} (${account.bankName})`);
        backfilled++;
      } else {
        console.log(`[Store ${store.id}] ❌ Failed to create virtual account.`);
      }
    } else {
      console.log(`[Store ${store.id}] Already has a virtual account.`);
    }
  }

  console.log(`\nBackfill complete. ${backfilled} accounts provisioned.`);
  process.exit(0);
}

backfill();
