-- Dashboard API support: product catalogue fields, POS invoices, wallet ledger,
-- virtual accounts, and an atomic checkout function. See api.md.

-- ============================================================
-- 1. Products: category, cost price, low-stock threshold, updated_at
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN category TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN cost_price NUMERIC(12, 2),
  ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 5,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Barcode must be unique per store (multiple NULLs allowed)
CREATE UNIQUE INDEX idx_products_store_barcode
  ON public.products(store_id, barcode)
  WHERE barcode IS NOT NULL;

-- Keep updated_at fresh on every update
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. Invoices: POS fields + per-store sequential numbering
-- ============================================================
ALTER TABLE public.stores
  ADD COLUMN invoice_seq INT NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN number TEXT,
  ADD COLUMN subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN payment_method TEXT,
  ADD COLUMN amount_tendered NUMERIC(12, 2),
  ADD COLUMN change NUMERIC(12, 2),
  ADD COLUMN customer_name TEXT;

-- Backfill: subtotal = total for pre-existing invoices, assign numbers by age
UPDATE public.invoices SET subtotal = total_amount;

WITH numbered AS (
  SELECT id, store_id,
         ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at) AS seq
  FROM public.invoices
)
UPDATE public.invoices i
SET number = 'INV-' || LPAD(n.seq::TEXT, 4, '0')
FROM numbered n
WHERE i.id = n.id;

UPDATE public.stores s
SET invoice_seq = COALESCE(
  (SELECT COUNT(*) FROM public.invoices i WHERE i.store_id = s.id), 0);

CREATE UNIQUE INDEX idx_invoices_store_number
  ON public.invoices(store_id, number)
  WHERE number IS NOT NULL;

CREATE INDEX idx_invoices_store_created
  ON public.invoices(store_id, created_at DESC);

-- ============================================================
-- 3. Invoice items: snapshot product name, survive product deletion
-- ============================================================
ALTER TABLE public.invoice_items
  ADD COLUMN name TEXT NOT NULL DEFAULT '';

-- Backfill names from current products
UPDATE public.invoice_items ii
SET name = p.name
FROM public.products p
WHERE ii.product_id = p.id;

-- Replace composite PK with surrogate id so product_id can be nullable,
-- and let product deletion keep historical invoices intact.
ALTER TABLE public.invoice_items DROP CONSTRAINT invoice_items_pkey;
ALTER TABLE public.invoice_items ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.invoice_items DROP CONSTRAINT invoice_items_product_id_fkey;
ALTER TABLE public.invoice_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- ============================================================
-- 4. Wallet: transactions ledger + virtual account details
-- ============================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  channel TEXT NOT NULL CHECK (channel IN ('transfer', 'card', 'withdrawal')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reference TEXT NOT NULL,
  counterparty TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_store_created ON public.transactions(store_id, created_at DESC);
CREATE UNIQUE INDEX idx_transactions_reference ON public.transactions(reference);

CREATE TABLE public.wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  account_number TEXT,
  bank_name TEXT,
  account_name TEXT,
  provider TEXT NOT NULL DEFAULT 'nomba',
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Atomic POS checkout
-- ============================================================
-- Validates stock, decrements it, numbers and creates the invoice with
-- name/price snapshots, and records the wallet transaction for
-- transfer/card sales — all in one transaction.
--
-- Custom error codes read by the API layer:
--   P0400 -> HTTP 400 (bad request)
--   P0409 -> HTTP 409 (conflict, e.g. insufficient stock)
CREATE OR REPLACE FUNCTION public.pos_checkout(
  p_store_id UUID,
  p_items JSONB,               -- [{ "productId": UUID, "quantity": INT }]
  p_discount NUMERIC,
  p_payment_method TEXT,       -- 'cash' | 'nomba'
  p_amount_tendered NUMERIC,   -- required for cash
  p_customer_name TEXT
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_product RECORD;
  v_subtotal NUMERIC(12, 2) := 0;
  v_total NUMERIC(12, 2);
  v_change NUMERIC(12, 2);
  v_seq INT;
  v_number TEXT;
  v_invoice_id UUID;
  v_created_at TIMESTAMPTZ;
  v_items_out JSONB := '[]'::JSONB;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty' USING ERRCODE = 'P0400';
  END IF;

  -- Validate stock with row locks, accumulate subtotal
  FOR v_item IN
    SELECT (elem->>'productId')::UUID AS product_id,
           (elem->>'quantity')::INT AS quantity
    FROM jsonb_array_elements(p_items) elem
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity in cart' USING ERRCODE = 'P0400';
    END IF;

    SELECT id, name, price, stock_quantity INTO v_product
    FROM public.products
    WHERE id = v_item.product_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found in this store' USING ERRCODE = 'P0400';
    END IF;

    IF v_product.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Only % of % available', v_product.stock_quantity, v_product.name
        USING ERRCODE = 'P0409';
    END IF;

    v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'price', v_product.price,
      'quantity', v_item.quantity
    ));
  END LOOP;

  v_total := GREATEST(v_subtotal - COALESCE(p_discount, 0), 0);

  IF p_payment_method = 'cash' THEN
    IF p_amount_tendered IS NULL OR p_amount_tendered < v_total THEN
      RAISE EXCEPTION 'Amount tendered is less than the total' USING ERRCODE = 'P0400';
    END IF;
    v_change := p_amount_tendered - v_total;
  END IF;

  -- Decrement stock
  FOR v_item IN
    SELECT (elem->>'productId')::UUID AS product_id,
           (elem->>'quantity')::INT AS quantity
    FROM jsonb_array_elements(p_items) elem
  LOOP
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  -- Next per-store invoice number
  UPDATE public.stores
  SET invoice_seq = invoice_seq + 1
  WHERE id = p_store_id
  RETURNING invoice_seq INTO v_seq;

  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0400';
  END IF;

  v_number := 'INV-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO public.invoices
    (store_id, number, subtotal, discount, total_amount, status,
     payment_method, amount_tendered, change, customer_name)
  VALUES
    (p_store_id, v_number, v_subtotal, COALESCE(p_discount, 0), v_total, 'paid',
     p_payment_method, p_amount_tendered, v_change, NULLIF(TRIM(p_customer_name), ''))
  RETURNING id, created_at INTO v_invoice_id, v_created_at;

  INSERT INTO public.invoice_items (invoice_id, product_id, name, price, quantity)
  SELECT v_invoice_id,
         (elem->>'productId')::UUID,
         p.name,
         p.price,
         (elem->>'quantity')::INT
  FROM jsonb_array_elements(p_items) elem
  JOIN public.products p ON p.id = (elem->>'productId')::UUID;

  -- Nomba sales land in the wallet ledger
  IF p_payment_method = 'nomba' THEN
    INSERT INTO public.transactions
      (store_id, type, channel, amount, reference, counterparty, status)
    VALUES
      (p_store_id, 'credit', p_payment_method, v_total, v_number || '-' || v_invoice_id,
       NULLIF(TRIM(p_customer_name), ''), 'successful');
  END IF;

  RETURN jsonb_build_object(
    'id', v_invoice_id,
    'number', v_number,
    'items', v_items_out,
    'subtotal', v_subtotal,
    'discount', COALESCE(p_discount, 0),
    'total', v_total,
    'paymentMethod', p_payment_method,
    'amountTendered', p_amount_tendered,
    'change', v_change,
    'customerName', NULLIF(TRIM(p_customer_name), ''),
    'createdAt', v_created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
