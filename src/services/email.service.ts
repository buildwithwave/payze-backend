import { Resend } from "resend";
import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface ReceiptEmailParams {
  to: string;
  storeName: string;
  invoiceNumber: string;
  receiptUrl: string;
  total: string;
  items: Array<{ name: string; quantity: number; price: number }>;
}

export class EmailService {
  static async sendReceipt(params: ReceiptEmailParams): Promise<void> {
    if (!resend) {
      console.warn("Resend API key not configured — skipping email");
      return;
    }

    const itemRows = params.items
      .map(
        (i) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151">${i.name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#6b7280;text-align:center">${i.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;text-align:right">₦${i.price.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
          </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <!-- Header -->
    <div style="padding:28px 24px;text-align:center;border-bottom:1px solid #f0f0f0">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#111827">${params.storeName}</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#6b7280">Receipt ${params.invoiceNumber}</p>
    </div>

    <!-- Items -->
    <div style="padding:20px 24px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;text-align:left;border-bottom:2px solid #f0f0f0">Item</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;text-align:center;border-bottom:2px solid #f0f0f0">Qty</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;text-align:right;border-bottom:2px solid #f0f0f0">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Total -->
      <div style="margin-top:16px;padding-top:16px;border-top:2px solid #111827;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:14px;font-weight:600;color:#111827">Total</span>
        <span style="font-size:20px;font-weight:700;color:#111827">₦${params.total}</span>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding:0 24px 24px;text-align:center">
      <p style="margin:0 0 12px;font-size:14px;color:#6b7280">To view or download your receipt, visit our portal and select <strong>${params.storeName}</strong>.</p>
      <a href="${params.receiptUrl}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Go to Receipt Portal</a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;background:#f9fafb;text-align:center;border-top:1px solid #f0f0f0">
      <p style="margin:0;font-size:12px;color:#9ca3af">Powered by <a href="${env.FRONTEND_URL}" style="color:#2563eb;text-decoration:none;font-weight:500">Payze</a></p>
    </div>
  </div>
</body>
</html>`;

    await resend.emails.send({
      from: "Payze <receipts@payze.com>",
      to: params.to,
      subject: `Receipt from ${params.storeName} — ${params.invoiceNumber}`,
      html,
    });
  }
}
