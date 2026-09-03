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
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
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
        const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
        if (authError || !authData.user) return null;
        const { data, error } = await client.from('profiles').select('*').eq('auth_user_id', authData.user.id).maybeSingle();
        if (!error && data) return { ...data, name: data.full_name || data.name || data.email, role: data.role || 'super_admin' };
        await client.auth.signOut();
        return null;
    };

    const logout = async () => {
        const client = getClient();
        if (client) await client.auth.signOut();
    };

    window.MedicoreSupabase = {
        getConfig,
        setConfig,
        getClient,
        readRows,
        insertRow,
        updateRow,
        loginProfile,
        logout,
        getStore,
        saveStore
    };
})();
