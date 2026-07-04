import { NombaService } from "./src/services/nomba.service";

async function run() {
  try {
    const res = await NombaService.createVirtualAccount("test_ref_123", "Test Store");
    console.log("Success:", res);
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
