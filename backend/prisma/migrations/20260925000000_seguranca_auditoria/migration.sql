-- SEC-01: Senha pendente de novo cadastro em conta ainda não confirmada,
-- aplicada apenas quando o código daquele cadastro for validado.
ALTER TABLE "email_tokens" ADD COLUMN IF NOT EXISTS "pending_password_hash" TEXT;

-- SEC-08: Carimbo do último evento do Stripe aplicado na assinatura,
-- para ignorar eventos entregues fora de ordem.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_event_at" TIMESTAMP(3);

-- SEC-09: Identificador do último refresh token emitido, para rotação
-- e detecção de reuso com revogação da família de sessões.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "refresh_token_jti" TEXT;
ALTER TABLE "managers" ADD COLUMN IF NOT EXISTS "refresh_token_jti" TEXT;
