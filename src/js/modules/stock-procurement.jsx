const StockProcurementModule = ({ initialView = 'stock' }) => {
    const { user } = useAuth();
    const client = window.OneMedSupabase?.getClient?.();
    const [facilityOptions, setFacilityOptions] = useState([]);
    const [facilityId, setFacilityId] = useState(user?.facility_id || user?.facilityId || '');
    const [view, setView] = useState(initialView);
    const [locations, setLocations] = useState([]);
    const [items, setItems] = useState([]);
    const [balances, setBalances] = useState([]);
    const [movements, setMovements] = useState([]);
    const [lots, setLots] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [tiers, setTiers] = useState([]);
    const [orders, setOrders] = useState([]);
    const [orderItems, setOrderItems] = useState([]);
    const [approvals, setApprovals] = useState([]);
    const [receipts, setReceipts] = useState([]);
    const [receiptItems, setReceiptItems] = useState([]);
    const [returns, setReturns] = useState([]);
    const [performance, setPerformance] = useState([]);
    const [formulary, setFormulary] = useState([]);
    const [formularySearch, setFormularySearch] = useState('');
    const [formularyLoading, setFormularyLoading] = useState(true);
    const [formularyError, setFormularyError] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [locationDraft, setLocationDraft] = useState({ code: '', name: '' });
    const [itemDraft, setItemDraft] = useState({ code: '', name: '', unit: '' });
    const [movementDraft, setMovementDraft] = useState({ item: '', type: 'receipt', quantity: '', direction: 'in', source: '', destination: '', reason: '', reference: '' });
    const [pharmacyDraft, setPharmacyDraft] = useState({ formulary: '', name: '', category: '', quantity: '', reorder: '0', price: '', expiry: '', batch: '', barcode: '', nafdacRegistrationNumber: '', supplier: '', location: '' });
    const [supplierDraft, setSupplierDraft] = useState({ name: '', contact: '' });
    const [tierDraft, setTierDraft] = useState({ minimum: '0', maximum: '', approvals: '1', role: 'accountant' });
    const [poDraft, setPoDraft] = useState({ supplier: '', number: '', item: '', quantity: '', cost: '' });
    const [decisionNotes, setDecisionNotes] = useState({});
    const [receiptDrafts, setReceiptDrafts] = useState({});
    const [returnDraft, setReturnDraft] = useState({ supplier: '', reference: '', reason: '', line: '', quantity: '' });
    const [performanceDraft, setPerformanceDraft] = useState({ supplier: '', order: '', delivery: '', quality: '', notes: '' });

    const role = user?.role;
    const canStock = ['super_admin', 'pharmacist'].includes(role);
    const canReadStock = canStock || role === 'records_officer' || role === 'accountant';
    const canProcure = ['super_admin', 'accountant'].includes(role);
    const globalAdmin = role === 'super_admin';
    const activeView = canStock || canReadStock ? view : 'procurement';

    useEffect(() => setView(initialView), [initialView]);
    useEffect(() => {
        if (!client || !globalAdmin) return;
        client.from('facilities').select('id,code,name').order('name').then(({ data, error: loadError }) => {
            if (!loadError && data) {
                setFacilityOptions(data);
                setFacilityId((current) => current || data[0]?.id || '');
            }
        });
    }, [client, globalAdmin]);
    const loadFormulary = useCallback(async () => {
        if (!client) { setFormularyLoading(false); setFormularyError('Supabase is unavailable.'); return; }
        setFormularyLoading(true);
        const { data, error: loadError } = await client.from('formulary_items')
            .select('id,generic_name,form,strength,route').eq('active', true).order('generic_name');
        if (loadError) {
            setFormulary([]);
            setFormularyError(loadError.message || 'Approved formulary items could not be loaded.');
        } else {
            setFormulary(data || []);
            setFormularyError('');
        }
        setFormularyLoading(false);
    }, [client]);
    useEffect(() => { loadFormulary(); }, [loadFormulary]);

    const visibleFormulary = formulary.filter((entry) => {
        const search = formularySearch.trim().toLowerCase();
        return !search || [entry.generic_name, entry.form, entry.strength, entry.route].some((value) => String(value || '').toLowerCase().includes(search));
    });

    const refresh = useCallback(async () => {
        if (!client || !facilityId) { setError('Select an active facility to view its stock and procurement records.'); return; }
        const requests = [];
        if (canReadStock) requests.push(
            client.from('store_locations').select('*').eq('facility_id', facilityId).order('location_name'),
            client.from('store_stock_items').select('*').eq('facility_id', facilityId).order('item_name'),
            client.from('stock_balances').select('*').eq('facility_id', facilityId).order('location_id'),
            (async () => {
                const all = []; let from = 0; const pageSize = 1000;
                while (true) {
                    const { data, error: movementError } = await client.from('stock_movements').select('*').eq('facility_id', facilityId).order('created_at').range(from, from + pageSize - 1);
                    if (movementError) return { data: null, error: movementError };
                    all.push(...(data || []));
                    if ((data || []).length < pageSize) break;
                    from += pageSize;
                }
                return { data: all, error: null };
            })(),
            canStock ? client.from('pharmacy_inventory').select('*').eq('facility_id', facilityId).order('name') : Promise.resolve({ data: [], error: null })
        );
        if (canProcure) requests.push(
            client.from('suppliers').select('*').eq('facility_id', facilityId).order('supplier_name'),
            client.from('purchase_approval_tiers').select('*').eq('facility_id', facilityId).order('minimum_amount'),
            client.from('purchase_orders').select('*').eq('facility_id', facilityId).order('created_at', { ascending: false }),
            client.from('supplier_returns').select('*').eq('facility_id', facilityId).order('recorded_at', { ascending: false }),
            client.from('supplier_performance_records').select('*').eq('facility_id', facilityId).order('recorded_at', { ascending: false }),
            client.from('goods_received_notes').select('*').eq('facility_id', facilityId).order('received_at', { ascending: false }),
            client.from('purchase_order_approvals').select('*'),
            client.from('goods_received_note_items').select('*'),
            client.from('purchase_order_items').select('*')
        );
        const results = await Promise.all(requests);
        const failed = results.find((result) => result.error);
        if (failed) { setError(failed.error.message || 'Stock or procurement records could not be loaded.'); return; }
        let i = 0;
        if (canReadStock) {
            const nextLocations = results[i++].data || [];
            const nextItems = results[i++].data || [];
            setLocations(nextLocations); setItems(nextItems); setBalances(results[i++].data || []); setMovements(results[i++].data || []); setLots(results[i++].data || []);
        }
        if (canProcure) {
            setSuppliers(results[i++].data || []); setTiers(results[i++].data || []); setOrders(results[i++].data || []); setReturns(results[i++].data || []); setPerformance(results[i++].data || []); setReceipts(results[i++].data || []); setApprovals(results[i++].data || []); setReceiptItems(results[i++].data || []); setOrderItems(results[i++].data || []);
        }
        setError('');
    }, [client, facilityId, canReadStock, canProcure]);
    useEffect(() => { refresh(); }, [refresh]);

    const failText = (message) => {
        if (/insufficient stock|negative balances are prohibited/i.test(message || '')) return `Not enough stock is available for this movement. No stock was issued; ${message}`;
        if (/could not serialize|deadlock|lock timeout|concurrent/i.test(message || '')) return `Another stock transaction completed at the same time. Refresh balances and retry: ${message}`;
        return message || 'The request could not be completed.';
    };
    const rpc = async (name, args, success) => {
        if (!client) { setError('Database connection is unavailable.'); return null; }
        setBusy(true); setError(''); setNotice('');
        const { data, error: rpcError } = await client.rpc(name, args);
        setBusy(false);
        if (rpcError) { setError(failText(rpcError.message)); return null; }
        setNotice(success); await refresh(); return data;
    };
    const createLocation = async (event) => {
        event.preventDefault();
        const result = await rpc('create_store_location', { p_facility_id: facilityId, p_code: locationDraft.code, p_name: locationDraft.name }, 'Store location created.');
        if (result) setLocationDraft({ code: '', name: '' });
    };
    const createItem = async (event) => {
        event.preventDefault();
        const result = await rpc('create_store_stock_item', { p_facility_id: facilityId, p_code: itemDraft.code, p_name: itemDraft.name, p_unit: itemDraft.unit }, 'Stock item created.');
        if (result) setItemDraft({ code: '', name: '', unit: '' });
    };
    const recordMovement = async (event) => {
        event.preventDefault();
        const isTransfer = movementDraft.type === 'transfer';
        await rpc('record_store_item_movement', {
            p_stock_item_id: movementDraft.item, p_movement_type: movementDraft.type, p_quantity: Number(movementDraft.quantity),
            p_direction: isTransfer ? null : movementDraft.direction, p_source_location_id: movementDraft.source || null,
            p_destination_location_id: movementDraft.destination || null, p_reason: movementDraft.reason, p_reference: movementDraft.reference || null
        }, 'Stock movement posted to the append-only ledger.');
    };
    const addPharmacyLot = async (event) => {
        event.preventDefault(); setBusy(true); setError(''); setNotice('');
        const chosen = formulary.find((entry) => entry.id === pharmacyDraft.formulary);
        if (!chosen) { setBusy(false); setError('Select an active formulary item.'); return; }
        const { data: lot, error: insertError } = await client.from('pharmacy_inventory').insert({
            facility_id: facilityId, formulary_item_id: chosen.id, name: pharmacyDraft.name || chosen.generic_name,
            generic_name: chosen.generic_name, category: pharmacyDraft.category || null, stock_quantity: 0,
            reorder_level: Number(pharmacyDraft.reorder || 0), unit_price: Number(pharmacyDraft.price || 0),
            expiry_date: pharmacyDraft.expiry || null, batch_number: pharmacyDraft.batch || null,
            barcode: pharmacyDraft.barcode || null,
            nafdac_registration_number: pharmacyDraft.nafdacRegistrationNumber.trim() || null,
            supplier: pharmacyDraft.supplier || null, status: 'low_stock'
        }).select('id').single();
        if (insertError || !lot) { setBusy(false); setError(failText(insertError?.message)); return; }
        const { data: movementId, error: movementError } = await client.rpc('record_store_stock_movement', {
            p_inventory_lot_id: lot.id, p_movement_type: 'receipt', p_quantity: Number(pharmacyDraft.quantity),
            p_direction: 'in', p_source_location_id: null, p_destination_location_id: pharmacyDraft.location,
            p_reason: 'Initial pharmacy stock received into the store ledger', p_reference: pharmacyDraft.batch || null
        });
        setBusy(false);
        if (movementError || !movementId) { setError(failText(movementError?.message || 'No ledger movement was recorded. The zero-balance lot remains available for reconciliation.')); return; }
        setNotice('Pharmacy lot created and opening receipt recorded in the stock ledger.');
        setPharmacyDraft({ formulary: '', name: '', category: '', quantity: '', reorder: '0', price: '', expiry: '', batch: '', barcode: '', nafdacRegistrationNumber: '', supplier: '', location: '' });
        await refresh();
    };
    const addSupplier = async (event) => {
        event.preventDefault();
        let contactDetails = {};
        if (supplierDraft.contact.trim()) { try { contactDetails = JSON.parse(supplierDraft.contact); } catch { setError('Supplier contact details must be valid JSON.'); return; } }
        const result = await rpc('create_procurement_supplier', { p_facility_id: facilityId, p_name: supplierDraft.name, p_contact_details: contactDetails }, 'Supplier created.');
        if (result) setSupplierDraft({ name: '', contact: '' });
    };
    const addTier = async (event) => {
        event.preventDefault();
        const result = await rpc('configure_purchase_approval_tier', { p_facility_id: facilityId, p_minimum: Number(tierDraft.minimum), p_maximum: tierDraft.maximum ? Number(tierDraft.maximum) : null, p_approvals: Number(tierDraft.approvals), p_approver_role: tierDraft.role }, 'Purchase approval tier configured.');
        if (result) setTierDraft({ minimum: '0', maximum: '', approvals: '1', role: 'accountant' });
    };
    const submitOrder = async (event) => {
        event.preventDefault();
        const result = await rpc('submit_purchase_order', { p_facility_id: facilityId, p_supplier_id: poDraft.supplier, p_order_number: poDraft.number, p_items: [{ stock_item_id: poDraft.item, quantity: Number(poDraft.quantity), unit_cost: Number(poDraft.cost) }] }, 'Purchase order submitted for approval.');
        if (result) setPoDraft({ supplier: '', number: '', item: '', quantity: '', cost: '' });
    };
    const decideOrder = async (order, decision) => {
        await rpc('approve_purchase_order', { p_order_id: order.id, p_decision: decision, p_note: decisionNotes[order.id] || null }, decision === 'approved' ? 'Purchase approval recorded.' : 'Purchase order rejected.');
    };
    const receiveOrder = async (event, order) => {
        event.preventDefault(); const draft = receiptDrafts[order.id] || {};
        await rpc('receive_purchase_order', { p_order_id: order.id, p_receipt_lines: [{ purchase_order_item_id: draft.item, quantity: Number(draft.quantity), location_id: draft.location }], p_supplier_delivery_reference: draft.reference || null }, 'Goods receipt note recorded. Order status reflects any remaining quantity.');
    };
    const returnGoods = async (event) => {
        event.preventDefault();
        const result = await rpc('return_supplier_goods', { p_supplier_id: returnDraft.supplier, p_return_reference: returnDraft.reference, p_reason: returnDraft.reason, p_return_lines: [{ goods_received_note_item_id: returnDraft.line, quantity: Number(returnDraft.quantity) }] }, 'Supplier return recorded as an outbound stock movement.');
        if (result) setReturnDraft({ supplier: '', reference: '', reason: '', line: '', quantity: '' });
    };
    const recordPerformance = async (event) => {
        event.preventDefault();
        const result = await rpc('record_supplier_performance', { p_supplier_id: performanceDraft.supplier, p_purchase_order_id: performanceDraft.order || null, p_delivery_score: Number(performanceDraft.delivery), p_quality_score: Number(performanceDraft.quality), p_notes: performanceDraft.notes }, 'Supplier performance saved.');
        if (result) setPerformanceDraft({ supplier: '', order: '', delivery: '', quality: '', notes: '' });
    };

    const balanceFor = (itemId, locationId) => balances.find((entry) => entry.stock_item_id === itemId && entry.location_id === locationId)?.quantity || 0;
    const movementNet = (itemId, locationId) => movements.reduce((sum, movement) => {
        if (movement.stock_item_id !== itemId) return sum;
        if (movement.movement_type === 'transfer') return sum + (movement.destination_location_id === locationId ? Number(movement.quantity) : 0) - (movement.source_location_id === locationId ? Number(movement.quantity) : 0);
        return sum + (movement.destination_location_id === locationId ? Number(movement.quantity) : 0) - (movement.source_location_id === locationId ? Number(movement.quantity) : 0);
    }, 0);
    const itemName = (id) => items.find((entry) => entry.id === id)?.item_name || 'Stock item';
    const supplierName = (id) => suppliers.find((entry) => entry.id === id)?.supplier_name || 'Supplier';
    const openOrders = orders.filter((entry) => ['pending_approval', 'approved', 'partially_received'].includes(entry.status));
    const receivedItems = receiptItems.map((line) => ({ ...line, note: receipts.find((row) => row.id === line.goods_received_note_id) })).filter((line) => line.note);

    return <main className="space-y-6 p-6"><section aria-label="Stock ledger and procurement" className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900">{activeView === 'stock' ? 'Stores & Stock Ledger' : 'Procurement & Purchasing'}</h2><p className="mt-1 text-sm text-slate-600">Facility-scoped stock balances are projections of the append-only movement ledger.</p></div>
            {globalAdmin && <label className="text-sm">Facility<select className="mt-1 block rounded border p-2" value={facilityId} onChange={(event) => setFacilityId(event.target.value)}>{facilityOptions.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} · {facility.code}</option>)}</select></label>}
        </header>
        {canStock && canProcure && <nav className="flex gap-2" aria-label="Stock and procurement views"><Button variant={view === 'stock' ? 'primary' : 'secondary'} onClick={() => setView('stock')}>Stores & Stock</Button><Button variant={view === 'procurement' ? 'primary' : 'secondary'} onClick={() => setView('procurement')}>Procurement</Button></nav>}
        {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {activeView === 'stock' && canReadStock && <>
            {canStock && <>
            <div className="grid gap-5 xl:grid-cols-3"><Card title="Create store location"><form className="grid gap-2" onSubmit={createLocation}><label className="text-sm">Location code<input required className="mt-1 w-full rounded border p-2" value={locationDraft.code} onChange={(e) => setLocationDraft({ ...locationDraft, code: e.target.value })} /></label><label className="text-sm">Location name<input required className="mt-1 w-full rounded border p-2" value={locationDraft.name} onChange={(e) => setLocationDraft({ ...locationDraft, name: e.target.value })} /></label><Button type="submit" disabled={busy}>Create location</Button></form></Card>
                <Card title="Create stock item"><form className="grid gap-2" onSubmit={createItem}><label className="text-sm">Item code<input required className="mt-1 w-full rounded border p-2" value={itemDraft.code} onChange={(e) => setItemDraft({ ...itemDraft, code: e.target.value })} /></label><label className="text-sm">Item name<input required className="mt-1 w-full rounded border p-2" value={itemDraft.name} onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })} /></label><label className="text-sm">Unit<input required className="mt-1 w-full rounded border p-2" value={itemDraft.unit} onChange={(e) => setItemDraft({ ...itemDraft, unit: e.target.value })} placeholder="tablet, box, pack" /></label><Button type="submit" disabled={busy}>Create item</Button></form></Card>
                <Card title="Record stock movement" subtitle="Issues and transfers are rejected when available stock is insufficient.">
                    <form className="grid gap-2" onSubmit={recordMovement}>
                        <label className="text-sm">Stock item<select required className="mt-1 w-full rounded border p-2" value={movementDraft.item} onChange={(e) => setMovementDraft({ ...movementDraft, item: e.target.value })}><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.item_name} · {item.item_code}</option>)}</select></label>
                        <label className="text-sm">Movement type<select className="mt-1 w-full rounded border p-2" value={movementDraft.type} onChange={(e) => setMovementDraft({ ...movementDraft, type: e.target.value, direction: e.target.value === 'issue' ? 'out' : e.target.value === 'transfer' ? '' : 'in', source: '', destination: '' })}>{['receipt', 'issue', 'transfer', 'adjustment', 'return'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                        {movementDraft.type !== 'transfer' && <label className="text-sm">Direction<select className="mt-1 w-full rounded border p-2" value={movementDraft.direction} onChange={(e) => setMovementDraft({ ...movementDraft, direction: e.target.value, source: e.target.value === 'in' ? '' : movementDraft.source, destination: e.target.value === 'out' ? '' : movementDraft.destination })}><option value="in">Into stock</option><option value="out">Out of stock</option></select></label>}
                        <label className="text-sm">Quantity<input required type="number" min="1" step="1" className="mt-1 w-full rounded border p-2" value={movementDraft.quantity} onChange={(e) => setMovementDraft({ ...movementDraft, quantity: e.target.value })} /></label>
                        {(movementDraft.type === 'transfer' || movementDraft.direction === 'out') && <label className="text-sm">Source location<select required className="mt-1 w-full rounded border p-2" value={movementDraft.source} onChange={(e) => setMovementDraft({ ...movementDraft, source: e.target.value })}><option value="">Select source</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label>}
                        {(movementDraft.type === 'transfer' || movementDraft.direction === 'in') && <label className="text-sm">Destination location<select required className="mt-1 w-full rounded border p-2" value={movementDraft.destination} onChange={(e) => setMovementDraft({ ...movementDraft, destination: e.target.value })}><option value="">Select destination</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label>}
                        <label className="text-sm">Reason<input required className="mt-1 w-full rounded border p-2" value={movementDraft.reason} onChange={(e) => setMovementDraft({ ...movementDraft, reason: e.target.value })} /></label>
                        <label className="text-sm">Reference<input className="mt-1 w-full rounded border p-2" value={movementDraft.reference} onChange={(e) => setMovementDraft({ ...movementDraft, reference: e.target.value })} /></label>
                        <Button type="submit" disabled={busy}>Post movement</Button>
                    </form>
                </Card></div>
            <Card title="Receive pharmacy lot into ledger" subtitle="New pharmacy stock is created at zero; the opening quantity is added as a receipt movement. Select a product from the active approved formulary.">
                <form className="grid gap-3 md:grid-cols-3" onSubmit={addPharmacyLot}>
                    <label className="text-sm">Search generic name<input type="search" className="mt-1 w-full rounded border p-2" value={formularySearch} onChange={(event) => { setFormularySearch(event.target.value); setPharmacyDraft((current) => ({ ...current, formulary: '', name: '' })); }} placeholder="Type a generic name, strength, or form" aria-label="Search approved formulary" /></label>
                    <label className="text-sm">Approved formulary item<select required className="mt-1 w-full rounded border p-2" value={pharmacyDraft.formulary} onChange={(e) => { const selected = formulary.find((entry) => entry.id === e.target.value); setPharmacyDraft({ ...pharmacyDraft, formulary: e.target.value, name: selected?.generic_name || '' }); }}><option value="">{formularyLoading ? 'Loading approved medicines…' : visibleFormulary.length ? 'Choose a medicine' : 'No matching medicines'}</option>{visibleFormulary.map((entry) => <option key={entry.id} value={entry.id}>{entry.generic_name} · {entry.strength} {entry.form}{entry.route ? ` · ${entry.route}` : ''}</option>)}</select>{formularyError && <span className="mt-1 block text-xs text-red-700" role="alert">{formularyError} <button type="button" className="underline" onClick={loadFormulary}>Retry</button></span>}{!formularyLoading && !formularyError && formulary.length === 0 && <span className="mt-1 block text-xs text-amber-800">No active formulary medicines are configured. Load the facility-approved licensed formulary before receiving stock.</span>}{!formularyLoading && formulary.length > 0 && !visibleFormulary.length && <span className="mt-1 block text-xs text-slate-600">No approved medicine matches that search.</span>}</label>
                    <label className="text-sm">Lot name<input required className="mt-1 w-full rounded border p-2" value={pharmacyDraft.name} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, name: e.target.value })} /></label>
                    <label className="text-sm">Category<input className="mt-1 w-full rounded border p-2" value={pharmacyDraft.category} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, category: e.target.value })} /></label>
                    <label className="text-sm">Opening quantity<input required type="number" min="1" step="1" className="mt-1 w-full rounded border p-2" value={pharmacyDraft.quantity} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, quantity: e.target.value })} /></label>
                    <label className="text-sm">Reorder level<input type="number" min="0" step="1" className="mt-1 w-full rounded border p-2" value={pharmacyDraft.reorder} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, reorder: e.target.value })} /></label>
                    <label className="text-sm">Unit price (NGN)<input type="number" min="0" step="0.01" className="mt-1 w-full rounded border p-2" value={pharmacyDraft.price} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, price: e.target.value })} /></label>
                    <label className="text-sm">Expiry date<input type="date" className="mt-1 w-full rounded border p-2" value={pharmacyDraft.expiry} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, expiry: e.target.value })} /></label>
                    <label className="text-sm">Batch / lot reference<input className="mt-1 w-full rounded border p-2" value={pharmacyDraft.batch} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, batch: e.target.value })} /></label>
                    <label className="text-sm">Barcode<input className="mt-1 w-full rounded border p-2" value={pharmacyDraft.barcode} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, barcode: e.target.value })} /></label>
                    <label className="text-sm">NAFDAC registration number<input className="mt-1 w-full rounded border p-2" value={pharmacyDraft.nafdacRegistrationNumber} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, nafdacRegistrationNumber: e.target.value })} maxLength={80} autoComplete="off" placeholder="As printed on the product pack" /><span className="mt-1 block text-xs text-slate-500">Enter the code from this product lot. OneMed stores it but does not verify it with NAFDAC.</span></label>
                    <label className="text-sm">Supplier<input className="mt-1 w-full rounded border p-2" value={pharmacyDraft.supplier} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, supplier: e.target.value })} /></label>
                    <label className="text-sm">Destination location<select required className="mt-1 w-full rounded border p-2" value={pharmacyDraft.location} onChange={(e) => setPharmacyDraft({ ...pharmacyDraft, location: e.target.value })}><option value="">Select location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label>
                    <div className="flex items-end"><Button type="submit" disabled={busy || !locations.length}>Create lot & post receipt</Button></div>
                </form>
            </Card></>}
            <Card title="Balances reconciled to movement history" subtitle="Current quantity is compared with the full movement history."><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Item</th><th className="p-2">Location</th><th className="p-2">Ledger balance</th><th className="p-2">Movement total</th><th className="p-2">Check</th></tr></thead><tbody>{balances.length ? balances.map((balance) => { const net = movementNet(balance.stock_item_id, balance.location_id); const matches = Math.abs(net - Number(balance.quantity)) < 0.001; return <tr key={`${balance.stock_item_id}:${balance.location_id}`} className="border-t"><td className="p-2">{itemName(balance.stock_item_id)}</td><td className="p-2">{locations.find((entry) => entry.id === balance.location_id)?.location_name || 'Store'}</td><td className="p-2">{Number(balance.quantity)}</td><td className="p-2">{net}</td><td className="p-2"><Badge variant={matches ? 'success' : 'danger'}>{matches ? 'Reconciled' : 'Review'}</Badge></td></tr>; }) : <tr><td colSpan="5" className="p-3 text-slate-500">No stock balances yet. Record a receipt or opening adjustment to start the ledger.</td></tr>}</tbody></table></div></Card>
            <Card title="Append-only movement history" subtitle={`Showing ${Math.min(250, movements.length)} newest movements; all rows are included in reconciliation.`}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Date</th><th className="p-2">Item</th><th className="p-2">Type</th><th className="p-2">Quantity</th><th className="p-2">From / to</th><th className="p-2">Reason / reference</th></tr></thead><tbody>{movements.slice(-250).reverse().map((row) => <tr key={row.id} className="border-t"><td className="p-2">{formatDateTime(row.created_at)}</td><td className="p-2">{itemName(row.stock_item_id)}</td><td className="p-2">{row.movement_type}</td><td className="p-2">{row.direction === 'out' ? '−' : row.direction === 'in' ? '+' : '↔'}{row.quantity}</td><td className="p-2">{locations.find((entry) => entry.id === row.source_location_id)?.location_name || '—'} → {locations.find((entry) => entry.id === row.destination_location_id)?.location_name || '—'}</td><td className="p-2">{row.reason}{row.reference ? ` · ${row.reference}` : ''}</td></tr>)}{!movements.length && <tr><td colSpan="6" className="p-3 text-slate-500">No movements have been recorded.</td></tr>}</tbody></table></div></Card>
        </>}
        {activeView === 'procurement' && canProcure && <>
            <div className="grid gap-5 xl:grid-cols-2"><Card title="Configure approval tier" subtitle="Tiers must cover submitted totals and may not overlap."><form className="grid gap-2 md:grid-cols-2" onSubmit={addTier}><label className="text-sm">Minimum amount (NGN)<input required type="number" min="0" step="0.01" className="mt-1 w-full rounded border p-2" value={tierDraft.minimum} onChange={(e) => setTierDraft({ ...tierDraft, minimum: e.target.value })} /></label><label className="text-sm">Maximum (exclusive; blank = no limit)<input type="number" min="0" step="0.01" className="mt-1 w-full rounded border p-2" value={tierDraft.maximum} onChange={(e) => setTierDraft({ ...tierDraft, maximum: e.target.value })} /></label><label className="text-sm">Approvals required<input required type="number" min="1" step="1" className="mt-1 w-full rounded border p-2" value={tierDraft.approvals} onChange={(e) => setTierDraft({ ...tierDraft, approvals: e.target.value })} /></label><label className="text-sm">Approver role<input required className="mt-1 w-full rounded border p-2" value={tierDraft.role} onChange={(e) => setTierDraft({ ...tierDraft, role: e.target.value })} /></label><Button type="submit" disabled={busy}>Save approval tier</Button></form><div className="mt-3 text-sm">{tiers.map((tier) => <p key={tier.id}>{formatCurrency(tier.minimum_amount)} – {tier.maximum_amount == null ? 'no limit' : formatCurrency(tier.maximum_amount)} · {tier.approvals_required} approval(s) · {tier.approver_role}</p>)}</div></Card>
                <Card title="Suppliers"><form className="grid gap-2" onSubmit={addSupplier}><label className="text-sm">Supplier name<input required className="mt-1 w-full rounded border p-2" value={supplierDraft.name} onChange={(e) => setSupplierDraft({ ...supplierDraft, name: e.target.value })} /></label><label className="text-sm">Contact details (JSON, optional)<textarea className="mt-1 w-full rounded border p-2" value={supplierDraft.contact} onChange={(e) => setSupplierDraft({ ...supplierDraft, contact: e.target.value })} placeholder='{"email":"supplier@example.org"}' /></label><Button type="submit" disabled={busy}>Create supplier</Button></form><div className="mt-3 text-sm">{suppliers.length ? suppliers.map((supplier) => <p key={supplier.id}>{supplier.supplier_name}</p>) : <p className="text-slate-500">No suppliers have been configured.</p>}</div></Card></div>
            <Card title="Create purchase order"><form className="grid gap-2 md:grid-cols-3" onSubmit={submitOrder}><label className="text-sm">Supplier<select required className="mt-1 w-full rounded border p-2" value={poDraft.supplier} onChange={(e) => setPoDraft({ ...poDraft, supplier: e.target.value })}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label><label className="text-sm">Order number<input required className="mt-1 w-full rounded border p-2" value={poDraft.number} onChange={(e) => setPoDraft({ ...poDraft, number: e.target.value })} /></label><label className="text-sm">Item<select required className="mt-1 w-full rounded border p-2" value={poDraft.item} onChange={(e) => setPoDraft({ ...poDraft, item: e.target.value })}><option value="">Select stock item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}</select></label><label className="text-sm">Quantity<input required type="number" min="1" step="1" className="mt-1 w-full rounded border p-2" value={poDraft.quantity} onChange={(e) => setPoDraft({ ...poDraft, quantity: e.target.value })} /></label><label className="text-sm">Unit cost (NGN)<input required type="number" min="0" step="0.01" className="mt-1 w-full rounded border p-2" value={poDraft.cost} onChange={(e) => setPoDraft({ ...poDraft, cost: e.target.value })} /></label><div className="flex items-end"><Button type="submit" disabled={busy || !tiers.length}>Submit purchase order</Button></div></form>{!tiers.length && <p className="mt-2 text-sm text-amber-800">Configure an approval tier before submitting orders.</p>}</Card>
            <Card title="Purchase orders, approval and partial receipts"><div className="space-y-4">{orders.length ? orders.map((order) => { const lines = orderItems.filter((line) => line.purchase_order_id === order.id); const orderApprovals = approvals.filter((entry) => entry.purchase_order_id === order.id); const receivedCount = receipts.filter((entry) => entry.purchase_order_id === order.id).length; return <article key={order.id} className="rounded border p-4" data-testid="purchase-order-row"><div className="flex flex-wrap justify-between gap-2"><div><strong>{order.order_number}</strong> · {supplierName(order.supplier_id)} · {formatCurrency(order.total_amount)}</div><Badge>{order.status}</Badge></div><ul className="my-2 list-inside list-disc text-sm">{lines.map((line) => <li key={line.id}>{itemName(line.stock_item_id)} — {line.quantity_ordered} @ {formatCurrency(line.unit_cost)}</li>)}</ul><p className="text-xs text-slate-600">Approval decisions: {orderApprovals.length}; goods-received notes: {receivedCount}</p>{order.status === 'pending_approval' && <div className="mt-2 flex gap-2"><label className="sr-only" htmlFor={`approval-note-${order.id}`}>Approval note</label><input id={`approval-note-${order.id}`} className="rounded border p-2 text-sm" placeholder="Decision note" value={decisionNotes[order.id] || ''} onChange={(e) => setDecisionNotes({ ...decisionNotes, [order.id]: e.target.value })} /><Button disabled={busy} onClick={() => decideOrder(order, 'approved')}>Approve</Button><Button variant="danger" disabled={busy} onClick={() => decideOrder(order, 'rejected')}>Reject</Button></div>}{['approved', 'partially_received'].includes(order.status) && <form className="mt-3 grid gap-2 md:grid-cols-4" onSubmit={(e) => receiveOrder(e, order)}><label className="text-sm">Order line<select required className="mt-1 w-full rounded border p-2" value={receiptDrafts[order.id]?.item || ''} onChange={(e) => setReceiptDrafts({ ...receiptDrafts, [order.id]: { ...receiptDrafts[order.id], item: e.target.value } })}><option value="">Select line</option>{lines.map((line) => <option key={line.id} value={line.id}>{itemName(line.stock_item_id)} · ordered {line.quantity_ordered}</option>)}</select></label><label className="text-sm">Quantity received<input required type="number" min="1" step="1" className="mt-1 w-full rounded border p-2" value={receiptDrafts[order.id]?.quantity || ''} onChange={(e) => setReceiptDrafts({ ...receiptDrafts, [order.id]: { ...receiptDrafts[order.id], quantity: e.target.value } })} /></label><label className="text-sm">Destination location<select required className="mt-1 w-full rounded border p-2" value={receiptDrafts[order.id]?.location || ''} onChange={(e) => setReceiptDrafts({ ...receiptDrafts, [order.id]: { ...receiptDrafts[order.id], location: e.target.value } })}><option value="">Select location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label><label className="text-sm">Delivery reference<input className="mt-1 w-full rounded border p-2" value={receiptDrafts[order.id]?.reference || ''} onChange={(e) => setReceiptDrafts({ ...receiptDrafts, [order.id]: { ...receiptDrafts[order.id], reference: e.target.value } })} /></label><Button type="submit" disabled={busy}>Record partial / full receipt</Button></form>}</article>; }) : <p className="text-sm text-slate-500">No purchase orders yet.</p>}</div></Card>
            <div className="grid gap-5 xl:grid-cols-2"><Card title="Return goods to supplier"><form className="grid gap-2" onSubmit={returnGoods}><label className="text-sm">Supplier<select required className="mt-1 w-full rounded border p-2" value={returnDraft.supplier} onChange={(e) => setReturnDraft({ ...returnDraft, supplier: e.target.value, line: '' })}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label><label className="text-sm">Received goods line<select required className="mt-1 w-full rounded border p-2" value={returnDraft.line} onChange={(e) => setReturnDraft({ ...returnDraft, line: e.target.value })}><option value="">Select receipt line</option>{receivedItems.filter((line) => orders.find((order) => order.id === line.note.purchase_order_id)?.supplier_id === returnDraft.supplier).map((line) => <option key={line.id} value={line.id}>{line.id} · received {line.quantity_received}</option>)}</select></label><label className="text-sm">Quantity<input required type="number" min="1" step="1" className="mt-1 w-full rounded border p-2" value={returnDraft.quantity} onChange={(e) => setReturnDraft({ ...returnDraft, quantity: e.target.value })} /></label><label className="text-sm">Return reference<input required className="mt-1 w-full rounded border p-2" value={returnDraft.reference} onChange={(e) => setReturnDraft({ ...returnDraft, reference: e.target.value })} /></label><label className="text-sm">Reason<input required className="mt-1 w-full rounded border p-2" value={returnDraft.reason} onChange={(e) => setReturnDraft({ ...returnDraft, reason: e.target.value })} /></label><Button type="submit" disabled={busy}>Record supplier return</Button></form>{returns.map((entry) => <p className="mt-2 text-sm" key={entry.id}>{entry.return_reference} · {supplierName(entry.supplier_id)} · {entry.reason}</p>)}</Card>
                <Card title="Supplier performance"><form className="grid gap-2" onSubmit={recordPerformance}><label className="text-sm">Supplier<select required className="mt-1 w-full rounded border p-2" value={performanceDraft.supplier} onChange={(e) => setPerformanceDraft({ ...performanceDraft, supplier: e.target.value })}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label><label className="text-sm">Purchase order (optional)<select className="mt-1 w-full rounded border p-2" value={performanceDraft.order} onChange={(e) => setPerformanceDraft({ ...performanceDraft, order: e.target.value })}><option value="">No linked order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></label><label className="text-sm">Delivery score (0–100)<input required type="number" min="0" max="100" className="mt-1 w-full rounded border p-2" value={performanceDraft.delivery} onChange={(e) => setPerformanceDraft({ ...performanceDraft, delivery: e.target.value })} /></label><label className="text-sm">Quality score (0–100)<input required type="number" min="0" max="100" className="mt-1 w-full rounded border p-2" value={performanceDraft.quality} onChange={(e) => setPerformanceDraft({ ...performanceDraft, quality: e.target.value })} /></label><label className="text-sm">Evaluation notes<input required className="mt-1 w-full rounded border p-2" value={performanceDraft.notes} onChange={(e) => setPerformanceDraft({ ...performanceDraft, notes: e.target.value })} /></label><Button type="submit" disabled={busy}>Save performance review</Button></form>{performance.map((entry) => <p className="mt-2 text-sm" key={entry.id}>{supplierName(entry.supplier_id)} · delivery {entry.delivery_score} · quality {entry.quality_score}</p>)}</Card></div>
            <Card title="Goods-received notes"><div className="space-y-2">{receipts.length ? receipts.map((note) => <article className="rounded border p-3 text-sm" key={note.id}>GRN {note.id} · {orders.find((order) => order.id === note.purchase_order_id)?.order_number || 'Purchase order'} · {formatDateTime(note.received_at)} · {note.supplier_delivery_reference || 'No delivery reference'}<ul className="list-inside list-disc">{receiptItems.filter((line) => line.goods_received_note_id === note.id).map((line) => <li key={line.id}>{itemName(orderItems.find((orderLine) => orderLine.id === line.purchase_order_item_id)?.stock_item_id)} — {line.quantity_received}</li>)}</ul></article>) : <p className="text-sm text-slate-500">No goods have been received yet.</p>}</div></Card>
        </>}
    </section></main>;
};

export { StockProcurementModule };
