import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type SignInWithPasswordParams = {
  email: string;
  password: string;
};

export const signInWithPassword = async ({ email, password }: SignInWithPasswordParams) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.session as Session | null;
};
