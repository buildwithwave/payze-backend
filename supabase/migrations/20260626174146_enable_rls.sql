-- Enable Row Level Security on all tables to lock down public REST API access.
-- Since the application backend uses the Service Role key (which bypasses RLS),
-- we do not need to create explicit policies. Enabling RLS without policies
-- defaults to a "Deny All" for anon and authenticated roles, securing the database.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
