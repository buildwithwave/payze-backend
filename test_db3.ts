import { supabaseAdmin } from "./src/lib/supabase";

async function run() {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .limit(5);
  console.log("Payments Error:", error);
  console.log("Payments Data:", data);
}
run();
