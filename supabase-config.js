// ===========================
// Shared Supabase Init (loaded by index.html, panel-x7k9m.html, contact.html)
// هذا المفتاح "publishable" مصمم عشان يكون عام وموجود في كود المتصفح -
// الحماية الفعلية بتتم عن طريق Row Level Security في قاعدة البيانات، مش بإخفاء المفتاح ده.
// ===========================
const SUPABASE_URL = 'https://uzubnypluaxffivthvgf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P10eE2zH7pVkH6JmKM-Xpg_a9JYTruY';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
