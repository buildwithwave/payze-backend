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
  barcode?: string;
  price: number;
  stock_quantity: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  store_id: string;
  total_amount: number;
  status: 'pending' | 'paid' | 'failed';
  created_at: string;
}

export interface InvoiceItem {
  invoice_id: string;
  product_id: string;
  quantity: number;
  price: number;
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
