CREATE TABLE IF NOT EXISTS "verification_short_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "verification_sessions"("id") ON DELETE CASCADE,
  "token_id" varchar(64) NOT NULL,
  "code_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_short_links_session_token_idx"
  ON "verification_short_links" ("session_id", "token_id");
