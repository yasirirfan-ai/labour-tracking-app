import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function checkUsers() {
  const { data, error } = await supabase.from('users').select('name, worker_id, id');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

checkUsers();
