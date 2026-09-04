
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

        const createEmptyStore = () => ({
            users: [], patients: [], appointments: [], labOrders: [], radiologyOrders: [], prescriptions: [],
            pharmacyInventory: [], billing: [], admissions: [], surgeries: [], notifications: [], auditLogs: [],
            vitals: [], consultations: [], documents: [], immunizations: [], allergies: [], conditions: [],
            medicationOrders: [], carePlans: [], clinicalTasks: [], clinicalAlerts: [], wards: [], beds: [],
            insuranceClaims: [], offices: [], officeStaff: []
        });


        const initializeLocalSeedData = () => {
            Object.assign(seedData, createEmptyStore());
            return seedData;
        };

        const hydrateSeedData = () => {
            const tables = ['users', 'patients', 'appointments', 'labOrders', 'radiologyOrders', 'prescriptions', 'pharmacyInventory', 'billing', 'admissions', 'surgeries', 'notifications', 'auditLogs', 'vitals', 'consultations', 'documents', 'immunizations', 'allergies', 'conditions', 'medicationOrders', 'carePlans', 'clinicalTasks', 'clinicalAlerts', 'wards', 'offices', 'officeStaff'];
            const next = {};
            tables.forEach((table) => {
                next[table] = Array.isArray(seedData[table]) ? seedData[table] : [];
            });
            return next;
        };

        const persistSeedTable = (table, rows) => {
            const nextRows = Array.isArray(rows) ? rows : [];
            if (seedData) seedData[table] = nextRows;
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
