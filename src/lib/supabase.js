import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://miwoeqlnwisnekfodpwo.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pd29lcWxud2lzbmVrZm9kcHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0OTY3NzAsImV4cCI6MjA3ODA3Mjc3MH0.QapR4fpfUT0bXMFcqyaRFQHKIiogB3xV5jGZD8mijwM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
