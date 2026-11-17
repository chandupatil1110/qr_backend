-- 026: mark a payment as "used" once it has created or renewed a QR, so a
-- single Razorpay order can never be redeemed twice. Separate from
-- `status` because the Razorpay webhook may set status='verified' before
-- the client redeems the order.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

-- Backfill: rows already linked to a QR and verified were redeemed before
-- this column existed.
UPDATE payments
   SET consumed_at = COALESCE(verified_at, created_at)
 WHERE consumed_at IS NULL
   AND status = 'verified'
   AND qr_id IS NOT NULL;
