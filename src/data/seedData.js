const generateId = () => Math.random().toString(36).substring(2, 15);

window.MediCoreSeedData = {
            users: [
                { id: 'u1', email: 'admin@medicore.com', password: 'admin123', role: 'super_admin', name: 'System Administrator', department: 'IT', status: 'active', lastLogin: '2026-09-01 06:30', avatar: null },
                { id: 'u2', email: 'dr.smith@medicore.com', password: 'doctor123', role: 'doctor', name: 'Dr. Sarah Smith', department: 'Cardiology', status: 'active', lastLogin: '2026-09-01 07:00', avatar: null, specialization: 'Cardiology', license: 'MD-4521' },
                { id: 'u3', email: 'dr.jones@medicore.com', password: 'doctor123', role: 'doctor', name: 'Dr. Michael Jones', department: 'Orthopedics', status: 'active', lastLogin: '2026-08-31 18:00', avatar: null, specialization: 'Orthopedic Surgery', license: 'MD-7823' },
                { id: 'u4', email: 'nurse.wilson@medicore.com', password: 'nurse123', role: 'nurse', name: 'Nurse Emily Wilson', department: 'General Ward', status: 'active', lastLogin: '2026-09-01 06:45', avatar: null, ward: 'Ward A' },
                { id: 'u5', email: 'lab.tech@medicore.com', password: 'lab123', role: 'laboratory_scientist', name: 'James Chen', department: 'Laboratory', status: 'active', lastLogin: '2026-09-01 05:00', avatar: null },
                { id: 'u6', email: 'pharmacy@medicore.com', password: 'pharma123', role: 'pharmacist', name: 'Maria Garcia', department: 'Pharmacy', status: 'active', lastLogin: '2026-09-01 06:00', avatar: null },
                { id: 'u7', email: 'reception@medicore.com', password: 'recept123', role: 'receptionist', name: 'David Park', department: 'Reception', status: 'active', lastLogin: '2026-09-01 07:10', avatar: null },
                { id: 'u8', email: 'radiology@medicore.com', password: 'radio123', role: 'radiographer', name: 'Dr. Lisa Wang', department: 'Radiology', status: 'active', lastLogin: '2026-08-31 20:00', avatar: null },
                { id: 'u9', email: 'billing@medicore.com', password: 'bill123', role: 'accountant', name: 'Robert Taylor', department: 'Billing', status: 'active', lastLogin: '2026-09-01 06:00', avatar: null },
                { id: 'u10', email: 'patient@demo.com', password: 'patient123', role: 'patient', name: 'John Doe', status: 'active', lastLogin: '2026-08-30 10:00', avatar: null, patientId: 'P-2026-0001' },
            ],
            patients: Array.from({ length: 50 }, (_, i) => ({
                id: 'p' + (i + 1),
                patientNumber: 'P-2026-' + String(i + 1).padStart(4, '0'),
                firstName: ['John', 'Mary', 'James', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph'][i % 15],
                lastName: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'][i % 15],
                dateOfBirth: new Date(1950 + Math.floor(Math.random() * 60), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
                gender: i % 2 === 0 ? 'Male' : 'Female',
                phone: '+1-555-' + String(1000 + i).padStart(4, '0'),
                email: 'patient' + (i + 1) + '@email.com',
                address: String(Math.floor(Math.random() * 9000) + 100) + ' ' + ['Main St', 'Oak Ave', 'Park Rd', 'Elm St', 'Cedar Ln'][i % 5] + ', ' + ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][i % 5],
                bloodGroup: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'][i % 8],
                emergencyContact: { name: 'Emergency Contact', phone: '+1-555-9999' },
                insurance: { provider: ['BlueCross', 'Aetna', 'Cigna', 'UnitedHealth', 'Kaiser'][i % 5], policyNumber: 'POL-' + Math.floor(Math.random() * 1000000) },
                registrationDate: new Date(2026, Math.floor(Math.random() * 8), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
                status: ['active', 'active', 'active', 'discharged', 'active'][i % 5],
                allergies: i % 7 === 0 ? 'Penicillin' : i % 5 === 0 ? 'Sulfa drugs' : 'None',
                chronicConditions: i % 10 === 0 ? 'Hypertension, Diabetes' : i % 8 === 0 ? 'Asthma' : 'None',
                photo: null,
                qrCode: null
            })),
            appointments: Array.from({ length: 30 }, (_, i) => {
                const today = new Date('2026-09-01');
                const date = new Date(today);
                date.setDate(today.getDate() + Math.floor(Math.random() * 7) - 2);
                const hour = 8 + Math.floor(Math.random() * 10);
                return {
                    id: 'apt' + (i + 1),
                    patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                    doctorId: 'u' + (2 + Math.floor(Math.random() * 2)),
                    date: date.toISOString().split('T')[0],
                    time: String(hour).padStart(2, '0') + ':' + ['00', '15', '30', '45'][Math.floor(Math.random() * 4)],
                    type: ['Consultation', 'Follow-up', 'Emergency', 'Routine Check', 'Lab Review'][Math.floor(Math.random() * 5)],
                    status: ['scheduled', 'completed', 'in-progress', 'cancelled', 'no-show'][Math.floor(Math.random() * 5)],
                    department: ['Cardiology', 'Orthopedics', 'General Medicine', 'Pediatrics', 'Dermatology'][Math.floor(Math.random() * 5)],
                    notes: '',
                    createdAt: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString()
                };
            }),
            labOrders: Array.from({ length: 25 }, (_, i) => ({
                id: 'lab' + (i + 1),
                patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                doctorId: 'u' + (2 + Math.floor(Math.random() * 2)),
                testType: ['CBC', 'Lipid Panel', 'Liver Function', 'Kidney Function', 'Thyroid', 'Glucose', 'HBA1C', 'Urinalysis', 'Culture', 'Blood Group'][Math.floor(Math.random() * 10)],
                category: ['Hematology', 'Chemistry', 'Microbiology', 'Serology', 'Histopathology'][Math.floor(Math.random() * 5)],
                status: ['pending', 'sample_collected', 'processing', 'completed', 'critical'][Math.floor(Math.random() * 5)],
                priority: ['routine', 'urgent', 'stat'][Math.floor(Math.random() * 3)],
                orderedDate: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                resultDate: Math.random() > 0.5 ? new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0] : null,
                results: Math.random() > 0.5 ? {
                    values: [
                        { parameter: 'WBC', value: (4 + Math.random() * 8).toFixed(1), unit: 'x10^9/L', range: '4.0-11.0', flag: Math.random() > 0.7 ? 'high' : 'normal' },
                        { parameter: 'RBC', value: (3.5 + Math.random() * 2).toFixed(2), unit: 'x10^12/L', range: '3.5-5.5', flag: 'normal' },
                        { parameter: 'Hemoglobin', value: (11 + Math.random() * 6).toFixed(1), unit: 'g/dL', range: '12-16', flag: Math.random() > 0.6 ? 'low' : 'normal' },
                        { parameter: 'Platelets', value: Math.floor(100 + Math.random() * 300), unit: 'x10^9/L', range: '150-400', flag: Math.random() > 0.7 ? 'low' : 'normal' }
                    ]
                } : null,
                technicianId: 'u5'
            })),
            radiologyOrders: Array.from({ length: 20 }, (_, i) => ({
                id: 'rad' + (i + 1),
                patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                doctorId: 'u' + (2 + Math.floor(Math.random() * 2)),
                studyType: ['Chest X-Ray', 'MRI Brain', 'CT Abdomen', 'Ultrasound', 'Mammography', 'Bone Densitometry', 'Echocardiogram'][Math.floor(Math.random() * 7)],
                modality: ['X-Ray', 'MRI', 'CT', 'Ultrasound', 'ECG'][Math.floor(Math.random() * 5)],
                status: ['requested', 'scheduled', 'completed', 'reported'][Math.floor(Math.random() * 4)],
                priority: ['routine', 'urgent', 'stat'][Math.floor(Math.random() * 3)],
                orderedDate: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                scheduledDate: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                report: Math.random() > 0.5 ? 'Normal study. No acute findings. Clinical correlation recommended.' : null,
                images: Math.random() > 0.3 ? Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, j) => 'image_' + (j + 1) + '.dcm') : [],
                radiologistId: 'u8'
            })),
            prescriptions: Array.from({ length: 35 }, (_, i) => ({
                id: 'rx' + (i + 1),
                patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                doctorId: 'u' + (2 + Math.floor(Math.random() * 2)),
                date: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                status: ['active', 'dispensed', 'cancelled', 'expired'][Math.floor(Math.random() * 4)],
                diagnosis: ['Hypertension', 'Type 2 Diabetes', 'Upper Respiratory Infection', 'Osteoarthritis', 'Migraine'][Math.floor(Math.random() * 5)],
                medications: Array.from({ length: Math.floor(Math.random() * 4) + 1 }, (_, j) => ({
                    name: ['Metformin', 'Lisinopril', 'Atorvastatin', 'Omeprazole', 'Amoxicillin', 'Ibuprofen', 'Paracetamol', 'Amlodipine'][Math.floor(Math.random() * 8)],
                    dosage: [125, 250, 500][Math.floor(Math.random() * 3)] + 'mg',
                    frequency: ['Once daily', 'Twice daily', 'Three times daily', 'Every 8 hours', 'As needed'][Math.floor(Math.random() * 5)],
                    duration: (Math.floor(Math.random() * 14) + 7) + ' days',
                    route: ['Oral', 'IV', 'IM', 'Topical'][Math.floor(Math.random() * 4)],
                    instructions: 'Take with food'
                })),
                notes: 'Patient counseled on medication adherence'
            })),
            pharmacyInventory: Array.from({ length: 100 }, (_, i) => ({
                id: 'drug' + (i + 1),
                name: ['Metformin', 'Lisinopril', 'Atorvastatin', 'Omeprazole', 'Amoxicillin', 'Ibuprofen', 'Paracetamol', 'Amlodipine', 'Metoprolol', 'Simvastatin', 'Losartan', 'Gabapentin', 'Levothyroxine', 'Aspirin', 'Albuterol'][i % 15] + ' ' + ['500mg', '250mg', '10mg', '20mg', '5mg'][Math.floor(Math.random() * 5)],
                genericName: ['Metformin HCl', 'Lisinopril', 'Atorvastatin Calcium', 'Omeprazole', 'Amoxicillin Trihydrate'][i % 5],
                category: ['Antidiabetic', 'Antihypertensive', 'Statin', 'PPI', 'Antibiotic', 'NSAID', 'Analgesic', 'Calcium Channel Blocker'][Math.floor(Math.random() * 8)],
                stockQuantity: Math.floor(Math.random() * 500) + 10,
                reorderLevel: 50,
                unitPrice: (Math.random() * 100 + 5).toFixed(2),
                expiryDate: new Date(2026 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
                batchNumber: 'BATCH-' + Math.floor(Math.random() * 100000),
                supplier: ['PharmaCorp', 'MedSupply Ltd', 'HealthDrugs Inc', 'GlobalPharma'][Math.floor(Math.random() * 4)],
                location: 'Shelf ' + String.fromCharCode(65 + Math.floor(Math.random() * 8)) + '-' + (Math.floor(Math.random() * 20) + 1),
                status: Math.random() > 0.9 ? 'low_stock' : Math.random() > 0.95 ? 'expired' : 'active'
            })),
            admissions: Array.from({ length: 15 }, (_, i) => ({
                id: 'adm' + (i + 1),
                patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                ward: ['ICU', 'General Ward A', 'General Ward B', 'Private Room', 'Maternity', 'Pediatric Ward'][Math.floor(Math.random() * 6)],
                bedNumber: 'B-' + (Math.floor(Math.random() * 20) + 1),
                admissionDate: new Date(2026, 8, Math.floor(Math.random() * 20) + 1).toISOString().split('T')[0],
                dischargeDate: Math.random() > 0.6 ? null : new Date(2026, 8, Math.floor(Math.random() * 10) + 20).toISOString().split('T')[0],
                doctorId: 'u' + (2 + Math.floor(Math.random() * 2)),
                diagnosis: ['Pneumonia', 'Myocardial Infarction', 'Appendicitis', 'Fracture', 'Stroke', 'Sepsis'][Math.floor(Math.random() * 6)],
                status: Math.random() > 0.6 ? 'active' : 'discharged',
                acuity: ['stable', 'moderate', 'critical'][Math.floor(Math.random() * 3)]
            })),
            billing: Array.from({ length: 40 }, (_, i) => {
                const subtotal = (Math.random() * 1000 + 100).toFixed(2);
                const discount = (Math.random() * 50).toFixed(2);
                const tax = (Math.random() * 30).toFixed(2);
                const total = (parseFloat(subtotal) - parseFloat(discount) + parseFloat(tax)).toFixed(2);
                const paid = (Math.random() * parseFloat(total)).toFixed(2);
                const balance = (parseFloat(total) - parseFloat(paid)).toFixed(2);
                return {
                    id: 'bill' + (i + 1),
                    patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                    invoiceNumber: 'INV-2026-' + String(i + 1).padStart(4, '0'),
                    date: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                    items: Array.from({ length: Math.floor(Math.random() * 4) + 1 }, (_, j) => ({
                        description: ['Consultation', 'Laboratory Tests', 'Radiology', 'Pharmacy', 'Surgery', 'Room Charges', 'Nursing Care'][Math.floor(Math.random() * 7)],
                        quantity: Math.floor(Math.random() * 3) + 1,
                        unitPrice: (Math.random() * 200 + 50).toFixed(2),
                        total: (Math.random() * 400 + 50).toFixed(2)
                    })),
                    subtotal: subtotal,
                    discount: discount,
                    tax: tax,
                    total: total,
                    paid: paid,
                    balance: balance,
                    paymentMethod: ['Cash', 'Card', 'Insurance', 'Bank Transfer', 'Mobile Money'][Math.floor(Math.random() * 5)],
                    status: ['paid', 'partial', 'pending', 'overdue'][Math.floor(Math.random() * 4)],
                    insuranceClaim: Math.random() > 0.7 ? { provider: 'BlueCross', claimNumber: 'CLM-' + Math.floor(Math.random() * 100000), amount: (Math.random() * 500).toFixed(2), status: 'pending' } : null
                };
            }),
            vitals: Array.from({ length: 200 }, (_, i) => ({
                id: 'vit' + (i + 1),
                patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                recordedBy: 'u4',
                timestamp: new Date(2026, 8, Math.floor(Math.random() * 30) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60)).toISOString(),
                temperature: (36 + Math.random() * 2).toFixed(1),
                heartRate: Math.floor(60 + Math.random() * 40),
                bloodPressureSystolic: Math.floor(110 + Math.random() * 30),
                bloodPressureDiastolic: Math.floor(70 + Math.random() * 20),
                respiratoryRate: Math.floor(12 + Math.random() * 8),
                oxygenSaturation: Math.floor(95 + Math.random() * 5),
                weight: (50 + Math.random() * 50).toFixed(1),
                height: (150 + Math.random() * 30).toFixed(0),
                bmi: (20 + Math.random() * 10).toFixed(1),
                painScore: Math.floor(Math.random() * 11),
                consciousness: ['Alert', 'Verbal', 'Pain', 'Unresponsive'][Math.floor(Math.random() * 4)]
            })),
            notifications: Array.from({ length: 20 }, (_, i) => ({
                id: 'notif' + (i + 1),
                userId: 'u2',
                type: ['appointment', 'lab', 'prescription', 'billing', 'system', 'alert'][Math.floor(Math.random() * 6)],
                title: ['New Appointment', 'Lab Results Ready', 'Prescription Updated', 'Payment Received', 'System Maintenance', 'Critical Alert'][Math.floor(Math.random() * 6)],
                message: ['Patient waiting in room 3', 'CBC results for patient P-2026-0012 are ready', 'New prescription pending review', 'Invoice INV-2026-0042 paid in full', 'Scheduled maintenance tonight', 'Critical value: Potassium 6.2'][Math.floor(Math.random() * 6)],
                timestamp: new Date(2026, 8, Math.floor(Math.random() * 30) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60)).toISOString(),
                read: Math.random() > 0.5,
                priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
            })),
            auditLogs: Array.from({ length: 50 }, (_, i) => ({
                id: 'audit' + (i + 1),
                userId: 'u' + (Math.floor(Math.random() * 9) + 1),
                action: ['LOGIN', 'VIEW_RECORD', 'CREATE_RECORD', 'UPDATE_RECORD', 'DELETE_RECORD', 'PRINT', 'EXPORT', 'PRESCRIBE', 'ORDER_LAB', 'ADMINISTER_MED'][Math.floor(Math.random() * 10)],
                entityType: ['patient', 'appointment', 'prescription', 'lab_order', 'billing', 'user', 'medication'][Math.floor(Math.random() * 7)],
                entityId: generateId(),
                timestamp: new Date(2026, 8, Math.floor(Math.random() * 30) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60)).toISOString(),
                ipAddress: '192.168.1.' + Math.floor(Math.random() * 255),
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                beforeValue: Math.random() > 0.7 ? JSON.stringify({ status: 'pending' }) : null,
                afterValue: Math.random() > 0.7 ? JSON.stringify({ status: 'completed' }) : null,
                severity: ['info', 'warning', 'critical'][Math.floor(Math.random() * 3)]
            })),
            surgeries: Array.from({ length: 10 }, (_, i) => ({
                id: 'surg' + (i + 1),
                patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                surgeonId: 'u' + (2 + Math.floor(Math.random() * 2)),
                procedure: ['Appendectomy', 'Cholecystectomy', 'Hernia Repair', 'Knee Replacement', 'Cataract Surgery', 'Cesarean Section'][Math.floor(Math.random() * 6)],
                scheduledDate: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                scheduledTime: String(8 + Math.floor(Math.random() * 10)).padStart(2, '0') + ':00',
                duration: (Math.floor(Math.random() * 4) + 1) + ' hours',
                status: ['scheduled', 'in-progress', 'completed', 'cancelled'][Math.floor(Math.random() * 4)],
                otRoom: 'OT-' + (Math.floor(Math.random() * 6) + 1),
                anesthesia: ['General', 'Spinal', 'Local', 'Epidural'][Math.floor(Math.random() * 4)],
                priority: ['elective', 'urgent', 'emergency'][Math.floor(Math.random() * 3)]
            })),
            wards: [
                { id: 'w1', name: 'ICU', type: 'critical_care', capacity: 12, occupied: 10, nurseStation: 'NS-ICU', status: 'active' },
                { id: 'w2', name: 'General Ward A', type: 'general', capacity: 30, occupied: 24, nurseStation: 'NS-A', status: 'active' },
                { id: 'w3', name: 'General Ward B', type: 'general', capacity: 30, occupied: 18, nurseStation: 'NS-B', status: 'active' },
                { id: 'w4', name: 'Private Rooms', type: 'private', capacity: 15, occupied: 12, nurseStation: 'NS-Private', status: 'active' },
                { id: 'w5', name: 'Maternity Ward', type: 'maternity', capacity: 20, occupied: 16, nurseStation: 'NS-Mat', status: 'active' },
                { id: 'w6', name: 'Pediatric Ward', type: 'pediatric', capacity: 25, occupied: 20, nurseStation: 'NS-Ped', status: 'active' }
            ],
            beds: Array.from({ length: 132 }, (_, i) => {
                const wardIds = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
                const ward = wardIds[Math.floor(Math.random() * 6)];
                const wardInfo = { w1: { name: 'ICU', cap: 12 }, w2: { name: 'General A', cap: 30 }, w3: { name: 'General B', cap: 30 }, w4: { name: 'Private', cap: 15 }, w5: { name: 'Maternity', cap: 20 }, w6: { name: 'Pediatric', cap: 25 } }[ward];
                return {
                    id: 'bed' + (i + 1),
                    wardId: ward,
                    bedNumber: wardInfo.name + '-' + String((i % wardInfo.cap) + 1).padStart(2, '0'),
                    status: ['available', 'occupied', 'maintenance', 'reserved'][Math.floor(Math.random() * 4)],
                    patientId: Math.random() > 0.5 ? 'p' + (Math.floor(Math.random() * 50) + 1) : null,
                    bedType: ['Standard', 'Electric', 'ICU', 'Pediatric', 'Maternity'][Math.floor(Math.random() * 5)]
                };
            }),
            insuranceClaims: Array.from({ length: 15 }, (_, i) => ({
                id: 'claim' + (i + 1),
                patientId: 'p' + (Math.floor(Math.random() * 50) + 1),
                provider: ['BlueCross', 'Aetna', 'Cigna', 'UnitedHealth', 'Medicare', 'Medicaid'][Math.floor(Math.random() * 6)],
                claimNumber: 'CLM-' + Math.floor(Math.random() * 1000000),
                serviceDate: new Date(2026, 8, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                amountClaimed: (Math.random() * 5000 + 500).toFixed(2),
                amountApproved: (Math.random() * 4000 + 400).toFixed(2),
                status: ['pending', 'approved', 'partial', 'denied', 'paid'][Math.floor(Math.random() * 5)],
                submissionDate: new Date(2026, 8, Math.floor(Math.random() * 20) + 1).toISOString().split('T')[0],
                processingDate: Math.random() > 0.5 ? new Date(2026, 8, Math.floor(Math.random() * 10) + 20).toISOString().split('T')[0] : null
            }))
        };
