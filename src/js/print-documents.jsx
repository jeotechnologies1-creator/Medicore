import { getAppData } from './store.js';
import React from 'react';
import { createRoot } from 'react-dom/client';

let printRoot = null;

const formatFieldValue = (value) => {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
};

const PrintDocumentView = ({ document, onClose, onReady }) => {
    React.useEffect(() => {
        window.print();
        onReady();
    }, [document, onReady]);

    const { facility, patient, title, fields, author, printedAt, type } = document;
    const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
    const facilityAddress = [facility?.address, facility?.state, facility?.phone, facility?.email].filter(Boolean).join(' · ');

    return (
        <main className="print-document-shell">
            <div className="print-document-toolbar">
                <button type="button" onClick={onClose}>Return to OneMed</button>
            </div>
            <article className={`print-document${type === 'specimen_label' ? ' print-document--specimen-label' : ''}`} data-testid="print-document-view" aria-label="Printable document">
                <header className="print-facility-header">
                    <h1>{facility?.name || 'Medical Facility'}</h1>
                    {facilityAddress && <p>{facilityAddress}</p>}
                    {facility?.code && <p className="print-muted">{facility.code}</p>}
                </header>

                <h2>{title}</h2>
                <section className="print-patient-block" aria-label="Patient details">
                    <strong>{patientName}</strong>
                    <p>Patient No: {patient.patientNumber || patient.patient_number || ''} · MRN: {patient.medicalRecordNumber || patient.medical_record_number || ''}</p>
                    <p>DOB: {patient.dateOfBirth || patient.date_of_birth || ''}</p>
                </section>

                <section className="print-document-fields" aria-label="Document details">
                    {fields.map(([label, value], index) => (
                        <div className="print-document-field" key={`${label}-${index}`}>
                            <strong>{label}</strong>
                            <div>{formatFieldValue(value)}</div>
                        </div>
                    ))}
                </section>

                <p className="print-document-metadata print-muted">Author: {author || 'Unspecified'} · Printed: {printedAt}</p>
                <footer className="print-signatures">
                    <div className="print-signature-line">Author signature</div>
                    <div className="print-signature-line">Facility stamp</div>
                </footer>
            </article>
        </main>
    );
};

const printDocument = async ({ type, id, patientId, title, fields = [], author = '' }) => {
    const client = globalThis.OneMedSupabase?.getClient?.();
    const patient = (getAppData().patients || []).find((row) => row.id === patientId);
    if (!client || !patient) throw new Error('Patient or database connection is unavailable.');

    const { error: auditError } = type === 'specimen_label'
        ? await client.rpc('record_specimen_label_print', { p_lab_order_id: id, p_patient_id: patientId })
        : await client.rpc('record_document_print', { p_document_type: type, p_document_id: id, p_patient_id: patientId });
    if (auditError) throw auditError;

    const { data: facility } = await client.from('facilities')
        .select('name,code,address,state,phone,email')
        .eq('id', patient.home_facility_id)
        .maybeSingle();
    const container = document.getElementById('onemed-print-root');
    if (!container) throw new Error('The printable document view is unavailable.');
    if (!printRoot) printRoot = createRoot(container);

    await new Promise((resolve) => {
        const printedAt = new Date().toLocaleString();
        const printableDocument = { type, facility, patient, title, fields, author, printedAt };
        const close = () => printRoot.render(null);
        const ready = () => resolve();
        printRoot.render(<PrintDocumentView document={printableDocument} onClose={close} onReady={ready} />);
    });
};

globalThis.printEMRDocument = printDocument;
export { printDocument, PrintDocumentView };
