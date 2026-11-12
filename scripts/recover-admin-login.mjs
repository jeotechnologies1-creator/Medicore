import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const readLine = createInterface({ input: stdin, output: stdout });

const ask = async (label) => (await readLine.question(label)).trim();

const askHidden = (label) => new Promise((resolve, reject) => {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    reject(new Error('Run this script directly in a terminal so secret input can be hidden.'));
    return;
  }

  stdout.write(label);
  let value = '';
  const onData = (chunk) => {
    const character = chunk.toString();
    if (character === '\u0003') {
      cleanup();
      reject(new Error('Cancelled.'));
      return;
    }
    if (character === '\r' || character === '\n') {
      cleanup();
      stdout.write('\n');
      resolve(value);
      return;
    }
    if (character === '\u007f' || character === '\b') {
      value = value.slice(0, -1);
      return;
    }
    if (character >= ' ') value += character;
  };
  const cleanup = () => {
    stdin.off('data', onData);
    stdin.setRawMode(false);
    stdin.pause();
  };

  stdin.setRawMode(true);
  stdin.resume();
  stdin.on('data', onData);
});

try {
  const projectUrl = (await ask('Supabase project URL (e.g. https://your-ref.supabase.co): ')).replace(/\/$/, '');
  const userId = await ask('Admin Auth UID: ');
  const email = (await ask('New valid email address: ')).toLowerCase();
  const ownsMailbox = await ask('Can you open this mailbox and receive email there? Type YES to continue: ');
  if (ownsMailbox !== 'YES') throw new Error('Cancelled; mailbox ownership must be confirmed first.');
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(projectUrl)) throw new Error('Enter the project HTTPS URL from Supabase Project Settings.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('The UID must be a UUID copied from Authentication → Users.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');

  const serviceKey = await askHidden('Paste the Supabase service-role/secret key (input hidden): ');
  if (!serviceKey) throw new Error('The service-role key is required.');
  const password = await askHidden('Choose a new password (12+ characters, input hidden): ');
  const passwordAgain = await askHidden('Enter the new password again (input hidden): ');
  if (password.length < 12 || password !== passwordAgain) throw new Error('Passwords must match and contain at least 12 characters.');

  const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileReadError } = await admin
    .from('profiles')
    .select('id, role, status')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (profileReadError) throw new Error('Could not verify the linked profile. No changes were made.');
  if (!profile || profile.role !== 'super_admin' || profile.status !== 'active') {
    throw new Error('The UID is not linked to an active Super Admin profile. No changes were made.');
  }

  const { data: authUser, error: authReadError } = await admin.auth.admin.getUserById(userId);
  if (authReadError || !authUser?.user) throw new Error('Could not find that Auth user. No changes were made.');

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    password
  });
  if (authUpdateError) throw new Error('Supabase Auth could not update the account. No profile changes were made. Check the email and key, then ask a project owner for help if it persists.');

  const { error: profileUpdateError } = await admin.from('profiles').update({ email }).eq('auth_user_id', userId);
  if (profileUpdateError) {
    throw new Error('Auth email/password were updated, but the linked profile email did not update. Ask a project owner to sync public.profiles.email for this same auth_user_id.');
  }

  stdout.write('\nRecovery complete. The new email is confirmed and the new password is set. Sign in with those credentials.\n');
} catch (error) {
  stdout.write(`\n${error.message || 'Recovery failed.'}\n`);
  process.exitCode = 1;
} finally {
  readLine.close();
}
