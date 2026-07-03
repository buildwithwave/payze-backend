export interface Store {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  name: string;
  category: string;
  barcode?: string;
  image_url?: string;
  price: number;
  cost_price?: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  store_id: string;
  number: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  status: 'pending' | 'paid' | 'failed';
  payment_method: 'cash' | 'transfer' | 'card' | null;
  amount_tendered: number | null;
  change: number | null;
  customer_name: string | null;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  price: number;
}

export interface Transaction {
  id: string;
  store_id: string;
  type: 'credit' | 'debit';
  channel: 'transfer' | 'card' | 'withdrawal';
  amount: number;
  reference: string;
  counterparty: string | null;
  status: 'pending' | 'successful' | 'failed';
  created_at: string;
}

export interface WalletAccount {
  id: string;
  store_id: string;
  account_number: string | null;
  bank_name: string | null;
  account_name: string | null;
  provider: string;
  provider_ref: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  provider: string;
  provider_reference: string | null;
  amount: number;
  status: 'pending' | 'successful' | 'failed';
  created_at: string;
}

export interface Receipt {
  id: string;
  invoice_id: string;
  payment_id: string;
  receipt_number: string;
  created_at: string;
}

// Request and Response payload types

export interface CreateCheckoutSessionRequest {
  storeId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface NombaWebhookPayload {
  event_type: string;
  requestId: string;
  data: {
    transaction: {
      transactionId: string;
      type: string;
      transactionAmount: number;
      fee: number;
      time: string;
      merchantTxRef?: string;
    };
    order?: {
      orderReference: string;
      amount: number;
      currency: string;
      paymentMethod: string;
    };
    customer?: {
      billerId?: string;
      senderName?: string;
    }
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
