const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const printDocument = async ({ type, id, patientId, title, fields = [], author = '' }) => {
    const client = globalThis.OneMedSupabase?.getClient?.();
    const patient = (globalThis.appData?.patients || []).find((row) => row.id === patientId);
    if (!client || !patient) throw new Error('Patient or database connection is unavailable.');
    const { error: auditError } = await client.rpc('record_document_print', { p_document_type: type, p_document_id: id, p_patient_id: patientId });
    if (auditError) throw auditError;
    const { data: facility } = await client.from('facilities').select('name,code,address,state,phone,email').eq('id', patient.home_facility_id).maybeSingle();
    const win = window.open('', '_blank');
    if (!win) throw new Error('Allow pop-ups to print this document.');
    const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
    const rows = fields.map(([label, value]) => `<div class="field"><b>${escapeHtml(label)}</b><div>${escapeHtml(typeof value === 'object' ? JSON.stringify(value, null, 2) : value)}</div></div>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:32px auto;max-width:800px}header{border-bottom:2px solid #176b68;padding-bottom:16px;margin-bottom:24px}h1{margin:0 0 5px;font-size:24px}.muted{color:#64748b}.patient{background:#f1f5f9;padding:12px;margin:20px 0}.field{margin:14px 0;white-space:pre-wrap}.signature{display:flex;justify-content:space-between;margin-top:80px}.line{border-top:1px solid #334155;padding-top:8px;width:42%}@media print{body{margin:14mm auto}button{display:none}}</style></head><body><header><h1>${escapeHtml(facility?.name || 'Medical Facility')}</h1><div>${escapeHtml([facility?.address,facility?.state,facility?.phone,facility?.email].filter(Boolean).join(' · '))}</div><div class="muted">${escapeHtml(facility?.code || '')}</div></header><h2>${escapeHtml(title)}</h2><div class="patient"><b>${escapeHtml(patientName)}</b><br>Patient No: ${escapeHtml(patient.patientNumber || patient.patient_number || '')} · MRN: ${escapeHtml(patient.medicalRecordNumber || patient.medical_record_number || '')}<br>DOB: ${escapeHtml(patient.dateOfBirth || patient.date_of_birth || '')}</div>${rows}<div class="muted">Author: ${escapeHtml(author || 'Unspecified')} · Printed: ${escapeHtml(new Date().toLocaleString())}</div><div class="signature"><div class="line">Author signature</div><div class="line">Facility stamp</div></div><button onclick="window.print()">Print</button><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
};

globalThis.printEMRDocument = printDocument;
export { printDocument };
