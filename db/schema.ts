import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const golfSessionSnapshots = sqliteTable("golf_session_snapshots", {
  userEmail: text("user_email").primaryKey(),
  displayName: text("display_name"),
  sessionsJson: text("sessions_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const golfPracticeProfiles = sqliteTable("golf_practice_profiles", {
  userEmail: text("user_email").primaryKey(),
  displayName: text("display_name"),
  profileJson: text("profile_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
