import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://xrxhqfsscqokkavleemy.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyeGhxZnNzY3Fva2thdmxlZW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTkwMDgsImV4cCI6MjA5MTA3NTAwOH0.D-xtY_rf53dsdiBEvib6-Q5lU5o6PNyPGBtnvfdvaUg";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);