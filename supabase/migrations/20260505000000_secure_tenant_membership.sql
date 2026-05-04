-- Sprint 9 / CRITICAL-1: dicht de signup tenant-injection aan de DB-zijde.
--
-- Achtergrond
-- -----------
-- De vorige `public.handle_new_user`-trigger las `raw_user_meta_data ->> 'tenant_id'`
-- en maakte ongechecked een `tenant_members` rij aan met role 'planner', plus zette
-- `app_metadata.tenant_id` op de `auth.users`-rij. Een attacker kan via het publieke
-- `/auth/v1/signup` endpoint zelf die `data.tenant_id` meegeven en zo lid worden van
-- elke gewenste tenant. Dat is een complete privilege escalation.
--
-- Fix
-- ---
-- 1. Trigger leest tenant_id niet langer uit user-supplied metadata. Profile en default
--    user-role worden nog wel aangemaakt zoals voorheen.
-- 2. Tenant-membership loopt vanaf nu uitsluitend via een expliciete invitation-flow:
--    `tenant_invitations` tabel, `create_tenant_invitation` (admins/owners maken een
--    token), `accept_tenant_invitation` (de uitgenodigde user wisselt het token in
--    nadat hij is ingelogd).

BEGIN;

-- 1. Trigger ontdoen van de injection-vector ----------------------------------

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'medewerker')
  ON CONFLICT DO NOTHING;

  -- Bewust GEEN tenant_members insert en GEEN raw_app_meta_data mutatie.
  -- Tenant-koppeling gebeurt via accept_tenant_invitation() na een expliciete invite.
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

-- 2. Invitation-tabel ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."tenant_invitations" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "email"       text NOT NULL,
  "role"        text NOT NULL CHECK (role IN ('admin','planner','medewerker','viewer')),
  "invited_by"  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "token"       text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  "expires_at"  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  "accepted_at" timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."tenant_invitations" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "idx_tenant_invitations_tenant"
  ON "public"."tenant_invitations" (tenant_id);
CREATE INDEX IF NOT EXISTS "idx_tenant_invitations_email_lower"
  ON "public"."tenant_invitations" (lower(email));

ALTER TABLE "public"."tenant_invitations" ENABLE ROW LEVEL SECURITY;

-- Alleen admins/owners van de tenant zien hun eigen invitations.
CREATE POLICY "tenant_admins_select_invitations"
  ON "public"."tenant_invitations"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = tenant_invitations.tenant_id
      AND tm.role IN ('admin','owner')
  ));

-- INSERT alleen via de SECURITY DEFINER RPC, maar we staan directe insert door
-- admins eveneens toe als fallback (RLS check identiek).
CREATE POLICY "tenant_admins_insert_invitations"
  ON "public"."tenant_invitations"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = tenant_invitations.tenant_id
      AND tm.role IN ('admin','owner')
  ));

-- DELETE = intrekken van een invite.
CREATE POLICY "tenant_admins_delete_invitations"
  ON "public"."tenant_invitations"
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = tenant_invitations.tenant_id
      AND tm.role IN ('admin','owner')
  ));

-- Geen UPDATE policy: bewust niet, accepted_at wordt enkel via accept_tenant_invitation()
-- (SECURITY DEFINER) geschreven. Daardoor kan een gewone authenticated user de
-- expires_at, role of tenant_id van een invite niet manipuleren.

GRANT SELECT, INSERT, DELETE ON TABLE "public"."tenant_invitations" TO authenticated;
GRANT ALL ON TABLE "public"."tenant_invitations" TO service_role;

-- 3. RPC: invitation aanmaken (alleen admin/owner van die tenant) -------------

CREATE OR REPLACE FUNCTION "public"."create_tenant_invitation"(
  p_tenant_id uuid,
  p_email     text,
  p_role      text
) RETURNS public.tenant_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invitation public.tenant_invitations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_role NOT IN ('admin','planner','medewerker','viewer') THEN
    RAISE EXCEPTION 'invalid role: %', p_role USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND role IN ('admin','owner')
  ) THEN
    RAISE EXCEPTION 'not authorized to invite users to tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.tenant_invitations (tenant_id, email, role, invited_by)
  VALUES (p_tenant_id, lower(trim(p_email)), p_role, auth.uid())
  RETURNING * INTO v_invitation;

  RETURN v_invitation;
END;
$$;

ALTER FUNCTION "public"."create_tenant_invitation"(uuid, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION "public"."create_tenant_invitation"(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."create_tenant_invitation"(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."create_tenant_invitation"(uuid, text, text) TO service_role;

-- 4. RPC: invitation verzilveren (door de uitgenodigde, ingelogde user) -------

CREATE OR REPLACE FUNCTION "public"."accept_tenant_invitation"(
  p_token text
) RETURNS public.tenant_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invitation public.tenant_invitations;
  v_email      text;
  v_member     public.tenant_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'no email on auth user' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_invitation
  FROM public.tenant_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > now()
    AND lower(email) = lower(v_email)
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'invitation not found, expired, already used, or e-mail mismatch'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_invitation.tenant_id, auth.uid(), v_invitation.role)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role
  RETURNING * INTO v_member;

  UPDATE public.tenant_invitations
     SET accepted_at = now()
   WHERE id = v_invitation.id;

  -- Synchroniseer JWT-claim zodat RLS die op app_metadata.tenant_id leunt direct werkt.
  -- Schrijft alleen wanneer de user nog geen tenant_id heeft, om bestaande tenant-relaties
  -- niet te overschrijven bij multi-tenant memberships.
  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('tenant_id', v_invitation.tenant_id)
   WHERE id = auth.uid()
     AND COALESCE(raw_app_meta_data ->> 'tenant_id', '') = '';

  UPDATE public.profiles
     SET tenant_id = v_invitation.tenant_id
   WHERE user_id = auth.uid()
     AND tenant_id IS NULL;

  RETURN v_member;
END;
$$;

ALTER FUNCTION "public"."accept_tenant_invitation"(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION "public"."accept_tenant_invitation"(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."accept_tenant_invitation"(text) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."accept_tenant_invitation"(text) TO service_role;

COMMIT;
