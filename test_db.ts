import { supabaseAdmin } from "./src/lib/supabase";

async function run() {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("id, invoice_id, status, provider_reference, amount, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("Payments:", data);
}
run();
