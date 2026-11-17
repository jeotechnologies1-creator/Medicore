const initialData = {
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
};

const store = new Proxy(initialData, {
    get(target, property) {
        if (!(property in target)) target[property] = [];
        return target[property];
    },
    set(target, property, value) {
        target[property] = value;
        return true;
    }
});

export const getStoreValue = (key) => store[key];
export const setStoreValue = (key, value) => {
    store[key] = value;
    return value;
};
export const setStoreValues = (values) => Object.assign(store, values);
