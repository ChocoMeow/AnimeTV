


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



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






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


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


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



CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "watch_history_enabled" boolean DEFAULT true NOT NULL,
    "search_history_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watch_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "anime_ref_id" "text" NOT NULL,
    "anime_title" "text" NOT NULL,
    "anime_image" "text" NOT NULL,
    "episode_number" integer NOT NULL,
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
            "max"("watch_history"."updated_at") AS "latest_updated_at"
           FROM "public"."watch_history"
          GROUP BY "watch_history"."anime_ref_id"
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
     JOIN "latestupdates" "lu" ON ((("w"."anime_ref_id" = "lu"."anime_ref_id") AND ("w"."updated_at" = "lu"."latest_updated_at"))))
  ORDER BY "w"."updated_at" DESC;


ALTER VIEW "public"."watch_history_latest_updates" OWNER TO "postgres";


ALTER TABLE ONLY "public"."favorites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."favorites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."search_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."search_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_anime_ref_id_key" UNIQUE ("user_id", "anime_ref_id");



ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watch_history"
    ADD CONSTRAINT "unique_watch_history" UNIQUE ("user_id", "anime_ref_id", "episode_number");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watch_history"
    ADD CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_watch_history_user_anime" ON "public"."watch_history" USING "btree" ("user_id", "anime_ref_id", "episode_number");



CREATE INDEX "search_history_user_id_idx" ON "public"."search_history" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "search_history_limit" BEFORE INSERT ON "public"."search_history" FOR EACH ROW EXECUTE FUNCTION "public"."limit_search_history"();



CREATE OR REPLACE TRIGGER "update_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_watch_history_updated_at" BEFORE UPDATE ON "public"."watch_history" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."search_history"
    ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watch_history"
    ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Enable all for users based on id" ON "public"."user_settings" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Enable delete for users based on user_id" ON "public"."watch_history" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Enable insert for users based on user_id" ON "public"."watch_history" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Enable read access for users" ON "public"."watch_history" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Enable update for users based on user_id" ON "public"."watch_history" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "delete_favorites" ON "public"."favorites" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "delete_search_history" ON "public"."search_history" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_favorites" ON "public"."favorites" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "insert_search_history" ON "public"."search_history" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."search_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_favorites" ON "public"."favorites" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "select_search_history" ON "public"."search_history" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "update_favorites" ON "public"."favorites" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "update_search_history" ON "public"."search_history" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."watch_history" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_settings";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."create_user_settings_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_settings_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."limit_search_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."limit_search_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."limit_search_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."search_history" TO "anon";
GRANT ALL ON TABLE "public"."search_history" TO "authenticated";
GRANT ALL ON TABLE "public"."search_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."search_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."search_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."search_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



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































RESET ALL;
