import { Invoice, InvoiceItem, Product, Store, Transaction } from "../types";

// The dashboard frontend consumes camelCase shapes (see api.md); the DB is snake_case.

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export const serializeStore = (store: Store) => ({
  id: store.id,
  name: store.name,
  storeCode: store.store_code,
  createdAt: store.created_at,
});

export const serializeProduct = (p: Product) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: num(p.price),
  costPrice: p.cost_price === null || p.cost_price === undefined ? undefined : num(p.cost_price),
  stock: p.stock_quantity,
  lowStockThreshold: p.low_stock_threshold,
  barcode: p.barcode ?? "",
  image: p.image_url ?? undefined,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

export const serializeInvoiceItem = (item: Pick<InvoiceItem, "product_id" | "name" | "price" | "quantity">) => ({
  productId: item.product_id,
  name: item.name,
  price: num(item.price),
  quantity: item.quantity,
});

export const serializeInvoice = (invoice: Invoice, items: InvoiceItem[]) => ({
  id: invoice.id,
  number: invoice.number,
  items: items.map(serializeInvoiceItem),
  subtotal: num(invoice.subtotal),
  discount: num(invoice.discount),
  total: num(invoice.total_amount),
  paymentMethod: invoice.payment_method,
  amountTendered: invoice.amount_tendered === null ? undefined : num(invoice.amount_tendered),
  change: invoice.change === null ? undefined : num(invoice.change),
  customerName: invoice.customer_name ?? undefined,
  createdAt: invoice.created_at,
});

export const serializeTransaction = (t: Transaction) => ({
  id: t.id,
  type: t.type,
  channel: t.channel,
  amount: num(t.amount),
  reference: t.reference,
  counterparty: t.counterparty ?? undefined,
  status: t.status,
  createdAt: t.created_at,
});
