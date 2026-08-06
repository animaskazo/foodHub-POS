import { register } from 'node:module';

register(new URL('./test-checkout-flow.supabase-mock.mjs', import.meta.url), import.meta.url);
