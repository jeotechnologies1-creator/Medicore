
        const { useState, useEffect, useCallback, useRef, useMemo } = React;

        // ==========================================
        // DATABASE & SEED DATA
        // ==========================================
        const seedData = new Proxy({
            users: [],
            patients: [],
            appointments: [],
            labOrders: [],
            radiologyOrders: [],
            prescriptions: [],
            pharmacyInventory: [],
            billing: [],
            admissions: [],
            surgeries: [],
            notifications: [],
            auditLogs: [],
            vitals: [],
            consultations: [],
            documents: [],
            immunizations: [],
            allergies: [],
            conditions: [],
            medicationOrders: [],
            carePlans: [],
            clinicalTasks: [],
            clinicalAlerts: [],
            wards: [],
            beds: [],
            insuranceClaims: [],
            offices: [],
            officeStaff: []
        }, {
            get(target, prop) {
                if (!(prop in target)) {
                    target[prop] = [];
                }
                return target[prop];
            },
            set(target, prop, value) {
                target[prop] = value;
                return true;
            }
        });

        const normalizeUsers = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            email: row.email,
            role: row.role || 'super_admin',
            name: row.full_name || row.name || row.email,
            fullName: row.full_name || row.name || row.email,
            department: row.department || '',
            status: row.status || 'active',
            createdAt: row.created_at || row.createdAt
        }));

        const normalizePatients = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientNumber: row.patient_number || row.patientNumber,
            firstName: row.first_name || row.firstName,
            lastName: row.last_name || row.lastName,
            dateOfBirth: row.date_of_birth || row.dateOfBirth,
            gender: row.gender,
            phone: row.phone,
            email: row.email,
            address: row.address,
            bloodGroup: row.blood_group || row.bloodGroup,
            emergencyContact: {
                name: row.emergency_contact_name || row.emergencyContact?.name || '',
                phone: row.emergency_contact_phone || row.emergencyContact?.phone || ''
            },
            insurance: {
                provider: row.insurance_provider || row.insurance?.provider || 'Not Provided',
                policyNumber: row.insurance_policy_number || row.insurance?.policyNumber || 'N/A'
            },
            registrationDate: row.registration_date || row.registrationDate || new Date().toISOString().split('T')[0],
            status: row.status || 'active',
            allergies: row.allergies || 'None',
            chronicConditions: row.chronic_conditions || row.chronicConditions || 'None'
        }));

        const normalizeAppointments = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            doctorId: row.doctor_id || row.doctorId,
            date: row.appointment_date || row.date,
            time: row.appointment_time || row.time,
            type: row.appointment_type || row.type,
            department: row.department || '',
            status: row.status || 'scheduled',
            notes: row.notes || '',
            createdAt: row.created_at || row.createdAt
        }));

        const normalizeLabOrders = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            doctorId: row.doctor_id || row.doctorId,
            testType: row.test_type || row.testType,
            category: row.category || '',
            priority: row.priority || 'routine',
            status: row.status || 'pending',
            orderedDate: row.ordered_date || row.orderedDate,
            resultDate: row.result_date || row.resultDate || null,
            results: row.results || null,
            technicianId: row.technician_id || row.technicianId
        }));

        const normalizeRadiologyOrders = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            doctorId: row.doctor_id || row.doctorId,
            studyType: row.study_type || row.studyType,
            modality: row.modality,
            status: row.status || 'requested',
            priority: row.priority || 'routine',
            orderedDate: row.ordered_date || row.orderedDate,
            scheduledDate: row.scheduled_date || row.scheduledDate,
            report: row.report || '',
            radiologistId: row.radiologist_id || row.radiologistId
        }));

        const normalizePrescriptions = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            doctorId: row.doctor_id || row.doctorId,
            diagnosis: row.diagnosis,
            medications: Array.isArray(row.medications) ? row.medications : [],
            status: row.status || 'active',
            prescriptionDate: row.prescription_date || row.prescriptionDate,
            notes: row.notes || ''
        }));

        const normalizeInventory = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            name: row.name,
            genericName: row.generic_name || row.genericName,
            category: row.category,
            stockQuantity: row.stock_quantity ?? row.stockQuantity ?? 0,
            reorderLevel: row.reorder_level ?? row.reorderLevel ?? 0,
            unitPrice: row.unit_price ?? row.unitPrice ?? 0,
            expiryDate: row.expiry_date || row.expiryDate,
            batchNumber: row.batch_number || row.batchNumber,
            supplier: row.supplier,
            location: row.location,
            status: row.status || 'active'
        }));

        const normalizeBilling = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            invoiceNumber: row.invoice_number || row.invoiceNumber,
            date: row.invoice_date || row.date,
            subtotal: row.subtotal ?? 0,
            discount: row.discount ?? 0,
            tax: row.tax ?? 0,
            total: row.total ?? 0,
            paid: row.paid ?? 0,
            balance: row.balance ?? 0,
            paymentMethod: row.payment_method || row.paymentMethod,
            status: row.status || 'pending'
        }));

        const normalizeAdmissions = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            ward: row.ward,
            bedNumber: row.bed_number || row.bedNumber,
            admissionDate: row.admission_date || row.admissionDate,
            dischargeDate: row.discharge_date || row.dischargeDate,
            doctorId: row.doctor_id || row.doctorId,
            diagnosis: row.diagnosis,
            status: row.status || 'active',
            acuity: row.acuity || 'stable'
        }));

        const normalizeSurgeries = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            surgeonId: row.surgeon_id || row.surgeonId,
            procedure: row.procedure,
            scheduledDate: row.scheduled_date || row.scheduledDate,
            scheduledTime: row.scheduled_time || row.scheduledTime,
            duration: row.duration,
            status: row.status || 'scheduled',
            otRoom: row.ot_room || row.otRoom,
            anesthesia: row.anesthesia,
            priority: row.priority || 'elective'
        }));

        const normalizeNotifications = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            userId: row.user_id || row.userId,
            type: row.type,
            title: row.title,
            message: row.message,
            read: Boolean(row.read),
            priority: row.priority || 'medium'
        }));

        const normalizeAuditLogs = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            userId: row.user_id || row.userId,
            action: row.action,
            entityType: row.entity_type || row.entityType,
            entityId: row.entity_id || row.entityId,
            timestamp: row.timestamp || row.created_at,
            severity: row.severity || 'info'
        }));

        const normalizeVitals = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            recordedBy: row.recorded_by || row.recordedBy,
            timestamp: row.recorded_at || row.timestamp,
            temperature: row.temperature,
            heartRate: row.heart_rate ?? row.heartRate,
            bloodPressureSystolic: row.blood_pressure_systolic ?? row.bloodPressureSystolic,
            bloodPressureDiastolic: row.blood_pressure_diastolic ?? row.bloodPressureDiastolic,
            respiratoryRate: row.respiratory_rate ?? row.respiratoryRate,
            oxygenSaturation: row.oxygen_saturation ?? row.oxygenSaturation,
            painScore: row.pain_score ?? row.painScore ?? 0,
            weight: row.weight,
            height: row.height,
            bmi: row.bmi,
            consciousness: row.consciousness || 'Alert'
        }));

        const normalizeConsultations = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            doctorId: row.doctor_id || row.doctorId,
            chiefComplaint: row.chief_complaint || row.chiefComplaint || '',
            diagnosis: row.diagnosis || '',
            assessment: row.assessment || '',
            plan: row.plan || '',
            followUpDate: row.follow_up_date || row.followUpDate || null,
            status: row.status || 'completed',
            createdAt: row.created_at || row.createdAt || new Date().toISOString()
        }));

        const normalizeDocuments = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            fileName: row.file_name || row.fileName || 'Document',
            documentType: row.document_type || row.documentType || 'Clinical Note',
            fileUrl: row.file_url || row.fileUrl || '',
            uploadedBy: row.uploaded_by || row.uploadedBy || '',
            uploadedAt: row.uploaded_at || row.uploadedAt || new Date().toISOString(),
            size: row.size || '0 KB'
        }));

        const normalizeImmunizations = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            vaccine: row.vaccine || '',
            status: row.status || 'scheduled',
            administeredDate: row.administered_date || row.administeredDate || null,
            nextDueDate: row.next_due_date || row.nextDueDate || null,
            notes: row.notes || ''
        }));

        const normalizeAllergies = (rows = []) => rows.map((row) => ({
            ...row, id: row.id, patientId: row.patient_id || row.patientId, substance: row.substance,
            category: row.category || 'medication', reaction: row.reaction || '', severity: row.severity || 'unknown',
            criticality: row.criticality || 'low', clinicalStatus: row.clinical_status || row.clinicalStatus || 'active'
        }));

        const normalizeConditions = (rows = []) => rows.map((row) => ({
            ...row, id: row.id, patientId: row.patient_id || row.patientId, conditionName: row.condition_name || row.conditionName,
            clinicalStatus: row.clinical_status || row.clinicalStatus || 'active', verificationStatus: row.verification_status || row.verificationStatus || 'provisional',
            onsetDate: row.onset_date || row.onsetDate, notes: row.notes || ''
        }));

        const normalizeMedicationOrders = (rows = []) => rows.map((row) => ({
            ...row, id: row.id, patientId: row.patient_id || row.patientId, medicationName: row.medication_name || row.medicationName,
            dose: row.dose, doseUnit: row.dose_unit || row.doseUnit, route: row.route, frequency: row.frequency,
            status: row.status || 'active', indication: row.indication || ''
        }));

        const normalizeCarePlans = (rows = []) => rows.map((row) => ({
            ...row, id: row.id, patientId: row.patient_id || row.patientId, title: row.title, description: row.description || '',
            status: row.status || 'active', targetDate: row.target_date || row.targetDate, reviewDate: row.review_date || row.reviewDate
        }));

        const normalizeClinicalTasks = (rows = []) => rows.map((row) => ({
            ...row, id: row.id, patientId: row.patient_id || row.patientId, title: row.title, taskType: row.task_type || row.taskType,
            dueAt: row.due_at || row.dueAt, priority: row.priority || 'routine', status: row.status || 'open'
        }));

        const normalizeClinicalAlerts = (rows = []) => rows.map((row) => ({
            ...row, id: row.id, patientId: row.patient_id || row.patientId, alertType: row.alert_type || row.alertType,
            severity: row.severity || 'warning', message: row.message, status: row.status || 'open', createdAt: row.created_at || row.createdAt
        }));

        const normalizeWards = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            name: row.name,
            capacity: row.capacity ?? 0,
            occupied: row.occupied ?? 0,
            specialty: row.specialty || '',
            status: row.status || 'active'
        }));

        const normalizeBeds = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            wardId: row.ward_id || row.wardId,
            bedNumber: row.bed_number || row.bedNumber,
            status: row.status || 'available'
        }));

        const normalizeInsuranceClaims = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            claimNumber: row.claim_number || row.claimNumber,
            provider: row.provider,
            amountClaimed: row.amount_claimed ?? row.amountClaimed ?? 0,
            amountApproved: row.amount_approved ?? row.amountApproved ?? 0,
            status: row.status || 'pending'
        }));

        const normalizeOffices = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            name: row.name || row.office_name,
            officeType: row.office_type || row.officeType || 'Clinic',
            specialty: row.specialty || row.department || 'General Medicine',
            location: row.location || row.address || '',
            phone: row.phone || '',
            email: row.email || '',
            status: row.status || 'active',
            headDoctorId: row.head_doctor_id || row.headDoctorId || null,
            createdBy: row.created_by || row.createdBy || null,
            createdAt: row.created_at || row.createdAt
        }));

        const normalizeOfficeStaff = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            officeId: row.office_id || row.officeId,
            profileId: row.profile_id || row.profileId,
            role: row.role || 'specialist',
            isLead: Boolean(row.is_lead ?? row.isLead),
            createdAt: row.created_at || row.createdAt
        }));

        const buildDefaultSeedData = () => {
            const today = new Date();
            const isoDate = (offsetDays = 0) => {
                const d = new Date(today);
                d.setDate(d.getDate() + offsetDays);
                return d.toISOString().slice(0, 10);
            };

            const users = [
                { id: 'user-admin', email: 'admin', role: 'super_admin', name: 'System Administrator', fullName: 'System Administrator', department: 'Administration', status: 'active', createdAt: new Date().toISOString() },
                { id: 'user-doctor-1', email: 'dr.smith@medicore.local', role: 'doctor', name: 'Dr. Ada Smith', fullName: 'Dr. Ada Smith', department: 'Cardiology', status: 'active', createdAt: new Date().toISOString() },
                { id: 'user-nurse-1', email: 'nurse.joy@medicore.local', role: 'nurse', name: 'Joy Okafor', fullName: 'Joy Okafor', department: 'Ward 2', status: 'active', createdAt: new Date().toISOString() },
                { id: 'user-pharmacist-1', email: 'pharm.rose@medicore.local', role: 'pharmacist', name: 'Rose Ibeh', fullName: 'Rose Ibeh', department: 'Pharmacy', status: 'active', createdAt: new Date().toISOString() },
                { id: 'user-receptionist-1', email: 'reception@medicore.local', role: 'receptionist', name: 'Grace Nwosu', fullName: 'Grace Nwosu', department: 'Front Desk', status: 'active', createdAt: new Date().toISOString() }
            ];

            const patients = [
                { id: 'pat-1001', patientNumber: 'MC-1001', firstName: 'Daniel', lastName: 'Adebayo', dateOfBirth: '1988-03-18', gender: 'Male', phone: '+2348001001001', email: 'daniel.adebayo@example.com', address: 'Lekki Phase 1, Lagos', bloodGroup: 'O+', emergencyContact: { name: 'Ruth Adebayo', phone: '+2348001111001' }, insurance: { provider: 'AXA Health', policyNumber: 'AXA-7732' }, registrationDate: isoDate(-120), status: 'active', allergies: 'Penicillin', chronicConditions: 'Hypertension' },
                { id: 'pat-1002', patientNumber: 'MC-1002', firstName: 'Amaka', lastName: 'Eze', dateOfBirth: '1994-11-07', gender: 'Female', phone: '+2348001001002', email: 'amaka.eze@example.com', address: 'Gwarinpa, Abuja', bloodGroup: 'A+', emergencyContact: { name: 'Chinedu Eze', phone: '+2348001111002' }, insurance: { provider: 'Leadway', policyNumber: 'LW-2301' }, registrationDate: isoDate(-80), status: 'active', allergies: 'None', chronicConditions: 'Asthma' },
                { id: 'pat-1003', patientNumber: 'MC-1003', firstName: 'Nneka', lastName: 'Okafor', dateOfBirth: '1976-01-15', gender: 'Female', phone: '+2348001001003', email: 'nneka.okafor@example.com', address: 'Wuse, Abuja', bloodGroup: 'AB-', emergencyContact: { name: 'Ifeanyi Okafor', phone: '+2348001111003' }, insurance: { provider: 'Premium Health', policyNumber: 'PH-4459' }, registrationDate: isoDate(-200), status: 'active', allergies: 'Latex', chronicConditions: 'Diabetes' },
                { id: 'pat-1004', patientNumber: 'MC-1004', firstName: 'Tunde', lastName: 'Balogun', dateOfBirth: '1969-08-22', gender: 'Male', phone: '+2348001001004', email: 'tunde.balogun@example.com', address: 'Surulere, Lagos', bloodGroup: 'B+', emergencyContact: { name: 'Titi Balogun', phone: '+2348001111004' }, insurance: { provider: 'AIICO', policyNumber: 'AI-4421' }, registrationDate: isoDate(-35), status: 'active', allergies: 'None', chronicConditions: 'Chronic Kidney Disease' }
            ];

            const appointments = [
                { id: 'apt-2001', patientId: 'pat-1001', doctorId: 'user-doctor-1', date: isoDate(0), time: '09:00', type: 'consultation', department: 'Cardiology', status: 'scheduled', notes: 'Follow-up check for blood pressure review.' },
                { id: 'apt-2002', patientId: 'pat-1002', doctorId: 'user-doctor-1', date: isoDate(1), time: '11:30', type: 'consultation', department: 'Pulmonology', status: 'scheduled', notes: 'Asthma review.' },
                { id: 'apt-2003', patientId: 'pat-1003', doctorId: 'user-doctor-1', date: isoDate(-1), time: '14:00', type: 'review', department: 'Endocrinology', status: 'completed', notes: 'Reviewed glucose control.' }
            ];

            const labOrders = [
                { id: 'lab-3001', patientId: 'pat-1001', doctorId: 'user-doctor-1', testType: 'Lipid Panel', category: 'Chemistry', priority: 'routine', status: 'pending', orderedDate: isoDate(-2), resultDate: null, results: null, technicianId: null },
                { id: 'lab-3002', patientId: 'pat-1003', doctorId: 'user-doctor-1', testType: 'HBA1C', category: 'Endocrinology', priority: 'urgent', status: 'processing', orderedDate: isoDate(-1), resultDate: null, results: null, technicianId: null },
                { id: 'lab-3003', patientId: 'pat-1002', doctorId: 'user-doctor-1', testType: 'CBC', category: 'Hematology', priority: 'routine', status: 'completed', orderedDate: isoDate(-3), resultDate: isoDate(-2), results: { hemoglobin: '12.4 g/dL' }, technicianId: null }
            ];

            const radiologyOrders = [
                { id: 'rad-4001', patientId: 'pat-1001', doctorId: 'user-doctor-1', studyType: 'Echocardiogram', modality: 'Cardiac Sonography', status: 'requested', priority: 'urgent', orderedDate: isoDate(-2), scheduledDate: isoDate(2), report: '', radiologistId: null },
                { id: 'rad-4002', patientId: 'pat-1004', doctorId: 'user-doctor-1', studyType: 'Chest X-Ray', modality: 'X-ray', status: 'reported', priority: 'routine', orderedDate: isoDate(-5), scheduledDate: isoDate(-4), report: 'No acute pulmonary findings.', radiologistId: null }
            ];

            const prescriptions = [
                { id: 'rx-5001', patientId: 'pat-1001', doctorId: 'user-doctor-1', diagnosis: 'Hypertension', medications: [{ name: 'Amlodipine', dose: '5mg', frequency: 'OD' }], status: 'active', prescriptionDate: isoDate(-1), notes: 'Continue monitoring blood pressure.' },
                { id: 'rx-5002', patientId: 'pat-1002', doctorId: 'user-doctor-1', diagnosis: 'Asthma', medications: [{ name: 'Albuterol Inhaler', dose: '2 puffs', frequency: 'PRN' }], status: 'active', prescriptionDate: isoDate(-2), notes: 'Use as needed.' }
            ];

            const pharmacyInventory = [
                { id: 'inv-6001', name: 'Amlodipine', genericName: 'Amlodipine', category: 'Cardiology', stockQuantity: 120, reorderLevel: 25, unitPrice: 18.5, expiryDate: '2028-05-31', batchNumber: 'AML-101', supplier: 'Medline', location: 'Shelf A1', status: 'active' },
                { id: 'inv-6002', name: 'Salbutamol Inhaler', genericName: 'Albuterol', category: 'Respiratory', stockQuantity: 34, reorderLevel: 20, unitPrice: 14.25, expiryDate: '2027-12-20', batchNumber: 'SAL-204', supplier: 'HealthPlus', location: 'Shelf C3', status: 'active' },
                { id: 'inv-6003', name: 'Insulin Glargine', genericName: 'Insulin', category: 'Diabetes', stockQuantity: 8, reorderLevel: 15, unitPrice: 32.0, expiryDate: '2026-11-15', batchNumber: 'INS-118', supplier: 'NovaCare', location: 'Cold Room', status: 'low_stock' }
            ];

            const billing = [
                { id: 'bill-7001', patientId: 'pat-1001', invoiceNumber: 'INV-76001', date: isoDate(-1), subtotal: 340, discount: 20, tax: 21, total: 341, paid: 341, balance: 0, paymentMethod: 'Card', status: 'paid' },
                { id: 'bill-7002', patientId: 'pat-1002', invoiceNumber: 'INV-76002', date: isoDate(-3), subtotal: 220, discount: 0, tax: 18, total: 238, paid: 150, balance: 88, paymentMethod: 'Insurance', status: 'partial' },
                { id: 'bill-7003', patientId: 'pat-1003', invoiceNumber: 'INV-76003', date: isoDate(-5), subtotal: 480, discount: 10, tax: 35, total: 505, paid: 505, balance: 0, paymentMethod: 'Transfer', status: 'paid' }
            ];

            const admissions = [
                { id: 'adm-8001', patientId: 'pat-1003', ward: 'General Ward', bedNumber: 'G-12', admissionDate: isoDate(-10), dischargeDate: isoDate(-2), doctorId: 'user-doctor-1', diagnosis: 'Diabetes management', status: 'discharged', acuity: 'moderate' },
                { id: 'adm-8002', patientId: 'pat-1004', ward: 'Cardiac Ward', bedNumber: 'C-02', admissionDate: isoDate(-1), dischargeDate: null, doctorId: 'user-doctor-1', diagnosis: 'Cardiac observation', status: 'active', acuity: 'critical' }
            ];

            const surgeries = [
                { id: 'surg-9001', patientId: 'pat-1004', surgeonId: 'user-doctor-1', procedure: 'Coronary angiography review', scheduledDate: isoDate(4), scheduledTime: '13:00', duration: '60 min', status: 'scheduled', otRoom: 'OR-2', anesthesia: 'Local', priority: 'urgent' }
            ];

            const notifications = [
                { id: 'note-1001', userId: 'user-admin', type: 'system', title: 'Inventory alert', message: 'Insulin glargine stock is below reorder threshold.', read: false, priority: 'high' },
                { id: 'note-1002', userId: 'user-admin', type: 'patient', title: 'Follow-up due', message: 'Patient Daniel Adebayo has a follow-up due today.', read: false, priority: 'medium' }
            ];

            const auditLogs = [
                { id: 'audit-1101', userId: 'user-admin', action: 'Login', entityType: 'auth', entityId: 'user-admin', timestamp: new Date().toISOString(), severity: 'info' },
                { id: 'audit-1102', userId: 'user-doctor-1', action: 'Medication issued', entityType: 'prescription', entityId: 'rx-5001', timestamp: new Date().toISOString(), severity: 'info' }
            ];

            const vitals = [
                { id: 'vital-1201', patientId: 'pat-1001', recordedBy: 'user-nurse-1', timestamp: new Date().toISOString(), temperature: 36.8, heartRate: 74, bloodPressureSystolic: 128, bloodPressureDiastolic: 82, respiratoryRate: 18, oxygenSaturation: 98, painScore: 2, weight: 72.5, height: 176, bmi: 23.4, consciousness: 'Alert' },
                { id: 'vital-1202', patientId: 'pat-1002', recordedBy: 'user-nurse-1', timestamp: new Date().toISOString(), temperature: 37.1, heartRate: 88, bloodPressureSystolic: 122, bloodPressureDiastolic: 76, respiratoryRate: 20, oxygenSaturation: 97, painScore: 1, weight: 64, height: 165, bmi: 23.5, consciousness: 'Alert' }
            ];

            const consultations = [
                { id: 'consult-1301', patientId: 'pat-1001', doctorId: 'user-doctor-1', chiefComplaint: 'Headache and dizziness', diagnosis: 'Hypertension follow-up', assessment: 'Stable blood pressure trend', plan: 'Continue current medication and repeat review in 2 weeks.', followUpDate: isoDate(14), status: 'completed', createdAt: new Date().toISOString() },
                { id: 'consult-1302', patientId: 'pat-1002', doctorId: 'user-doctor-1', chiefComplaint: 'Chest tightness', diagnosis: 'Asthma flare', assessment: 'Controlled with inhaler', plan: 'Monitor trigger avoidance and continue inhaler use.', followUpDate: isoDate(10), status: 'completed', createdAt: new Date().toISOString() }
            ];

            const documents = [
                { id: 'doc-1401', patientId: 'pat-1001', fileName: 'BP-Review.pdf', documentType: 'Progress Note', fileUrl: '', uploadedBy: 'System Administrator', uploadedAt: new Date().toISOString(), size: '420 KB' },
                { id: 'doc-1402', patientId: 'pat-1002', fileName: 'Asthma-Plan.pdf', documentType: 'Care Plan', fileUrl: '', uploadedBy: 'Dr. Ada Smith', uploadedAt: new Date().toISOString(), size: '310 KB' }
            ];

            const immunizations = [
                { id: 'imm-1501', patientId: 'pat-1002', vaccine: 'Influenza', status: 'administered', administeredDate: isoDate(-20), nextDueDate: null, notes: 'Annual vaccine completed.' },
                { id: 'imm-1502', patientId: 'pat-1004', vaccine: 'COVID-19 Booster', status: 'scheduled', administeredDate: null, nextDueDate: isoDate(7), notes: 'Schedule booster.' }
            ];

            const allergies = [
                { id: 'allergy-1601', patientId: 'pat-1001', substance: 'Penicillin', category: 'Medication', reaction: 'Rash', severity: 'moderate', criticality: 'medium', clinicalStatus: 'active' },
                { id: 'allergy-1602', patientId: 'pat-1003', substance: 'Latex', category: 'Material', reaction: 'Skin irritation', severity: 'mild', criticality: 'low', clinicalStatus: 'active' }
            ];

            const conditions = [
                { id: 'cond-1701', patientId: 'pat-1001', conditionName: 'Hypertension', clinicalStatus: 'active', verificationStatus: 'confirmed', onsetDate: '2020-02-01', notes: 'Managed with lifestyle adjustments and medication.' },
                { id: 'cond-1702', patientId: 'pat-1002', conditionName: 'Asthma', clinicalStatus: 'active', verificationStatus: 'confirmed', onsetDate: '2017-04-12', notes: 'Triggered by dust and seasonal changes.' },
                { id: 'cond-1703', patientId: 'pat-1003', conditionName: 'Diabetes mellitus', clinicalStatus: 'active', verificationStatus: 'confirmed', onsetDate: '2018-06-05', notes: 'Monitoring glucose regularly.' }
            ];

            const medicationOrders = [
                { id: 'med-1801', patientId: 'pat-1001', medicationName: 'Amlodipine', dose: '5', doseUnit: 'mg', route: 'Oral', frequency: 'OD', status: 'active', indication: 'Blood pressure control' },
                { id: 'med-1802', patientId: 'pat-1002', medicationName: 'Albuterol Inhaler', dose: '2', doseUnit: 'puffs', route: 'Inhaled', frequency: 'PRN', status: 'active', indication: 'Asthma relief' }
            ];

            const carePlans = [
                { id: 'care-1901', patientId: 'pat-1001', title: 'Hypertension care plan', description: 'Review BP trend and medication adherence weekly.', status: 'active', targetDate: isoDate(30), reviewDate: isoDate(14) },
                { id: 'care-1902', patientId: 'pat-1002', title: 'Asthma monitoring plan', description: 'Track inhaler use and trigger management.', status: 'active', targetDate: isoDate(21), reviewDate: isoDate(7) }
            ];

            const clinicalTasks = [
                { id: 'task-2001', patientId: 'pat-1001', title: 'Repeat blood pressure check', taskType: 'Observation', dueAt: new Date().toISOString(), priority: 'routine', status: 'open' },
                { id: 'task-2002', patientId: 'pat-1002', title: 'Review trigger diary', taskType: 'Education', dueAt: new Date().toISOString(), priority: 'routine', status: 'in_progress' }
            ];

            const clinicalAlerts = [
                { id: 'alert-2101', patientId: 'pat-1004', alertType: 'Cardiac', severity: 'critical', message: 'High-risk cardiac admission under observation.', status: 'open' },
                { id: 'alert-2102', patientId: 'pat-1003', alertType: 'Medication', severity: 'warning', message: 'Low insulin stock detected.', status: 'acknowledged' }
            ];

            const wards = [
                { id: 'ward-2201', name: 'General Ward', specialty: 'Internal Medicine', capacity: 16, occupied: 9, status: 'active' },
                { id: 'ward-2202', name: 'Cardiac Ward', specialty: 'Cardiology', capacity: 10, occupied: 4, status: 'active' },
                { id: 'ward-2203', name: 'Maternity', specialty: 'Obstetrics', capacity: 12, occupied: 7, status: 'active' }
            ];

            const beds = [
                { id: 'bed-2301', wardId: 'ward-2201', bedNumber: 'G-01', status: 'occupied' },
                { id: 'bed-2302', wardId: 'ward-2201', bedNumber: 'G-02', status: 'available' },
                { id: 'bed-2303', wardId: 'ward-2202', bedNumber: 'C-02', status: 'occupied' },
                { id: 'bed-2304', wardId: 'ward-2202', bedNumber: 'C-05', status: 'available' }
            ];

            const insuranceClaims = [
                { id: 'claim-2401', patientId: 'pat-1002', claimNumber: 'CLM-1209', provider: 'Leadway', amountClaimed: 2850, amountApproved: 2100, status: 'pending' },
                { id: 'claim-2402', patientId: 'pat-1004', claimNumber: 'CLM-1218', provider: 'AXA Health', amountClaimed: 5300, amountApproved: 4800, status: 'approved' }
            ];

            const offices = [
                { id: 'office-2501', name: 'Cardiology Clinic', officeType: 'Clinic', specialty: 'Cardiology', location: 'Block A', phone: '+2348003003001', email: 'cardio@medicore.local', status: 'active', headDoctorId: 'user-doctor-1', createdBy: 'user-admin', createdAt: new Date().toISOString() },
                { id: 'office-2502', name: 'Outpatient Wing', officeType: 'Clinic', specialty: 'General Medicine', location: 'Block B', phone: '+2348003003002', email: 'outpatient@medicore.local', status: 'active', headDoctorId: null, createdBy: 'user-admin', createdAt: new Date().toISOString() }
            ];

            const officeStaff = [
                { id: 'office-staff-2601', officeId: 'office-2501', profileId: 'user-doctor-1', role: 'specialist', isLead: true },
                { id: 'office-staff-2602', officeId: 'office-2502', profileId: 'user-receptionist-1', role: 'front_desk', isLead: false }
            ];

            return {
                users,
                patients,
                appointments,
                labOrders,
                radiologyOrders,
                prescriptions,
                pharmacyInventory,
                billing,
                admissions,
                surgeries,
                notifications,
                auditLogs,
                vitals,
                consultations,
                documents,
                immunizations,
                allergies,
                conditions,
                medicationOrders,
                carePlans,
                clinicalTasks,
                clinicalAlerts,
                wards,
                beds,
                insuranceClaims,
                offices,
                officeStaff
            };
        };

        const initializeLocalSeedData = () => {
            try {
                const stored = localStorage.getItem('medicore_store');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed && typeof parsed === 'object') {
                        Object.keys(seedData).forEach((key) => {
                            const value = Array.isArray(parsed[key]) ? parsed[key] : (Array.isArray(seedData[key]) ? seedData[key] : []);
                            seedData[key] = value;
                        });
                        return seedData;
                    }
                }
            } catch (e) {
                console.warn('Unable to load stored local data; bootstrapping defaults.', e);
            }

            const generated = buildDefaultSeedData();
            Object.keys(seedData).forEach((key) => {
                seedData[key] = Array.isArray(generated[key]) ? generated[key] : [];
            });
            try {
                localStorage.setItem('medicore_store', JSON.stringify(generated));
            } catch (e) {}
            return seedData;
        };

        const hydrateSeedData = () => {
            const tables = ['users', 'patients', 'appointments', 'labOrders', 'radiologyOrders', 'prescriptions', 'pharmacyInventory', 'billing', 'admissions', 'surgeries', 'notifications', 'auditLogs', 'vitals', 'consultations', 'documents', 'immunizations', 'allergies', 'conditions', 'medicationOrders', 'carePlans', 'clinicalTasks', 'clinicalAlerts', 'wards', 'offices', 'officeStaff'];
            const next = {};
            initializeLocalSeedData();
            tables.forEach((table) => {
                next[table] = Array.isArray(seedData[table]) ? seedData[table] : [];
            });
            return next;
        };

        const persistSeedTable = (table, rows) => {
            const nextRows = Array.isArray(rows) ? rows : [];
            if (seedData) seedData[table] = nextRows;
            try {
                const existing = JSON.parse(localStorage.getItem('medicore_store') || '{}');
                existing[table] = nextRows;
                localStorage.setItem('medicore_store', JSON.stringify(existing));
            } catch (e) {}
            return nextRows;
        };

        const navigateTo = (module) => {
            window.dispatchEvent(new CustomEvent('medicore:navigate', { detail: module }));
        };

        const loadSupabaseTables = async () => {
            const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function'
                ? window.MedicoreSupabase.getClient()
                : null;
            if (!client) {
                initializeLocalSeedData();
                return seedData;
            }

            const lookups = [
                { dbTable: 'profiles', appTable: 'users', mapper: normalizeUsers },
                { dbTable: 'patients', appTable: 'patients', mapper: normalizePatients },
                { dbTable: 'appointments', appTable: 'appointments', mapper: normalizeAppointments },
                { dbTable: 'lab_orders', appTable: 'labOrders', mapper: normalizeLabOrders },
                { dbTable: 'radiology_orders', appTable: 'radiologyOrders', mapper: normalizeRadiologyOrders },
                { dbTable: 'prescriptions', appTable: 'prescriptions', mapper: normalizePrescriptions },
                { dbTable: 'pharmacy_inventory', appTable: 'pharmacyInventory', mapper: normalizeInventory },
                { dbTable: 'billing', appTable: 'billing', mapper: normalizeBilling },
                { dbTable: 'admissions', appTable: 'admissions', mapper: normalizeAdmissions },
                { dbTable: 'surgeries', appTable: 'surgeries', mapper: normalizeSurgeries },
                { dbTable: 'notifications', appTable: 'notifications', mapper: normalizeNotifications },
                { dbTable: 'audit_logs', appTable: 'auditLogs', mapper: normalizeAuditLogs },
                { dbTable: 'vital_signs', appTable: 'vitals', mapper: normalizeVitals },
                { dbTable: 'consultations', appTable: 'consultations', mapper: normalizeConsultations },
                { dbTable: 'patient_documents', appTable: 'documents', mapper: normalizeDocuments },
                { dbTable: 'immunizations', appTable: 'immunizations', mapper: normalizeImmunizations }
            ];

            const nextStore = { users: [], patients: [], appointments: [], labOrders: [], radiologyOrders: [], prescriptions: [], pharmacyInventory: [], billing: [], admissions: [], surgeries: [], notifications: [], auditLogs: [], vitals: [], consultations: [], documents: [], immunizations: [], allergies: [], conditions: [], medicationOrders: [], carePlans: [], clinicalTasks: [], clinicalAlerts: [], wards: [], beds: [], insuranceClaims: [], offices: [], officeStaff: [] };
            const officeLookups = [
                { dbTable: 'profiles', appTable: 'users', mapper: normalizeUsers },
                { dbTable: 'patients', appTable: 'patients', mapper: normalizePatients },
                { dbTable: 'appointments', appTable: 'appointments', mapper: normalizeAppointments },
                { dbTable: 'lab_orders', appTable: 'labOrders', mapper: normalizeLabOrders },
                { dbTable: 'radiology_orders', appTable: 'radiologyOrders', mapper: normalizeRadiologyOrders },
                { dbTable: 'prescriptions', appTable: 'prescriptions', mapper: normalizePrescriptions },
                { dbTable: 'pharmacy_inventory', appTable: 'pharmacyInventory', mapper: normalizeInventory },
                { dbTable: 'billing', appTable: 'billing', mapper: normalizeBilling },
                { dbTable: 'admissions', appTable: 'admissions', mapper: normalizeAdmissions },
                { dbTable: 'surgeries', appTable: 'surgeries', mapper: normalizeSurgeries },
                { dbTable: 'notifications', appTable: 'notifications', mapper: normalizeNotifications },
                { dbTable: 'audit_logs', appTable: 'auditLogs', mapper: normalizeAuditLogs },
                { dbTable: 'vital_signs', appTable: 'vitals', mapper: normalizeVitals },
                { dbTable: 'consultations', appTable: 'consultations', mapper: normalizeConsultations },
                { dbTable: 'patient_documents', appTable: 'documents', mapper: normalizeDocuments },
                { dbTable: 'immunizations', appTable: 'immunizations', mapper: normalizeImmunizations },
                { dbTable: 'patient_allergies', appTable: 'allergies', mapper: normalizeAllergies },
                { dbTable: 'patient_conditions', appTable: 'conditions', mapper: normalizeConditions },
                { dbTable: 'medication_orders', appTable: 'medicationOrders', mapper: normalizeMedicationOrders },
                { dbTable: 'care_plans', appTable: 'carePlans', mapper: normalizeCarePlans },
                { dbTable: 'clinical_tasks', appTable: 'clinicalTasks', mapper: normalizeClinicalTasks },
                { dbTable: 'clinical_alerts', appTable: 'clinicalAlerts', mapper: normalizeClinicalAlerts },
                { dbTable: 'wards', appTable: 'wards', mapper: normalizeWards },
                { dbTable: 'beds', appTable: 'beds', mapper: normalizeBeds },
                { dbTable: 'insurance_claims', appTable: 'insuranceClaims', mapper: normalizeInsuranceClaims },
                { dbTable: 'medical_offices', appTable: 'offices', mapper: normalizeOffices },
                { dbTable: 'office_staff', appTable: 'officeStaff', mapper: normalizeOfficeStaff }
            ];
            for (const entry of officeLookups) {
                const { data, error } = await client.from(entry.dbTable).select('*');
                if (error) {
                    console.error(`Failed to load ${entry.dbTable}:`, error);
                    nextStore[entry.appTable] = [];
                    continue;
                }
                nextStore[entry.appTable] = entry.mapper(data || []);
            }

            const hasRemoteRows = Object.values(nextStore).some((value) => Array.isArray(value) && value.length > 0);
            if (!hasRemoteRows) {
                initializeLocalSeedData();
                return seedData;
            }

            Object.keys(seedData).forEach((key) => delete seedData[key]);
            Object.assign(seedData, nextStore);
            return nextStore;
        };

// ==========================================
        // UTILITY FUNCTIONS
        // ==========================================
        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        };

        const formatDateTime = (dateStr) => {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        };

        const formatCurrency = (amount) => {
            const num = parseFloat(amount);
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
        };

        const calculateAge = (dob) => {
            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
            return age;
        };

        const getStatusColor = (status) => {
            const colors = {
                active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                inactive: 'bg-slate-100 text-slate-600 border-slate-200',
                pending: 'bg-amber-100 text-amber-700 border-amber-200',
                completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                cancelled: 'bg-red-100 text-red-700 border-red-200',
                discharged: 'bg-blue-100 text-blue-700 border-blue-200',
                'in-progress': 'bg-medical-100 text-medical-700 border-medical-200',
                scheduled: 'bg-violet-100 text-violet-700 border-violet-200',
                critical: 'bg-red-100 text-red-700 border-red-200',
                urgent: 'bg-orange-100 text-orange-700 border-orange-200',
                stat: 'bg-red-100 text-red-700 border-red-200 animate-pulse',
                paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                partial: 'bg-amber-100 text-amber-700 border-amber-200',
                overdue: 'bg-red-100 text-red-700 border-red-200',
                available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                occupied: 'bg-red-100 text-red-700 border-red-200',
                maintenance: 'bg-slate-100 text-slate-600 border-slate-200',
                reserved: 'bg-violet-100 text-violet-700 border-violet-200',
                normal: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                high: 'bg-red-100 text-red-700 border-red-200',
                low: 'bg-amber-100 text-amber-700 border-amber-200',
                'no-show': 'bg-slate-100 text-slate-600 border-slate-200'
            };
            return colors[status] || 'bg-slate-100 text-slate-600 border-slate-200';
        };
