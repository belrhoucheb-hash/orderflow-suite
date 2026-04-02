-- Create a function that validates order status transitions
CREATE OR REPLACE FUNCTION validate_order_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions jsonb := '{
    "DRAFT": ["PENDING", "CANCELLED"],
    "PENDING": ["PLANNED", "CANCELLED", "DRAFT"],
    "PLANNED": ["IN_TRANSIT", "CANCELLED", "PENDING"],
    "IN_TRANSIT": ["DELIVERED", "CANCELLED"],
    "DELIVERED": [],
    "CANCELLED": ["DRAFT"]
  }'::jsonb;
  allowed jsonb;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  allowed := valid_transitions->OLD.status;
  IF allowed IS NULL OR NOT allowed ? NEW.status THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_order_status_transition
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION validate_order_status_transition();
