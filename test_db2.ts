import { supabaseAdmin } from "./src/lib/supabase";

async function run() {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, status, total_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("Invoices:", data);
}
run();
