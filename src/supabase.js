(function () {
    const STORAGE_KEY = 'medicore_supabase_config';

    const getConfig = () => {
        const override = window.__MEDICORE_SUPABASE__ || {};
        const saved = (() => {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            } catch (e) {
                return {};
            }
        })();
        return {
            url: override.url || saved.url || '',
            anonKey: override.anonKey || saved.anonKey || ''
        };
    };

    const setConfig = (config = {}) => {
        const normalized = {
            url: config.url || '',
            anonKey: config.anonKey || ''
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        } catch (e) {}
        window.__MEDICORE_SUPABASE__ = normalized;
        return normalized;
    };

    const getClient = () => {
        const { url, anonKey } = getConfig();
        if (!url || !anonKey || !window.supabase) return null;
        return window.supabase.createClient(url, anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
    };

    const getStore = () => ({
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
        wards: [],
        offices: [],
        officeStaff: []
    });

    const saveStore = (data) => {
        if (!data) return;
        try {
            localStorage.setItem('medicore_store', JSON.stringify(data));
        } catch (e) {}
    };

    const readRows = async (table) => {
        const client = getClient();
        if (!client) {
            return { data: [], error: new Error('Supabase client is not configured.') };
        }

        const { data, error } = await client.from(table).select('*');
        if (!error && data) {
            return { data, error: null };
        }

        return { data: [], error };
    };

    const insertRow = async (table, payload) => {
        const client = getClient();
        if (!client) {
            return { data: [], error: new Error('Supabase client is not configured.') };
        }

        const { data, error } = await client.from(table).insert(Array.isArray(payload) ? payload : [payload]).select();
        return { data: data || [], error };
    };

    const updateRow = async (table, id, updates) => {
        const client = getClient();
        if (!client) {
            return { data: [], error: new Error('Supabase client is not configured.') };
        }

        const { data, error } = await client.from(table).update(updates).eq('id', id).select();
        return { data: data || [], error };
    };

    const loginProfile = async (email, password) => {
        const client = getClient();
        if (!client) {
            return null;
        }

        const { data, error } = await client.from('profiles').select('*').eq('email', email).maybeSingle();
        if (!error && data && data.password === password) {
            const safe = { ...data, name: data.full_name || data.name || data.email, role: data.role || 'super_admin' };
            delete safe.password;
            return safe;
        }
        return null;
    };

    window.MedicoreSupabase = {
        getConfig,
        setConfig,
        getClient,
        readRows,
        insertRow,
        updateRow,
        loginProfile,
        getStore,
        saveStore
    };
})();
