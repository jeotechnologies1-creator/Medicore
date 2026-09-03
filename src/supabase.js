(function () {
    const STORAGE_KEY = 'medicore_supabase_config';
    const appShell = window.__MEDICORE_APP__ || (window.__MEDICORE_APP__ = {});
    const singletonState = appShell.supabase || (appShell.supabase = {
        client: null,
        configKey: null
    });

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
        singletonState.client = null;
        singletonState.configKey = null;
        return normalized;
    };

    const getClient = () => {
        const { url, anonKey } = getConfig();
        if (!url || !anonKey || !window.supabase) return null;

        const configKey = `${url}|${anonKey}`;
        if (!singletonState.client || singletonState.configKey !== configKey) {
            singletonState.client = window.supabase.createClient(url, anonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
            singletonState.configKey = configKey;
        }

        return singletonState.client;
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

    const upsertRows = async (table, rows, onConflict = 'id') => {
        const client = getClient();
        if (!client) {
            return { data: [], error: new Error('Supabase client is not configured.') };
        }

        const payload = Array.isArray(rows) ? rows : [rows];
        const { data, error } = await client.from(table).upsert(payload, { onConflict }).select();
        return { data: data || [], error };
    };

    const saveSystemSettings = async (settings, roleMatrix = []) => {
        const client = getClient();
        if (!client) {
            return { data: null, error: new Error('Supabase client is not configured.') };
        }

        const normalizedSettings = { ...(settings || {}) };
        if (Array.isArray(roleMatrix) && roleMatrix.length) {
            normalizedSettings.roleMatrix = roleMatrix;
        } else if (Array.isArray(normalizedSettings.roleMatrix)) {
            normalizedSettings.roleMatrix = normalizedSettings.roleMatrix;
        }

        const payload = {
            setting_key: 'hospital_core_settings',
            setting_value: normalizedSettings,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await client.from('system_settings').upsert(payload, { onConflict: 'setting_key' }).select();
        return { data: data?.[0] || null, error };
    };

    const loadSystemSettings = async () => {
        const client = getClient();
        if (!client) {
            return {};
        }

        const { data, error } = await client.from('system_settings').select('*').eq('setting_key', 'hospital_core_settings').maybeSingle();
        if (error || !data) {
            return {};
        }

        const value = data.setting_value || {};
        return (value && typeof value === 'object') ? value : {};
    };

    const saveDepartments = async (departments) => {
        const client = getClient();
        if (!client) {
            return { data: [], error: new Error('Supabase client is not configured.') };
        }

        const rows = (departments || []).map((dept) => ({
            id: dept.id,
            name: dept.name,
            specialty: dept.type || dept.specialty || 'Ward',
            capacity: Number(dept.capacity || 0),
            occupied: Number(dept.occupied || 0),
            status: dept.status || 'active'
        }));

        const { data, error } = await client.from('wards').upsert(rows, { onConflict: 'id' }).select();
        return { data: data || [], error };
    };

    const loadDepartments = async () => {
        const client = getClient();
        if (!client) {
            return [];
        }

        const { data, error } = await client.from('wards').select('*').order('name');
        if (error || !data) {
            return [];
        }

        return data.map((row) => ({
            id: row.id,
            name: row.name,
            type: row.specialty || 'Ward',
            specialty: row.specialty || 'Ward',
            capacity: Number(row.capacity || 0),
            occupied: Number(row.occupied || 0),
            status: row.status || 'active'
        }));
    };

    const recordComplianceExport = async (exportType, fileName, rowCount, metadata = {}) => {
        const client = getClient();
        if (!client) {
            return { data: null, error: new Error('Supabase client is not configured.') };
        }

        const payload = {
            export_type: exportType,
            file_name: fileName,
            record_count: Number(rowCount || 0),
            metadata: metadata,
            exported_at: new Date().toISOString()
        };

        const { data, error } = await client.from('compliance_exports').insert(payload).select();
        return { data: data?.[0] || null, error };
    };

    const loadComplianceExports = async () => {
        const client = getClient();
        if (!client) {
            return [];
        }

        const { data, error } = await client.from('compliance_exports').select('*').order('exported_at', { ascending: false }).limit(10);
        if (error || !data) {
            return [];
        }

        return data.map((row) => ({
            id: row.id,
            exportType: row.export_type,
            fileName: row.file_name,
            recordCount: row.record_count,
            exportedAt: row.exported_at,
            metadata: row.metadata || {}
        }));
    };

    const loginProfile = async (email, password) => {
        const client = getClient();
        if (!client) {
            return null;
        }
        const normalizedEmail = email.trim().toLowerCase() === 'admin' ? 'admin@medicore.local' : email.trim();
        const { data: authData, error: authError } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
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
        upsertRows,
        saveSystemSettings,
        loadSystemSettings,
        saveDepartments,
        loadDepartments,
        recordComplianceExport,
        loadComplianceExports,
        loginProfile,
        logout,
        getStore,
        saveStore
    };
})();
