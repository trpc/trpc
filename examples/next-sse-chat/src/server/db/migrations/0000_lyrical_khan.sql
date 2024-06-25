CREATE TABLE IF NOT EXISTS "sse-chat_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sse-chat_post" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text,
	"name" text,
	"text" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sse-chat_post" ADD CONSTRAINT "sse-chat_post_channel_id_sse-chat_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."sse-chat_channel"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
