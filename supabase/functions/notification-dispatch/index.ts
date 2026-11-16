import { createClient } from '../_shared/supabase.ts';
import { createNotificationDispatchHandler } from './handler.ts';

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

Deno.serve(createNotificationDispatchHandler({
  client,
  serviceKey,
  connectorJson: Deno.env.get('MEDICORE_NOTIFICATION_CONNECTOR_JSON') ?? '{}',
  appLoginUrl: Deno.env.get('MEDICORE_APP_LOGIN_URL'),
  environmentValue: (name) => Deno.env.get(name),
}));
