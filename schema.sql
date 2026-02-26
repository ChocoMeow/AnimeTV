

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION "public"."create_user_settings_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.user_settings(id, watch_history_enabled, search_history_enabled)
    VALUES (
        NEW.id,  -- Assuming NEW.id is the UUID of the user
        true,
        true
    );
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."create_user_settings_on_signup"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_friends_watch_progress"("anime_ref_id_param" "text") RETURNS TABLE("user_id" "uuid", "episode_number" integer, "progress_percentage" integer, "playback_time" integer, "video_duration" integer, "updated_at" timestamp with time zone, "user_avatar" "text", "user_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    with friend_list as (
        select
            case
                when f.user_id = auth.uid() then f.friend_id
                else f.user_id
            end as friend_id
        from public.friends f
        where
            f.status = 'accepted'
            and (f.user_id = auth.uid() or f.friend_id = auth.uid())
    )
    select
        w.user_id,
        w.episode_number,
        w.progress_percentage,
        w.playback_time,
        w.video_duration,
        w.updated_at,
        coalesce(a.raw_user_meta_data->>'avatar_url', a.raw_user_meta_data->>'picture') as user_avatar,
        coalesce(a.raw_user_meta_data->>'name', a.raw_user_meta_data->>'full_name', split_part(a.email::text, '@', 1)) as user_name
    from public.watch_history_latest_updates w
    join friend_list fl on w.user_id = fl.friend_id
    join auth.users a on w.user_id = a.id
    where
        w.anime_ref_id = anime_ref_id_param
    order by w.updated_at desc;
$$;

ALTER FUNCTION "public"."get_friends_watch_progress"("anime_ref_id_param" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_friends_with_status"() RETURNS TABLE("friendship_id" "uuid", "friendship_status" "text", "requester_id" "uuid", "friends_since" timestamp without time zone, "friend_user_id" "uuid", "friend_name" "text", "friend_avatar" "text", "friend_status" "text", "current_anime_ref_id" "text", "current_anime" "text", "current_episode" "text", "current_anime_image" "text", "last_seen" timestamp without time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$begin
  PERFORM set_config('search_path', 'public, pg_catalog', true);

  return query
  select
    f.id as friendship_id,
    f.status as friendship_status,
    f.requester_id,
    f.created_at as friends_since,
    case
      when f.user_id = auth.uid() then f.friend_id
      else f.user_id
    end as friend_user_id,
    case
      when f.user_id = auth.uid() then coalesce(u2.raw_user_meta_data->>'name', u2.raw_user_meta_data->>'full_name', split_part(u2.email::text, '@', 1))
      else coalesce(u1.raw_user_meta_data->>'name', u1.raw_user_meta_data->>'full_name', split_part(u1.email::text, '@', 1))
    end as friend_name,
    case
      when f.user_id = auth.uid() then coalesce(u2.raw_user_meta_data->>'avatar_url', u2.raw_user_meta_data->>'picture')
      else coalesce(u1.raw_user_meta_data->>'avatar_url', u1.raw_user_meta_data->>'picture')
    end as friend_avatar,
    case
      when f.user_id = auth.uid() then us2.status
      else us1.status
    end as friend_status,
    case
      when f.user_id = auth.uid() then us2.anime_ref_id
      else us1.anime_ref_id
    end as current_anime_ref_id,
    case
      when f.user_id = auth.uid() then us2.anime_title
      else us1.anime_title
    end as current_anime,
    case
      when f.user_id = auth.uid() then us2.episode_number
      else us1.episode_number
    end as current_episode,
    case
      when f.user_id = auth.uid() then us2.anime_image
      else us1.anime_image
    end as current_anime_image,
    case
      when f.user_id = auth.uid() then us2.last_seen
      else us1.last_seen
    end as last_seen
  from public.friends f
  left join auth.users u1 on f.user_id = u1.id
  left join auth.users u2 on f.friend_id = u2.id
  left join public.user_status us1 on f.user_id = us1.user_id
  left join public.user_status us2 on f.friend_id = us2.user_id
  where
    (f.user_id = auth.uid() or f.friend_id = auth.uid())
    and f.status = 'accepted';
end;$$;

ALTER FUNCTION "public"."get_friends_with_status"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_pending_requests"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "friend_id" "uuid", "requester_id" "uuid", "created_at" timestamp without time zone, "sender_name" "text", "sender_avatar" "text", "receiver_name" "text", "receiver_avatar" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select
    f.id,
    f.user_id,
    f.friend_id,
    f.requester_id,
    f.created_at,
    -- Sender info (always the requester)
    coalesce(u_requester.raw_user_meta_data->>'name', u_requester.raw_user_meta_data->>'full_name', split_part(u_requester.email::text, '@', 1)) as sender_name,
    coalesce(u_requester.raw_user_meta_data->>'avatar_url', u_requester.raw_user_meta_data->>'picture') as sender_avatar,
    -- Receiver info (the other person who is NOT the requester)
    coalesce(u_receiver.raw_user_meta_data->>'name', u_receiver.raw_user_meta_data->>'full_name', split_part(u_receiver.email::text, '@', 1)) as receiver_name,
    coalesce(u_receiver.raw_user_meta_data->>'avatar_url', u_receiver.raw_user_meta_data->>'picture') as receiver_avatar
  from public.friends f
  left join auth.users u_requester on f.requester_id = u_requester.id
  left join auth.users u_receiver on (
    case 
      when f.user_id = f.requester_id then f.friend_id
      else f.user_id
    end
  ) = u_receiver.id
  where 
    (f.user_id = auth.uid() or f.friend_id = auth.uid())
    and f.status = 'pending';
end;
$$;

ALTER FUNCTION "public"."get_pending_requests"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_info"("user_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "avatar" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Check if the user is authorized to view this info
  -- Can view if: it's yourself OR there's a friendship (accepted or pending)
  if user_id != auth.uid() and not exists (
    select 1 from public.friends f
    where f.status in ('accepted', 'pending')
      and ((f.user_id = auth.uid() and f.friend_id = user_id)
        or (f.friend_id = auth.uid() and f.user_id = user_id))
  ) then
    -- Return empty result if not authorized
    return;
  end if;

  return query
  select
    u.id,
    coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email::text, '@', 1)) as name,
    coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') as avatar
  from auth.users u
  where u.id = user_id;
end;
$$;

ALTER FUNCTION "public"."get_user_info"("user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."limit_search_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Delete the oldest records if the count exceeds 30
    DELETE FROM search_history
    WHERE user_id = NEW.user_id
    AND id IN (
        SELECT id FROM search_history
        WHERE user_id = NEW.user_id
        ORDER BY created_at ASC
        LIMIT GREATEST(0, (SELECT COUNT(*) FROM search_history WHERE user_id = NEW.user_id) - 29)
    );

    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."limit_search_history"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."search_users"("search_query" "text") RETURNS TABLE("id" "uuid", "name" "text", "avatar" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select
    u.id,
    coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email::text, '@', 1)) as name,
    coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') as avatar
  from auth.users u
  where 
    u.id != auth.uid()
    and (
      u.raw_user_meta_data->>'name' ilike '%' || search_query || '%'
      or u.raw_user_meta_data->>'full_name' ilike '%' || search_query || '%'
    )
  limit 20;
end;
$$;

ALTER FUNCTION "public"."search_users"("search_query" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."anime_meta" (
    "id" bigint NOT NULL,
    "source_id" "text" NOT NULL,
    "source_details_id" "text",
    "video_id" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "premiere_date" "date",
    "director" "text",
    "distributor" "text",
    "production_company" "text",
    "thumbnail" "text",
    "views" bigint DEFAULT 0,
    "score" numeric(3,1) DEFAULT 0.0,
    "votes" integer DEFAULT 0,
    "season" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "tags" "text"[] DEFAULT ARRAY[]::"text"[],
    "related_anime_source_ids" "text"[] DEFAULT ARRAY[]::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."anime_meta" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "anime_ref_id" "text" NOT NULL,
    "anime_title" "text" NOT NULL,
    "anime_image" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."favorites" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."favorites_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."favorites_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."favorites_id_seq" OWNED BY "public"."favorites"."id";

CREATE TABLE IF NOT EXISTS "public"."friends" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friends_user_order_check" CHECK (("user_id" < "friend_id")),
    CONSTRAINT "status_check" CHECK (("status" = ANY (ARRAY['accepted'::"text", 'pending'::"text", 'blocked'::"text", 'rejected'::"text"])))
);

ALTER TABLE "public"."friends" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."anime_meta_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."anime_meta_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."anime_meta_id_seq" OWNED BY "public"."anime_meta"."id";

CREATE TABLE IF NOT EXISTS "public"."search_history" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "query" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."search_history" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."search_history_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."search_history_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."search_history_id_seq" OWNED BY "public"."search_history"."id";

CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "update_at" timestamp without time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."user_roles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "watch_history_enabled" boolean DEFAULT true NOT NULL,
    "search_history_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "custom_shortcuts" "jsonb"
);

ALTER TABLE "public"."user_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_status" (
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'offline'::"text" NOT NULL,
    "anime_ref_id" "text",
    "anime_title" "text",
    "anime_image" "text",
    "episode_number" "text",
    "last_seen" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "status_check" CHECK (("status" = ANY (ARRAY['watching'::"text", 'online'::"text", 'offline'::"text", 'idle'::"text", 'invisible'::"text"])))
);

ALTER TABLE "public"."user_status" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."watch_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "anime_ref_id" "text" NOT NULL,
    "anime_title" "text" NOT NULL,
    "anime_image" "text" NOT NULL,
    "episode_number" "text" NOT NULL,
    "playback_time" integer DEFAULT 0 NOT NULL,
    "video_duration" integer DEFAULT 0 NOT NULL,
    "progress_percentage" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."watch_history" OWNER TO "postgres";

COMMENT ON TABLE "public"."watch_history" IS 'Stores user watch history for anime episodes with progress tracking';

CREATE OR REPLACE VIEW "public"."watch_history_latest_updates" WITH ("security_invoker"='on') AS
 WITH "latestupdates" AS (
         SELECT "watch_history"."anime_ref_id",
            "watch_history"."user_id",
            "max"("watch_history"."updated_at") AS "latest_updated_at"
           FROM "public"."watch_history"
          GROUP BY "watch_history"."anime_ref_id", "watch_history"."user_id"
        )
 SELECT "w"."id",
    "w"."user_id",
    "w"."anime_ref_id",
    "w"."anime_title",
    "w"."anime_image",
    "w"."episode_number",
    "w"."playback_time",
    "w"."video_duration",
    "w"."progress_percentage",
    "w"."created_at",
    "w"."updated_at"
   FROM ("public"."watch_history" "w"
     JOIN "latestupdates" "lu" ON ((("w"."anime_ref_id" = "lu"."anime_ref_id") AND ("w"."user_id" = "lu"."user_id") AND ("w"."updated_at" = "lu"."latest_updated_at"))))
  ORDER BY "w"."updated_at" DESC;

ALTER VIEW "public"."watch_history_latest_updates" OWNER TO "postgres";

ALTER TABLE ONLY "public"."anime_meta" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."anime_meta_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."favorites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."favorites_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."search_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."search_history_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."anime_meta"
    ADD CONSTRAINT "anime_meta_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."anime_meta"
    ADD CONSTRAINT "anime_meta_source_id_key" UNIQUE ("source_id");

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_anime_ref_id_key" UNIQUE ("user_id", "anime_ref_id");

ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_unique_pair" UNIQUE ("user_id", "friend_id");

ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."watch_history"
    ADD CONSTRAINT "unique_watch_history" UNIQUE ("user_id", "anime_ref_id", "episode_number");

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_status"
    ADD CONSTRAINT "user_status_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."watch_history"
    ADD CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_anime_meta_title_trgm" ON "public"."anime_meta" USING "gin" ("title" "public"."gin_trgm_ops");

CREATE INDEX "idx_friends_lookup" ON "public"."friends" USING "btree" ("user_id", "friend_id", "status");

CREATE INDEX "idx_source_id" ON "public"."anime_meta" USING "btree" ("source_id");

CREATE INDEX "idx_watch_history_user_anime" ON "public"."watch_history" USING "btree" ("user_id", "anime_ref_id", "episode_number");

CREATE INDEX "search_history_user_id_idx" ON "public"."search_history" USING "btree" ("user_id");

CREATE OR REPLACE TRIGGER "search_history_limit" BEFORE INSERT ON "public"."search_history" FOR EACH ROW EXECUTE FUNCTION "public"."limit_search_history"();

CREATE OR REPLACE TRIGGER "update_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_watch_history_updated_at" BEFORE UPDATE ON "public"."watch_history" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_status"
    ADD CONSTRAINT "user_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."watch_history"
    ADD CONSTRAINT "watch_history_anime_ref_id_fkey" FOREIGN KEY ("anime_ref_id") REFERENCES "public"."anime_meta"("source_id");

ALTER TABLE ONLY "public"."watch_history"
    ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE POLICY "Enable all for admin role" ON "public"."anime_meta" TO "authenticated" USING ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'admin'::"text")) WITH CHECK ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'admin'::"text"));

CREATE POLICY "Enable all for users based on id" ON "public"."user_settings" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "Enable delete for involved users" ON "public"."friends" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("friend_id" = ( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "Enable delete for users based on user_id" ON "public"."watch_history" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Enable insert for authenticated users" ON "public"."friends" FOR INSERT TO "authenticated" WITH CHECK (((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("friend_id" = ( SELECT "auth"."uid"() AS "uid"))) AND ("status" = 'pending'::"text") AND ("requester_id" = ( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "Enable insert for users based on user_id" ON "public"."user_status" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Enable insert for users based on user_id" ON "public"."watch_history" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Enable read access for all authenticated users" ON "public"."anime_meta" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Enable read access for involved users" ON "public"."friends" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("friend_id" = ( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "Enable read access for own and friends status" ON "public"."user_status" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."friends" "f"
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("f"."friend_id" = "user_status"."user_id")) OR (("f"."friend_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("f"."user_id" = "user_status"."user_id"))))))));

CREATE POLICY "Enable read access for users and friends" ON "public"."watch_history" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."friends" "f"
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."user_id" = "auth"."uid"()) AND ("f"."friend_id" = "watch_history"."user_id")) OR (("f"."friend_id" = "auth"."uid"()) AND ("f"."user_id" = "watch_history"."user_id"))))))));

CREATE POLICY "Enable read for users based on user_id" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "Enable update for receivers only" ON "public"."friends" FOR UPDATE TO "authenticated" USING (((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("friend_id" = ( SELECT "auth"."uid"() AS "uid"))) AND ("requester_id" <> ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text"))) WITH CHECK ((("status" = 'accepted'::"text") AND ("requester_id" <> ( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "Enable update for users based on user_id" ON "public"."user_status" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Enable update for users based on user_id" ON "public"."watch_history" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

ALTER TABLE "public"."anime_meta" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delete_favorites" ON "public"."favorites" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "delete_search_history" ON "public"."search_history" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."friends" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_favorites" ON "public"."favorites" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "insert_search_history" ON "public"."search_history" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

ALTER TABLE "public"."search_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_favorites" ON "public"."favorites" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."friends" "f"
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."user_id" = "auth"."uid"()) AND ("f"."friend_id" = "favorites"."user_id")) OR (("f"."friend_id" = "auth"."uid"()) AND ("f"."user_id" = "favorites"."user_id"))))))));

CREATE POLICY "select_search_history" ON "public"."search_history" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "update_favorites" ON "public"."favorites" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "update_search_history" ON "public"."search_history" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_status" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."watch_history" ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_settings";

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_status";

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";

GRANT ALL ON FUNCTION "public"."create_user_settings_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_settings_on_signup"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_friends_watch_progress"("anime_ref_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_friends_watch_progress"("anime_ref_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends_watch_progress"("anime_ref_id_param" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_friends_with_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_friends_with_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends_with_status"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_pending_requests"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_requests"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_requests"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_info"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_info"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_info"("user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."limit_search_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."limit_search_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."limit_search_history"() TO "service_role";

GRANT ALL ON FUNCTION "public"."search_users"("search_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_users"("search_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_users"("search_query" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";

GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";

GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";

GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";

GRANT ALL ON TABLE "public"."anime_meta" TO "anon";
GRANT ALL ON TABLE "public"."anime_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."anime_meta" TO "service_role";

GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";

GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."friends" TO "anon";
GRANT ALL ON TABLE "public"."friends" TO "authenticated";
GRANT ALL ON TABLE "public"."friends" TO "service_role";

GRANT ALL ON SEQUENCE "public"."anime_meta_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."anime_meta_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."anime_meta_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."search_history" TO "anon";
GRANT ALL ON TABLE "public"."search_history" TO "authenticated";
GRANT ALL ON TABLE "public"."search_history" TO "service_role";

GRANT ALL ON SEQUENCE "public"."search_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."search_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."search_history_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";

GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";

GRANT ALL ON TABLE "public"."user_status" TO "anon";
GRANT ALL ON TABLE "public"."user_status" TO "authenticated";
GRANT ALL ON TABLE "public"."user_status" TO "service_role";

GRANT ALL ON TABLE "public"."watch_history" TO "anon";
GRANT ALL ON TABLE "public"."watch_history" TO "authenticated";
GRANT ALL ON TABLE "public"."watch_history" TO "service_role";

GRANT ALL ON TABLE "public"."watch_history_latest_updates" TO "anon";
GRANT ALL ON TABLE "public"."watch_history_latest_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."watch_history_latest_updates" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

