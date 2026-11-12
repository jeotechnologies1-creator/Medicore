const allowedModules = new Set(['app','auth','dashboard','patients','records','appointments','clinical','laboratory','radiology','pharmacy','billing','admissions','portal','settings','other']);
const allowedErrorClasses = new Set(['Error','TypeError','RangeError','ReferenceError','NetworkError','UnknownError']);

const sendSafeEvent = (eventType, errorClass, moduleName = 'other') => {
    const config = globalThis.OneMedSupabase?.getConfig?.();
    if (!config?.url || !config?.anonKey) return;
    const endpoint = `${config.url.replace(/\/$/, '')}/functions/v1/monitoring`;
    const event = {
        event_type: eventType,
        error_class: allowedErrorClasses.has(errorClass) ? errorClass : 'UnknownError',
        module: allowedModules.has(moduleName) ? moduleName : 'other',
        environment: import.meta.env.MODE === 'production' ? 'production' : import.meta.env.MODE === 'development' ? 'development' : 'other'
    };
    fetch(endpoint, { method: 'POST', headers: { apikey: config.anonKey, 'content-type': 'application/json' }, body: JSON.stringify(event), keepalive: true }).catch(() => {});
};

const reportSafeClientError = (error, moduleName = 'other') => sendSafeEvent('client_error', error?.name, moduleName);
const reportSafeAuthAnomaly = () => sendSafeEvent('auth_anomaly', 'UnknownError', 'auth');

window.OneMedMonitor = { reportSafeClientError, reportSafeAuthAnomaly };
window.addEventListener('error', (event) => reportSafeClientError(event.error, 'app'));
window.addEventListener('unhandledrejection', () => reportSafeClientError(null, 'app'));
