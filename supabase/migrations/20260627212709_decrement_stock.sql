-- Create an RPC function to safely decrement product stock
CREATE OR REPLACE FUNCTION public.decrement_stock(p_id UUID, q_subtract INT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = GREATEST(stock_quantity - q_subtract, 0)
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
