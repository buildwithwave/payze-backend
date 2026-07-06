-- WhatsApp self-service checkout support:
-- 1. Add store_code to stores for human-friendly identification
-- 2. Create whatsapp_sessions table for conversation state tracking
-- 3. Fix transactions.channel constraint to include 'nomba'

-- ============================================================
-- 1. Store codes
-- ============================================================
ALTER TABLE public.stores
  ADD COLUMN store_code TEXT UNIQUE;

-- Backfill existing stores with auto-generated codes
UPDATE public.stores
SET store_code = UPPER(LEFT(REPLACE(name, ' ', ''), 3)) || '-' || LEFT(id::TEXT, 4)
WHERE store_code IS NULL;

ALTER TABLE public.stores
  ALTER COLUMN store_code SET NOT NULL;

CREATE INDEX idx_stores_store_code ON public.stores(store_code);

-- ============================================================
-- 2. WhatsApp sessions
-- ============================================================
CREATE TABLE public.whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  step TEXT NOT NULL DEFAULT 'awaiting_store_code',
  cart JSONB NOT NULL DEFAULT '[]'::JSONB,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_sessions_phone ON public.whatsapp_sessions(phone_number);
CREATE INDEX idx_whatsapp_sessions_invoice ON public.whatsapp_sessions(invoice_id);

-- Keep updated_at fresh
CREATE TRIGGER trg_whatsapp_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. Fix channel constraint to allow 'nomba'
-- ============================================================
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_channel_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_channel_check
  CHECK (channel IN ('transfer', 'card', 'withdrawal', 'nomba'));
