// Configuration from environment variables
const config = {
  backend_url: process.env.BACKEND_URL || 'http://34.171.125.26:8000',
  supabase_url: process.env.SUPABASE_URL || 'https://nmwqprgbxtnikkmwhwyt.supabase.co',
  supabase_anon_key: process.env.SUPABASE_ANON_KEY,
  allowed_projects: (process.env.ALLOWED_FIREBASE_PROJECTS || '').split(','),
  org_domain: process.env.ELOO_ORG_DOMAIN || 'eloo.ai',
  service_account_email: process.env.SERVICE_ACCOUNT_EMAIL || 'suna-service@eloo.ai',
  service_account_password_secret: process.env.SERVICE_ACCOUNT_PASSWORD_SECRET || 'suna_service'
};

module.exports = config;