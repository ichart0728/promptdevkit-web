import '@testing-library/jest-dom/vitest';

process.env.VITE_SUPABASE_URL ||= 'https://test.supabase.local';
process.env.VITE_SUPABASE_ANON_KEY ||= 'public-anon-key';
