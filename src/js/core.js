
        const { useState, useEffect, useCallback, useRef, useMemo } = React;

        // ==========================================
        // LIVE DATA STORE
        // ==========================================
        const appData = new Proxy({
            users: [],
            patients: [],
            appointments: [],
            labOrders: [],
            radiologyOrders: [],
            prescriptions: [],
            pharmacyInventory: [],
            billing: [],
            paymentSubmissions: [],
            admissions: [],
            surgeries: [],
            encounters: [],
            notifications: [],
            auditLogs: [],
            vitals: [],
            medicationAdministrations: [],
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
            refillRequests: [],
            offices: [],
            officeStaff: [],
            resultAcknowledgements: [],
            medicationReconciliations: []
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
            // Never turn a malformed or incomplete directory row into an
            // administrator in the browser. Server RLS remains authoritative.
            role: row.role || 'receptionist',
            name: row.full_name || row.name || row.email,
            fullName: row.full_name || row.name || row.email,
            patientId: row.patient_id || row.patientId || null,
            department: row.department || '',
            status: row.status || 'active',
            createdAt: row.created_at || row.createdAt
        }));

        const normalizePatients = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientNumber: row.patient_number || row.patientNumber,
            medicalRecordNumber: row.medical_record_number || row.medicalRecordNumber || '',
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
            registrationDate: row.registration_date || row.registrationDate || formatFacilityDate(),
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
            barcode: row.barcode || row.bar_code || '',
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
            department: row.department || '',
            service: row.service || '',
            status: row.status || 'pending'
        }));

        const normalizePaymentSubmissions = (rows = []) => rows.map((row) => ({
            ...row, patientId: row.patient_id || row.patientId, invoiceId: row.billing_id || row.invoiceId,
            invoiceNumber: row.invoice_number || row.invoiceNumber, paymentMethod: row.payment_method || row.paymentMethod,
            createdAt: row.created_at || row.createdAt
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

        const normalizeEncounters = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            clinicianId: row.attending_clinician_id || row.clinicianId,
            appointmentId: row.appointment_id || row.appointmentId,
            encounterType: row.encounter_type || row.encounterType || 'outpatient',
            status: row.status || 'in_progress',
            startedAt: row.started_at || row.startedAt,
            endedAt: row.ended_at || row.endedAt || null,
            location: row.location || '',
            reasonForVisit: row.reason_for_visit || row.reasonForVisit || ''
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
            priority: row.priority || 'elective',
            encounterId: row.encounter_id || row.encounterId,
            indication: row.indication || '',
            diagnosis: row.diagnosis || '',
            reviewReason: row.review_reason || '',
            consentStatus: row.consent_status || 'pending',
            operativeNotes: row.operative_notes || '',
            postoperativePlan: row.postoperative_plan || '',
            complications: row.complications || ''
        }));

        const normalizeNotifications = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            userId: row.user_id || row.userId,
            type: row.type,
            title: row.title,
            message: row.message,
            read: Boolean(row.read),
            timestamp: row.created_at || row.timestamp,
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
            consciousness: row.consciousness || 'A',
            supplementalOxygen: row.supplemental_oxygen ?? row.supplementalOxygen ?? false,
            spo2Scale: row.spo2_scale || row.spo2Scale || 'scale_1',
            ageAtReadingDays: row.age_at_reading_days ?? row.ageAtReadingDays,
            ageBand: row.age_band || row.ageBand,
            news2Score: row.news2_score ?? row.news2Score,
            pewsScore: row.pews_score ?? row.pewsScore,
            scoreSystem: row.score_system || row.scoreSystem,
            scoreStatus: row.score_status || row.scoreStatus
        }));

        const normalizeMedicationAdministrations = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            prescriptionId: row.prescription_id || row.prescriptionId || null,
            medicationName: row.medication_name || row.medicationName,
            dosage: row.dosage || '',
            administeredBy: row.administered_by || row.administeredBy || null,
            administeredAt: row.administered_at || row.administeredAt,
            notes: row.notes || ''
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

        const normalizeRefillRequests = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            medicationName: row.medication_name || row.medicationName,
            quantity: row.quantity ?? 0,
            notes: row.notes || '',
            status: row.status || 'pending',
            reviewedBy: row.reviewed_by || row.reviewedBy || null,
            reviewedAt: row.reviewed_at || row.reviewedAt || null,
            createdAt: row.created_at || row.createdAt
        }));

        const normalizeOffices = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            name: row.name || row.office_name,
            officeType: row.office_type || row.officeType || 'Clinic',
            specialty: row.specialty || row.department || '',
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

        const normalizeResultAcknowledgements = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            resultType: row.result_type || row.resultType,
            resultId: row.result_id || row.resultId,
            patientId: row.patient_id || row.patientId,
            responsibleClinicianId: row.responsible_clinician_id || row.responsibleClinicianId,
            status: row.status || 'unacknowledged',
            dueAt: row.due_at || row.dueAt,
            acknowledgedAt: row.acknowledged_at || row.acknowledgedAt,
            acknowledgedBy: row.acknowledged_by || row.acknowledgedBy
        }));

        const normalizeMedicationReconciliations = (rows = []) => rows.map((row) => ({
            ...row,
            id: row.id,
            patientId: row.patient_id || row.patientId,
            encounterId: row.encounter_id || row.encounterId,
            transitionType: row.transition_type || row.transitionType,
            status: row.status || 'in_progress',
            reconciledBy: row.reconciled_by || row.reconciledBy,
            reconciledAt: row.reconciled_at || row.reconciledAt,
            notes: row.notes || ''
        }));

        const createEmptyStore = () => ({
            users: [], patients: [], appointments: [], labOrders: [], radiologyOrders: [], prescriptions: [],
            pharmacyInventory: [], billing: [], paymentSubmissions: [], admissions: [], surgeries: [], encounters: [], notifications: [], auditLogs: [],
            vitals: [], medicationAdministrations: [], consultations: [], documents: [], immunizations: [], allergies: [], conditions: [],
            medicationOrders: [], carePlans: [], clinicalTasks: [], clinicalAlerts: [], wards: [], beds: [],
            insuranceClaims: [], refillRequests: [], offices: [], officeStaff: [], resultAcknowledgements: [], medicationReconciliations: []
        });


        const initializeEmptyStore = () => {
            Object.assign(appData, createEmptyStore());
            return appData;
        };

        // The browser store only mirrors rows read from Supabase. It starts empty
        // so a missing connection can never produce demonstration records.
        const getLiveStore = () => {
            const tables = ['users', 'patients', 'appointments', 'labOrders', 'radiologyOrders', 'prescriptions', 'pharmacyInventory', 'billing', 'paymentSubmissions', 'admissions', 'surgeries', 'encounters', 'notifications', 'auditLogs', 'vitals', 'medicationAdministrations', 'consultations', 'documents', 'immunizations', 'allergies', 'conditions', 'medicationOrders', 'carePlans', 'clinicalTasks', 'clinicalAlerts', 'wards', 'beds', 'insuranceClaims', 'refillRequests', 'offices', 'officeStaff', 'resultAcknowledgements', 'medicationReconciliations'];
            const next = {};
            tables.forEach((table) => {
                next[table] = Array.isArray(appData[table]) ? appData[table] : [];
            });
            return next;
        };

        const persistStoreTable = (table, rows) => {
            const nextRows = Array.isArray(rows) ? rows : [];
            if (appData) appData[table] = nextRows;
            return nextRows;
        };

        // Clinical and operational writes must never fall back to browser memory.
        // A displayed record is therefore always a record that Supabase accepted.
        const notifyPersistenceFailure = (operation, error) => {
            const reason = error?.message ? ` ${error.message}` : '';
            window.dispatchEvent(new CustomEvent('onemed:persistence-error', {
                detail: `Unable to ${operation}. No changes were saved.${reason}`
            }));
            return null;
        };

        const navigateTo = (module) => {
            window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: module }));
        };

        const moduleTableLoaders = {
            dashboard: ['patients', 'appointments', 'lab_orders', 'admissions', 'billing', 'profiles', 'wards', 'vital_signs', 'medication_orders', 'clinical_alerts', 'patient_documents', 'clinical_tasks', 'pharmacy_inventory', 'audit_logs'],
            patients: ['patients'], patient: ['patients'], records: ['patients'],
            people: ['profiles', 'medical_offices', 'office_staff', 'appointments', 'lab_orders', 'admissions'], hr: ['profiles'], staff: ['profiles'],
            appointments: ['appointments', 'patients', 'profiles'], consultations: ['consultations', 'patients', 'profiles', 'encounters'],
            laboratory: ['lab_orders', 'patients', 'profiles', 'result_acknowledgements'], radiology: ['radiology_orders', 'patients', 'profiles'],
            pharmacy: ['prescriptions', 'pharmacy_inventory', 'patients', 'profiles'], billing: ['billing', 'payment_submissions', 'patients'], payments: ['billing', 'payment_submissions', 'patients'],
            admissions: ['admissions', 'wards', 'beds', 'patients', 'profiles'], surgeries: ['surgeries', 'patients', 'profiles'], clinical_safety: ['clinical_alerts', 'vital_signs', 'patients', 'profiles'],
            vitals: ['vital_signs', 'patients', 'profiles'], medications: ['prescriptions', 'medication_orders', 'medication_administrations', 'patients'],
            documents: ['patient_documents', 'patients'], upload: ['patient_documents', 'patients'], audit: ['audit_logs', 'profiles'], reports: ['patients', 'appointments', 'lab_orders', 'billing'],
            offices: ['medical_offices', 'office_staff', 'profiles'], organization: ['profiles'], settings: ['profiles'], portal: [], messages: [], lab_results: [],
            immunizations: ['immunizations', 'patients'], results: ['lab_orders', 'patients'], ward: ['admissions', 'wards', 'beds', 'patients']
        };
        const tableLoaders = {
            profiles: { appTable: 'users', mapper: normalizeUsers, order: 'full_name', select: 'id,email,full_name,role,department,status,created_at,patient_id,facility_id' },
            patients: { appTable: 'patients', mapper: normalizePatients, order: 'created_at', descending: true },
            appointments: { appTable: 'appointments', mapper: normalizeAppointments, order: 'appointment_date', descending: true },
            lab_orders: { appTable: 'labOrders', mapper: normalizeLabOrders, order: 'ordered_date', descending: true },
            radiology_orders: { appTable: 'radiologyOrders', mapper: normalizeRadiologyOrders, order: 'ordered_date', descending: true },
            prescriptions: { appTable: 'prescriptions', mapper: normalizePrescriptions, order: 'prescription_date', descending: true },
            pharmacy_inventory: { appTable: 'pharmacyInventory', mapper: normalizeInventory, order: 'name' },
            billing: { appTable: 'billing', mapper: normalizeBilling, order: 'created_at', descending: true },
            payment_submissions: { appTable: 'paymentSubmissions', mapper: normalizePaymentSubmissions, order: 'created_at', descending: true },
            admissions: { appTable: 'admissions', mapper: normalizeAdmissions, order: 'created_at', descending: true },
            surgeries: { appTable: 'surgeries', mapper: normalizeSurgeries, order: 'created_at', descending: true },
            encounters: { appTable: 'encounters', mapper: normalizeEncounters, order: 'created_at', descending: true },
            audit_logs: { appTable: 'auditLogs', mapper: normalizeAuditLogs, order: 'created_at', descending: true },
            vital_signs: { appTable: 'vitals', mapper: normalizeVitals, order: 'recorded_at', descending: true },
            medication_administrations: { appTable: 'medicationAdministrations', mapper: normalizeMedicationAdministrations, order: 'administered_at', descending: true },
            consultations: { appTable: 'consultations', mapper: normalizeConsultations, order: 'created_at', descending: true },
            patient_documents: { appTable: 'documents', mapper: normalizeDocuments, order: 'created_at', descending: true },
            immunizations: { appTable: 'immunizations', mapper: normalizeImmunizations, order: 'administered_at', descending: true },
            patient_allergies: { appTable: 'allergies', mapper: normalizeAllergies, order: 'created_at', descending: true },
            patient_conditions: { appTable: 'conditions', mapper: normalizeConditions, order: 'created_at', descending: true },
            medication_orders: { appTable: 'medicationOrders', mapper: normalizeMedicationOrders, order: 'created_at', descending: true },
            care_plans: { appTable: 'carePlans', mapper: normalizeCarePlans, order: 'created_at', descending: true },
            clinical_tasks: { appTable: 'clinicalTasks', mapper: normalizeClinicalTasks, order: 'created_at', descending: true },
            clinical_alerts: { appTable: 'clinicalAlerts', mapper: normalizeClinicalAlerts, order: 'created_at', descending: true },
            wards: { appTable: 'wards', mapper: normalizeWards, order: 'name' }, beds: { appTable: 'beds', mapper: normalizeBeds, order: 'created_at', descending: true },
            insurance_claims: { appTable: 'insuranceClaims', mapper: normalizeInsuranceClaims, order: 'created_at', descending: true },
            medication_refill_requests: { appTable: 'refillRequests', mapper: normalizeRefillRequests, order: 'created_at', descending: true },
            medical_offices: { appTable: 'offices', mapper: normalizeOffices, order: 'created_at', descending: true },
            office_staff: { appTable: 'officeStaff', mapper: normalizeOfficeStaff, order: 'created_at', descending: true },
            result_acknowledgements: { appTable: 'resultAcknowledgements', mapper: normalizeResultAcknowledgements, order: 'created_at', descending: true },
            medication_reconciliations: { appTable: 'medicationReconciliations', mapper: normalizeMedicationReconciliations, order: 'created_at', descending: true }
        };
        const moduleTables = {
            patients: ['patients'], records: ['patients'], laboratory: ['lab_orders'], radiology: ['radiology_orders'], pharmacy: ['prescriptions','pharmacy_inventory'],
            billing: ['billing','payment_submissions'], payments: ['payment_submissions'], admissions: ['admissions'], surgeries: ['surgeries'],
            clinical_safety: ['clinical_alerts','vital_signs'], vitals: ['vital_signs'], consultations: ['consultations','encounters'],
            appointments: ['appointments'], documents: ['patient_documents'], upload: ['patient_documents'], audit: ['audit_logs'], reports: ['billing','appointments','lab_orders'],
            people: ['profiles','medical_offices','office_staff'], hr: ['profiles'], staff: ['profiles'], offices: ['medical_offices','office_staff'], organization: ['profiles'], settings: ['profiles'],
            doctors: ['profiles','appointments','patients'], clinical_workflows: ['encounters','consultations','clinical_tasks','patients'],
            clinical_decision_support: ['clinical_alerts','vital_signs','patients'], operations: ['admissions','surgeries','billing','payment_submissions','pharmacy_inventory','patients'],
            procurement: ['pharmacy_inventory'], referrals: ['clinical_tasks','patients','profiles'], workforce: ['profiles','medical_offices','office_staff'],
            inventory: ['pharmacy_inventory'], insurance: ['insurance_claims','patients'], compliance: ['audit_logs','clinical_alerts'],
            dashboard: moduleTableLoaders.dashboard
        };
        const loadModuleData = async (moduleId, options = {}) => {
            const client = window.OneMedSupabase && typeof window.OneMedSupabase.getClient === 'function'
                ? window.OneMedSupabase.getClient()
                : null;
            if (!client) {
                return {
                    store: appData,
                    failures: [{ table: 'connection', message: 'Supabase is not configured or is unavailable.' }]
                };
            }
            const tables = moduleTables[moduleId] || [];
            const page = Math.max(0, Number(options.page) || 0);
            const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 50));
            const loadedTables = await Promise.all(tables.map(async (table) => {
                const entry = tableLoaders[table];
                let query = client.from(table).select(entry.select || '*', { count: 'exact' });
                if (table === 'patients' && (options.search?.trim() || options.status || options.facilityId)) {
                    const { data, error } = await client.rpc('search_patients_page', { p_query: options.search?.trim() || '', p_status: options.status || null, p_facility_id: options.facilityId || null, p_offset: page * pageSize, p_limit: pageSize });
                    if (error) return { appTable: entry.appTable, rows: [], failure: { table, message: error.message || 'The table could not be read.' } };
                    return { appTable: entry.appTable, rows: entry.mapper((data || []).map((row) => row.patient)), count: Number(data?.[0]?.total_count || 0) };
                }
                const order = options.orderBy && /^[a-z_]+$/.test(options.orderBy) ? options.orderBy : entry.order;
                query = query.order(order, { ascending: options.ascending ?? !entry.descending }).range(page * pageSize, page * pageSize + pageSize - 1);
                const filters = { ...(options.filters || {}) };
                if (options.status && table === 'patients') filters.status = options.status;
                if (options.facilityId && table === 'patients') filters.home_facility_id = options.facilityId;
                Object.entries(filters).forEach(([column, value]) => {
                    if (!/^[a-z_]+$/.test(column) || value === undefined || value === null || value === '') return;
                    if (Array.isArray(value)) query = query.in(column, value);
                    else if (typeof value === 'object' && value.operator && ['gte','lte','gt','lt'].includes(value.operator)) query = query[value.operator](column, value.value);
                    else query = query.eq(column, value);
                });
                if (options.search?.trim() && options.searchColumn && /^[a-z_]+$/.test(options.searchColumn) && table !== 'patients') {
                    query = query.ilike(options.searchColumn, `%${options.search.trim()}%`);
                }
                const { data, error, count } = await query;
                if (error) {
                    console.error(`Failed to load ${table}:`, error);
                    return {
                        appTable: entry.appTable,
                        rows: [],
                        failure: { table, message: error.message || 'The table could not be read.' }
                    };
                }
                return { appTable: entry.appTable, rows: entry.mapper(data || []), count };
            }));
            loadedTables.forEach(({ appTable, rows }) => { appData[appTable] = rows; });
            if (moduleId === 'dashboard') {
                const today = formatFacilityDate();
                const { data, error } = await client.rpc('get_screen_kpis', { p_facility_id: null, p_from: today, p_to: today });
                if (!error && data) appData.dashboardKpis = data;
                else if (error) loadedTables.push({ failure: { table: 'dashboard_kpis', message: error.message || 'Dashboard totals could not be loaded.' } });
            }
            return {
                store: appData,
                counts: Object.fromEntries(loadedTables.map((entry) => [entry.appTable, entry.count || 0])),
                failures: loadedTables.filter((entry) => entry.failure).map((entry) => entry.failure)
            };
        };
        const loadSupabaseTables = (moduleId = 'dashboard', options = {}) => loadModuleData(moduleId, options);

// ==========================================
        // UTILITY FUNCTIONS
        // ==========================================
        const formatFacilityDate = (date = new Date()) => {
            let parts;
            try {
                parts = new Intl.DateTimeFormat('en-CA', {
                    timeZone: window.OneMedFacilityTimezone || 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
                }).formatToParts(date);
            } catch (error) {
                parts = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
                }).formatToParts(date);
            }
            const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
            return `${values.year}-${values.month}-${values.day}`;
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const dateOnly = typeof dateStr === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.test(dateStr);
            const d = dateOnly ? new Date(`${dateStr}T00:00:00.000Z`) : new Date(dateStr);
            if (Number.isNaN(d.valueOf())) return 'N/A';
            return new Intl.DateTimeFormat('en-GB', { timeZone: dateOnly ? 'UTC' : (window.OneMedFacilityTimezone || 'Africa/Lagos'), day: '2-digit', month: 'short', year: 'numeric' }).format(d);
        };

        const formatDateTime = (dateStr) => {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            if (Number.isNaN(d.valueOf())) return 'N/A';
            return new Intl.DateTimeFormat('en-GB', { timeZone: window.OneMedFacilityTimezone || 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
        };

        const formatCurrency = (amount) => {
            const num = parseFloat(amount);
            if (!Number.isFinite(num)) return 'N/A';
            return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(num);
        };

        const calculateAge = (dob) => {
            if (!dob) return null;
            const parts = typeof dob === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
            const birthDate = parts
                ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
                : new Date(dob);
            if (Number.isNaN(birthDate.valueOf())) return null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            birthDate.setHours(0, 0, 0, 0);
            if (birthDate > today) return null;
            const addMonths = (date, count) => {
                const result = new Date(date.getFullYear(), date.getMonth() + count, 1);
                const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
                result.setDate(Math.min(date.getDate(), lastDay));
                return result;
            };
            let years = today.getFullYear() - birthDate.getFullYear();
            if (addMonths(birthDate, years * 12) > today) years--;
            let months = 0;
            while (months < 11 && addMonths(birthDate, years * 12 + months + 1) <= today) months++;
            const monthAnniversary = addMonths(birthDate, years * 12 + months);
            const days = Math.floor((today - monthAnniversary) / 86400000);
            return { years, months, days };
        };

        const formatAge = (age) => {
            if (!age) return 'Age unavailable';
            if (age.years === 0 && age.months === 0 && age.days < 28) {
                if (age.days < 7) return `${age.days} ${age.days === 1 ? 'day' : 'days'}`;
                const weeks = Math.floor(age.days / 7);
                return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
            }
            if (age.years < 2) {
                const months = Math.max(1, age.years * 12 + age.months);
                return `${months} ${months === 1 ? 'month' : 'months'}`;
            }
            return `${age.years} ${age.years === 1 ? 'year' : 'years'}`;
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

export { appData, normalizeUsers, normalizePatients, normalizeAppointments, normalizeLabOrders, normalizeRadiologyOrders, normalizePrescriptions, normalizeInventory, normalizeBilling, normalizePaymentSubmissions, normalizeAdmissions, normalizeEncounters, normalizeSurgeries, normalizeNotifications, normalizeAuditLogs, normalizeVitals, normalizeMedicationAdministrations, normalizeConsultations, normalizeDocuments, normalizeImmunizations, normalizeAllergies, normalizeConditions, normalizeMedicationOrders, normalizeCarePlans, normalizeClinicalTasks, normalizeClinicalAlerts, normalizeWards, normalizeBeds, normalizeInsuranceClaims, normalizeRefillRequests, normalizeOffices, normalizeOfficeStaff, normalizeResultAcknowledgements, normalizeMedicationReconciliations, createEmptyStore, initializeEmptyStore, getLiveStore, persistStoreTable, notifyPersistenceFailure, navigateTo, loadSupabaseTables, loadModuleData, formatFacilityDate, formatDate, formatDateTime, formatCurrency, calculateAge, formatAge, getStatusColor };
