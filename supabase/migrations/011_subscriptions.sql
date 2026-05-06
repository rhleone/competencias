-- Etapa 3: Suscripciones y pagos

-- Tabla de pagos / comprobantes
CREATE TABLE IF NOT EXISTS payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_requested   text NOT NULL CHECK (plan_requested IN ('basic', 'pro')),
  amount           numeric(10,2) NOT NULL,
  currency         text NOT NULL DEFAULT 'BOB' CHECK (currency IN ('BOB', 'USDT')),
  method           text NOT NULL CHECK (method IN ('tigo_money', 'takenos', 'bank_transfer')),
  comprobante_url  text,
  notes            text,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  months_granted   int NOT NULL DEFAULT 1,
  submitted_by     uuid REFERENCES auth.users(id),
  reviewed_by      uuid REFERENCES auth.users(id),
  reviewed_at      timestamptz,
  review_notes     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Vencimiento del plan en tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_read_payments" ON payments
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR is_superadmin()
  );

CREATE POLICY "tenant_admin_insert_payments" ON payments
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

CREATE POLICY "superadmin_update_payments" ON payments
  FOR UPDATE USING (is_superadmin());

-- Bucket de Supabase Storage para comprobantes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "auth_upload_payment_proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'payment-proofs' AND auth.uid() IS NOT NULL);

CREATE POLICY "auth_read_payment_proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payment-proofs'
    AND (owner = auth.uid() OR is_superadmin())
  );
