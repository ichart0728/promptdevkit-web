/*
 * This file is intended to be overwritten by the Supabase CLI.
 * Run `pnpm supabase:types` (see README) after linking your project to
 * regenerate strongly-typed definitions for the public schema.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = Record<string, never>;
