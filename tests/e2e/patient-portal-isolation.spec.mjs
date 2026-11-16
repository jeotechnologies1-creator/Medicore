import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const facilityId = 'a1000000-0000-4000-8000-000000000001';
const storageBucket = 'patient-documents';

test('patient A cannot fetch patient B storage paths or receive B chat events', async () => {
  test.setTimeout(30_000);
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase E2E connection settings are required.');
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Patient isolation E2E fixtures require a local Supabase project.');

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const patientA = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const patientB = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const suffix = randomUUID();
  const patientAId = randomUUID();
  const patientBId = randomUUID();
  const emailA = `portal-a-${suffix}@example.test`;
  const emailB = `portal-b-${suffix}@example.test`;
  const password = `Synthetic-${randomUUID()}-Only!`;
  const objectPathB = `${patientBId}/e2e-synthetic.txt`;
  let userAId;
  let userBId;
  let profileAId;
  let profileBId;
  let channel;
  let bChannel;

  try {
    const { error: patientError } = await admin.from('patients').insert([
      { id: patientAId, first_name: 'Synthetic', last_name: 'Portal A', home_facility_id: facilityId },
      { id: patientBId, first_name: 'Synthetic', last_name: 'Portal B', home_facility_id: facilityId }
    ]);
    if (patientError) throw new Error('Could not create synthetic portal patient fixtures.');

    const { data: createdA, error: createAError } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (createAError || !createdA.user) throw new Error('Could not create synthetic patient A identity.');
    userAId = createdA.user.id;
    const { data: createdB, error: createBError } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    if (createBError || !createdB.user) throw new Error('Could not create synthetic patient B identity.');
    userBId = createdB.user.id;

    const { data: profileA } = await admin.from('profiles').select('id').eq('auth_user_id', userAId).maybeSingle();
    const { data: profileB } = await admin.from('profiles').select('id').eq('auth_user_id', userBId).maybeSingle();
    if (!profileA?.id || !profileB?.id) throw new Error('Synthetic patient profiles were not created.');
    profileAId = profileA.id;
    profileBId = profileB.id;
    const { error: activateError } = await admin.from('profiles').update({ role: 'patient', status: 'active', patient_id: patientAId }).eq('auth_user_id', userAId);
    if (activateError) throw new Error('Could not activate synthetic patient A profile.');
    const { error: activateBError } = await admin.from('profiles').update({ role: 'patient', status: 'active', patient_id: patientBId }).eq('auth_user_id', userBId);
    if (activateBError) throw new Error('Could not activate synthetic patient B profile.');
    const { error: signInBError } = await patientB.auth.signInWithPassword({ email: emailB, password });
    if (signInBError) throw new Error('Could not sign in synthetic patient B.');

    const { error: documentError } = await admin.from('patient_documents').insert({
      patient_id: patientBId,
      file_name: 'e2e-synthetic.txt',
      document_type: 'synthetic',
      file_url: objectPathB,
      uploaded_by: profileB.id
    });
    if (documentError) throw new Error('Could not create synthetic document metadata.');
    const { error: uploadError } = await admin.storage.from(storageBucket).upload(objectPathB, Buffer.from('synthetic'), {
      contentType: 'text/plain',
      upsert: false
    });
    if (uploadError) throw new Error('Could not upload synthetic storage fixture.');

    const { error: appointmentsError } = await patientB.from('appointments').insert({
      id: randomUUID(), patient_id: patientBId, appointment_date: new Date().toISOString().slice(0, 10), status: 'requested'
    });
    if (appointmentsError) throw new Error('Could not create synthetic appointment fixture.');
    const { error: labError } = await admin.from('lab_orders').insert([
      { id: randomUUID(), patient_id: patientAId, test_type: 'Synthetic portal fixture', status: 'completed', result_status: 'final', results: { fixture: 'synthetic' } },
      { id: randomUUID(), patient_id: patientAId, test_type: 'Synthetic portal fixture', status: 'pending', result_status: 'pending', results: { fixture: 'synthetic' } },
      { id: randomUUID(), patient_id: patientBId, test_type: 'Synthetic portal fixture', status: 'completed', result_status: 'final', results: { fixture: 'synthetic' } }
    ]);
    if (labError) throw new Error('Could not create synthetic lab fixtures.');
    const prescriptionBId = randomUUID();
    const { error: prescriptionError } = await admin.from('prescriptions').insert({
      id: prescriptionBId, patient_id: patientBId, diagnosis: 'Synthetic portal fixture', medications: [], status: 'active'
    });
    if (prescriptionError) throw new Error('Could not create synthetic prescription fixture.');
    const invoiceBId = randomUUID();
    const { error: invoiceError } = await admin.from('billing').insert({
      id: invoiceBId, patient_id: patientBId, invoice_number: `PORTAL-${suffix}`, total: 0, paid: 0, balance: 0, status: 'pending'
    });
    if (invoiceError) throw new Error('Could not create synthetic invoice fixture.');
    const { error: messageError } = await patientB.from('patient_messages').insert({
      patient_id: patientBId, sender_profile_id: profileBId, sender_name: 'Synthetic B', direction: 'outgoing', message: `synthetic-thread-${suffix}`
    });
    if (messageError) throw new Error('Could not create synthetic patient B chat fixture.');
    const { error: consentError } = await admin.from('patient_consents').insert({
      patient_id: patientBId, consent_type: 'privacy', status: 'granted', granted_at: new Date().toISOString(), consent_version: 'synthetic-test-version'
    });
    if (consentError) throw new Error('Could not create synthetic consent fixture.');
    const { error: notificationError } = await admin.from('notifications').insert({
      user_id: profileBId, type: 'synthetic', title: `Synthetic notification ${suffix}`, message: 'Synthetic test notification'
    });
    if (notificationError) throw new Error('Could not create synthetic notification fixture.');

    const { error: signInError } = await patientA.auth.signInWithPassword({ email: emailA, password });
    if (signInError) throw new Error('Could not sign in synthetic patient A.');

    const { data: hiddenDocuments, error: documentReadError } = await patientA
      .from('patient_documents').select('id').eq('patient_id', patientBId);
    expect(documentReadError).toBeNull();
    expect(hiddenDocuments).toEqual([]);

    const directReads = await Promise.all([
      patientA.from('appointments').select('id').eq('patient_id', patientBId),
      patientA.from('lab_orders').select('id').eq('patient_id', patientBId),
      patientA.from('prescriptions').select('id').eq('patient_id', patientBId),
      patientA.from('billing').select('id').eq('patient_id', patientBId),
      patientA.from('payment_submissions').select('id').eq('patient_id', patientBId),
      patientA.from('patient_messages').select('id').eq('patient_id', patientBId),
      patientA.from('patient_consents').select('id').eq('patient_id', patientBId),
      patientA.from('notifications').select('id').eq('user_id', profileBId)
    ]);
    for (const result of directReads) {
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    const { data: visibleResults, error: visibleResultsError } = await patientA
      .from('lab_orders').select('result_status').eq('patient_id', patientAId);
    expect(visibleResultsError).toBeNull();
    expect(visibleResults.map(({ result_status }) => result_status).sort()).toEqual(['final']);

    const crossPatientWrites = await Promise.all([
      patientA.from('appointments').insert({ patient_id: patientBId, appointment_date: new Date().toISOString().slice(0, 10), status: 'requested' }),
      patientA.from('lab_orders').insert({ patient_id: patientBId, test_type: 'Synthetic denied fixture', status: 'pending', result_status: 'pending' }),
      patientA.from('prescriptions').insert({ patient_id: patientBId, diagnosis: 'Synthetic denied fixture', medications: [], status: 'active' }),
      patientA.from('billing').insert({ patient_id: patientBId, invoice_number: `DENIED-${suffix}`, total: 0, paid: 0, balance: 0, status: 'pending' }),
      patientA.from('payment_submissions').insert({ billing_id: randomUUID(), patient_id: patientBId, amount: 1, payment_method: 'synthetic', idempotency_key: `denied-${suffix}`, submitted_by: profileAId }),
      patientA.from('patient_messages').insert({ patient_id: patientBId, sender_profile_id: profileAId, sender_name: 'Synthetic A', direction: 'outgoing', message: 'Synthetic denied cross-patient message' }),
      patientA.from('patient_documents').insert({ patient_id: patientBId, file_name: 'denied.txt', document_type: 'synthetic', file_url: `${patientBId}/denied.txt` }),
      patientA.from('patient_consents').insert({ patient_id: patientBId, consent_type: 'privacy', status: 'granted' }),
      patientA.from('notifications').insert({ user_id: profileBId, type: 'synthetic', title: 'Denied', message: 'Synthetic test' })
    ]);
    for (const result of crossPatientWrites) expect(Boolean(result.error)).toBe(true);

    const crossPatientMutations = await Promise.all([
      patientA.from('appointments').update({ status: 'cancelled' }).eq('patient_id', patientBId).select('id'),
      patientA.from('lab_orders').update({ test_type: 'Synthetic denied mutation' }).eq('patient_id', patientBId).select('id'),
      patientA.from('prescriptions').update({ diagnosis: 'Synthetic denied mutation' }).eq('patient_id', patientBId).select('id'),
      patientA.from('billing').update({ invoice_number: `MUTATED-${suffix}` }).eq('patient_id', patientBId).select('id'),
      patientA.from('payment_submissions').update({ reference: 'Synthetic denied mutation' }).eq('patient_id', patientBId).select('id'),
      patientA.from('patient_messages').update({ message: 'Synthetic denied mutation' }).eq('patient_id', patientBId).select('id'),
      patientA.from('patient_documents').update({ file_name: 'Synthetic denied mutation' }).eq('patient_id', patientBId).select('id'),
      patientA.from('patient_consents').update({ notes: 'Synthetic denied mutation' }).eq('patient_id', patientBId).select('id'),
      patientA.from('notifications').update({ title: 'Synthetic denied mutation' }).eq('user_id', profileBId).select('id')
    ]);
    for (const result of crossPatientMutations) {
      expect(Boolean(result.error) || result.data?.length === 0).toBe(true);
    }
    const crossPatientDeletes = await Promise.all([
      patientA.from('appointments').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('lab_orders').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('prescriptions').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('billing').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('payment_submissions').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('patient_messages').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('patient_documents').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('patient_consents').delete().eq('patient_id', patientBId).select('id'),
      patientA.from('notifications').delete().eq('user_id', profileBId).select('id')
    ]);
    for (const result of crossPatientDeletes) {
      expect(Boolean(result.error) || result.data?.length === 0).toBe(true);
    }
    const afterMutationState = await Promise.all([
      admin.from('appointments').select('status').eq('patient_id', patientBId),
      admin.from('lab_orders').select('test_type').eq('patient_id', patientBId),
      admin.from('prescriptions').select('diagnosis').eq('patient_id', patientBId),
      admin.from('billing').select('invoice_number').eq('patient_id', patientBId),
      admin.from('patient_messages').select('message').eq('patient_id', patientBId),
      admin.from('patient_documents').select('file_name').eq('patient_id', patientBId),
      admin.from('patient_consents').select('notes').eq('patient_id', patientBId),
      admin.from('notifications').select('title').eq('user_id', profileBId)
    ]);
    for (const result of afterMutationState) {
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
    }
    expect(afterMutationState.map(({ data }) => Object.values(data[0])[0])).toEqual([
      'requested', 'Synthetic portal fixture', 'Synthetic portal fixture', `PORTAL-${suffix}`,
      `synthetic-thread-${suffix}`, 'e2e-synthetic.txt', null, `Synthetic notification ${suffix}`
    ]);

    const crossPatientRpcs = await Promise.all([
      patientA.rpc('read_patient_chart', { p_patient_id: patientBId, p_purpose: 'synthetic isolation test' }),
      patientA.rpc('read_patient_consents', { p_patient_id: patientBId }),
      patientA.rpc('authorize_patient_document_read', { p_object_path: objectPathB }),
      patientA.rpc('request_patient_payment_checkout', {
        p_billing_id: invoiceBId, p_connection_id: randomUUID(), p_amount: 1,
        p_idempotency_key: `checkout-${suffix}`, p_currency: 'NGN'
      }),
      patientA.rpc('dispense_prescription', { p_prescription_id: prescriptionBId, p_lots: {} }),
      patientA.rpc('search_patient_directory', { p_query: 'Synthetic', p_offset: 0, p_limit: 10 }),
      patientA.rpc('review_payment_submission', { p_payment_id: randomUUID(), p_decision: 'approved' })
    ]);
    for (const result of crossPatientRpcs) expect(Boolean(result.error)).toBe(true);

    const { data: signed, error: signedUrlError } = await patientA.storage.from(storageBucket).createSignedUrl(objectPathB, 60);
    expect(Boolean(signedUrlError)).toBe(true);
    expect(signed?.signedUrl).toBeUndefined();

    const { data: downloaded, error: downloadError } = await patientA.storage.from(storageBucket).download(objectPathB);
    expect(Boolean(downloadError)).toBe(true);
    expect(downloaded).toBeNull();

    const { data: uploaded, error: crossPatientUploadError } = await patientA.storage
      .from(storageBucket).upload(`${patientBId}/patient-a-denied.txt`, Buffer.from('synthetic'), { contentType: 'text/plain' });
    expect(Boolean(crossPatientUploadError)).toBe(true);
    expect(uploaded?.path).toBeUndefined();

    const { data: ownSubscription, error: ownSubscriptionError } = await patientA
      .from('patient_messages').select('id').eq('patient_id', patientAId);
    expect(ownSubscriptionError).toBeNull();
    expect(Array.isArray(ownSubscription)).toBe(true);

    const received = [];
    channel = patientA.channel(`portal-isolation-${suffix}`).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'patient_messages', filter: `patient_id=eq.${patientAId}`
    }, (payload) => received.push(payload.new?.message));
    const subscribed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realtime subscription did not become ready.')), 5_000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error('Realtime subscription could not be established.'));
        }
      });
    });
    await subscribed;

    const ownMessage = `synthetic-positive-control-${suffix}`;
    const { error: ownMessageError } = await patientA.from('patient_messages').insert({
      patient_id: patientAId, sender_profile_id: profileAId, sender_name: 'Synthetic A', direction: 'outgoing', message: ownMessage
    });
    if (ownMessageError) throw new Error('Could not create synthetic realtime positive control.');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect.soft(received.includes(ownMessage), 'A positive control distinguishes RLS isolation from an unpublished table').toBe(true);

    const bEvents = [];
    bChannel = patientA.channel(`portal-isolation-b-${suffix}`).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'patient_messages', filter: `patient_id=eq.${patientBId}`
    }, (payload) => bEvents.push(payload.new?.message));
    const bSubscribed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Patient B probe subscription did not become ready.')), 5_000);
      bChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error('Patient B probe subscription could not be established.'));
        }
      });
    });
    await bSubscribed;

    const { error: bMessageError } = await patientB.from('patient_messages').insert({
      patient_id: patientBId, sender_profile_id: profileBId, sender_name: 'Synthetic B', direction: 'outgoing', message: `synthetic-b-event-${suffix}`
    });
    if (bMessageError) throw new Error('Could not create synthetic patient B realtime fixture.');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(bEvents).toEqual([]);

    const { data: ownChart, error: ownChartError } = await patientA.rpc('read_patient_chart', {
      p_patient_id: patientAId, p_purpose: 'synthetic isolation test'
    });
    expect(ownChartError).toBeNull();
    expect(ownChart?.patient?.id).toBe(patientAId);
    expect((ownChart?.lab_orders || []).every(({ result_status }) => ['final', 'corrected'].includes(result_status))).toBe(true);
  } finally {
    if (channel) await patientA.removeChannel(channel);
    if (bChannel) await patientA.removeChannel(bChannel);
    await patientA.auth.signOut();
    await patientB.auth.signOut();
    await admin.storage.from(storageBucket).remove([objectPathB, `${patientBId}/patient-a-denied.txt`]);
    if (profileAId || profileBId) await admin.from('notifications').delete().in('user_id', [profileAId, profileBId].filter(Boolean));
    await admin.from('patient_messages').delete().in('patient_id', [patientAId, patientBId]);
    await admin.from('patient_documents').delete().in('patient_id', [patientAId, patientBId]);
    await admin.from('patient_access_logs').delete().in('patient_id', [patientAId, patientBId]);
    await admin.from('patients').delete().in('id', [patientAId, patientBId]);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  }
});
