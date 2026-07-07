import { supabaseAdmin } from "./src/lib/supabase";

async function run() {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, status, total_amount")
    .eq("id", "32d19b6f-6d98-4a9d-974e-bad98e2c8677")
    .single();
  console.log("Invoice:", data);
}
run();
