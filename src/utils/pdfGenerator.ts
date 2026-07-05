import PDFDocument from "pdfkit";

// Mimicking the structure returned by serializeInvoice
interface SerializedInvoice {
  id: string;
  number: string | null;
  items: Array<{
    productId: string | null;
    name: string;
    price: number;
    quantity: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string | null;
  amountTendered?: number;
  change?: number;
  customerName?: string;
  createdAt: string;
}

export function generateInvoicePdfBuffer(invoice: SerializedInvoice, storeName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Utility for formatting money
      const formatMoney = (val: number) => val.toLocaleString("en-NG", { minimumFractionDigits: 2 });
      
      // Header
      doc.fontSize(22).font("Helvetica-Bold").text(storeName, { align: "center" });
      
      doc.fontSize(10).font("Helvetica").fillColor("gray")
        .moveDown(0.5)
        .text(`Receipt ${invoice.number}`, { align: "center" })
        .text(new Date(invoice.createdAt).toLocaleString(), { align: "center" });

      if (invoice.customerName) {
        doc.moveDown(0.5).text(`Customer: ${invoice.customerName}`, { align: "center" });
      }

      doc.moveDown(2);

      // Table Header
      const tableTop = doc.y;
      const itemX = 50;
      const qtyX = 280;
      const priceX = 350;
      const totalX = 450;

      doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
      doc.text("ITEM", itemX, tableTop);
      doc.text("QTY", qtyX, tableTop, { width: 50, align: "center" });
      doc.text("PRICE", priceX, tableTop, { width: 80, align: "right" });
      doc.text("TOTAL", totalX, tableTop, { width: 80, align: "right" });

      doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).strokeColor("#e5e7eb").stroke();

      let currentY = doc.y + 15;

      // Table Body
      doc.font("Helvetica").fillColor("#374151");
      
      for (const item of invoice.items) {
        doc.text(item.name, itemX, currentY, { width: 200 });
        const nameHeight = doc.heightOfString(item.name, { width: 200 });
        
        doc.text(item.quantity.toString(), qtyX, currentY, { width: 50, align: "center" });
        doc.text(`N${formatMoney(item.price)}`, priceX, currentY, { width: 80, align: "right" });
        doc.text(`N${formatMoney(item.price * item.quantity)}`, totalX, currentY, { width: 80, align: "right" });

        currentY += nameHeight + 10;
        doc.moveTo(50, currentY - 5).lineTo(550, currentY - 5).strokeColor("#f3f4f6").stroke();
      }

      currentY += 15;

      // Totals
      doc.font("Helvetica").fontSize(10).fillColor("black");
      doc.text("Subtotal:", 350, currentY);
      doc.text(`N${formatMoney(invoice.subtotal)}`, totalX, currentY, { width: 80, align: "right" });
      currentY += 15;

      if (invoice.discount > 0) {
        doc.text("Discount:", 350, currentY);
        doc.text(`-N${formatMoney(invoice.discount)}`, totalX, currentY, { width: 80, align: "right" });
        currentY += 15;
      }

      doc.moveTo(350, currentY).lineTo(550, currentY).strokeColor("black").stroke();
      currentY += 10;

      doc.font("Helvetica-Bold").fontSize(12);
      doc.text("Total:", 350, currentY);
      doc.text(`N${formatMoney(invoice.total)}`, totalX, currentY, { width: 80, align: "right" });
      currentY += 20;

      // Payment Info
      doc.font("Helvetica").fontSize(10).fillColor("gray");
      const paymentLabels: Record<string, string> = {
        cash: "Cash",
        transfer: "Bank Transfer",
        card: "Card",
      };
      
      const methodStr = invoice.paymentMethod ? (paymentLabels[invoice.paymentMethod] || invoice.paymentMethod) : "Unknown";
      doc.text(`Paid via ${methodStr}`, 350, currentY);
      if (invoice.amountTendered !== undefined && invoice.amountTendered > 0) {
        doc.text(`N${formatMoney(invoice.amountTendered)}`, totalX, currentY, { width: 80, align: "right" });
        currentY += 15;
      }

      if (invoice.change !== undefined && invoice.change > 0) {
        doc.text("Change:", 350, currentY);
        doc.text(`N${formatMoney(invoice.change)}`, totalX, currentY, { width: 80, align: "right" });
      }

      // Footer
      doc.fontSize(9).fillColor("#9ca3af");
      doc.text("Thank you for shopping with us", 50, doc.page.height - 70, { align: "center", width: 500 });
      doc.text("Powered by Payze", 50, doc.page.height - 50, { align: "center", width: 500 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
