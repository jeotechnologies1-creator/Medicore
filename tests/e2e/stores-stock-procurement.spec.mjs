import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/\s/g, '').replace(/=+$/g, '')].map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(); const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_CODING_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_CODING_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  const setup = page.getByRole('button', { name: /set up authenticator/i });
  if (await setup.isVisible().catch(() => false)) {
    await setup.click(); const setupText = await page.getByText(/Manual setup key:/).innerText();
    await page.getByLabel('Authenticator code').fill(totp(setupText.split(':').at(-1).trim()));
    await page.getByRole('button', { name: 'Verify and continue' }).click();
  }
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30000 });
}

async function installFixture(page, seedOrder = false) {
  await page.evaluate(async (shouldSeedOrder) => {
    const authClient = window.OneMedSupabase.getClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    const { data: profile } = await authClient.from('profiles').select('id,facility_id').eq('auth_user_id', authUser.id).single();
    const fixture = {
      actor: profile.id, facility: profile.facility_id || 'a1000000-0000-4000-8000-000000000001', calls: [],
      locations: [], items: [], balances: [], movements: [], lots: [], formulary: [{ id: 'form-1', generic_name: 'Amoxicillin', strength: '250 mg', form: 'capsule' }],
      suppliers: [], tiers: [], orders: [], orderItems: [], approvals: [], receipts: [], receiptItems: [], returns: [], performance: [],
      wards: [], facilities: [{ id: profile.facility_id || 'a1000000-0000-4000-8000-000000000001', code: 'TEST', name: 'Test Facility' }]
    };
    if (shouldSeedOrder) {
      fixture.locations.push({ id: 'loc-1', facility_id: fixture.facility, location_code: 'MAIN', location_name: 'Main Store', active: true });
      fixture.items.push({ id: 'item-1', facility_id: fixture.facility, item_code: 'MED-1', item_name: 'Amoxicillin', unit: 'capsule', active: true });
      fixture.suppliers.push({ id: 'supplier-1', facility_id: fixture.facility, supplier_name: 'North Medical Supply', active: true });
      fixture.tiers.push({ id: 'tier-1', facility_id: fixture.facility, minimum_amount: 0, maximum_amount: null, approvals_required: 1, approver_role: 'accountant' });
      fixture.orders.push({ id: 'order-existing', facility_id: fixture.facility, supplier_id: 'supplier-1', order_number: 'PO-EXISTING', total_amount: 5000, status: 'pending_approval', created_by: 'different-requester' });
      fixture.orderItems.push({ id: 'line-existing', purchase_order_id: 'order-existing', stock_item_id: 'item-1', quantity_ordered: 10, unit_cost: 500 });
      fixture.items.push({ id: 'item-1', facility_id: fixture.facility, item_code: 'MED-1', item_name: 'Amoxicillin', unit: 'capsule', active: true });
    }
    const rows = {
      profiles: [{ id: profile.id, facility_id: fixture.facility }], facilities: fixture.facilities,
      store_locations: fixture.locations, store_stock_items: fixture.items, stock_balances: fixture.balances, stock_movements: fixture.movements,
      pharmacy_inventory: fixture.lots, formulary_items: fixture.formulary, suppliers: fixture.suppliers, purchase_approval_tiers: fixture.tiers,
      purchase_orders: fixture.orders, purchase_order_items: fixture.orderItems, purchase_order_approvals: fixture.approvals,
      goods_received_notes: fixture.receipts, goods_received_note_items: fixture.receiptItems, supplier_returns: fixture.returns,
      supplier_performance_records: fixture.performance
    };
    const client = {
      from(table) {
        let inserted = null; const filters = [];
        const query = {
          select: () => query, order: () => query, limit: () => query, range: () => query,
          eq: (key, value) => { filters.push([key, value]); return query; },
          in: (key, values) => { filters.push([key, values]); return query; },
          insert: (value) => { inserted = value; return query; },
          single: async () => {
            if (table === 'profiles') return { data: { id: profile.id, facility_id: fixture.facility }, error: null };
            if (table === 'pharmacy_inventory') {
              const row = { id: 'lot-1', ...inserted }; fixture.lots.push(row); return { data: row, error: null };
            }
            return { data: null, error: null };
          },
          then(resolve, reject) {
            const data = (rows[table] || []).filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          }
        };
        return query;
      },
      async rpc(name, args) {
        fixture.calls.push({ name, args });
        const error = (message) => ({ data: null, error: { message } });
        if (name === 'create_store_location') { fixture.locations.push({ id: 'loc-1', facility_id: fixture.facility, location_code: args.p_code, location_name: args.p_name, active: true }); return { data: 'loc-1', error: null }; }
        if (name === 'create_store_stock_item') { fixture.items.push({ id: 'item-1', facility_id: fixture.facility, item_code: args.p_code, item_name: args.p_name, unit: args.p_unit, active: true }); return { data: 'item-1', error: null }; }
        if (name === 'record_store_item_movement') {
          const available = fixture.balances.find((row) => row.stock_item_id === args.p_stock_item_id && row.location_id === args.p_source_location_id)?.quantity || 0;
          if (args.p_direction === 'out' && available < args.p_quantity) return error('Insufficient stock; negative balances are prohibited.');
          const movement = { id: `movement-${fixture.movements.length + 1}`, facility_id: fixture.facility, stock_item_id: args.p_stock_item_id, movement_type: args.p_movement_type, quantity: args.p_quantity, direction: args.p_direction, source_location_id: args.p_source_location_id, destination_location_id: args.p_destination_location_id, reason: args.p_reason, reference: args.p_reference, created_at: new Date().toISOString() };
          fixture.movements.push(movement);
          for (const [locationId, delta] of [[args.p_source_location_id, args.p_direction === 'out' || args.p_movement_type === 'transfer' ? -args.p_quantity : 0], [args.p_destination_location_id, args.p_direction === 'in' || args.p_movement_type === 'transfer' ? args.p_quantity : 0]]) if (locationId && delta) {
            let balance = fixture.balances.find((row) => row.stock_item_id === args.p_stock_item_id && row.location_id === locationId);
            if (!balance) { balance = { stock_item_id: args.p_stock_item_id, location_id: locationId, facility_id: fixture.facility, quantity: 0 }; fixture.balances.push(balance); }
            balance.quantity += delta;
          }
          return { data: movement.id, error: null };
        }
        if (name === 'record_store_stock_movement') {
          const lot = fixture.lots.find((row) => row.id === args.p_inventory_lot_id);
          fixture.items.push({ id: 'item-pharmacy', facility_id: fixture.facility, item_code: 'LOT-1', item_name: lot?.name || 'Amoxicillin lot', unit: 'unit', pharmacy_inventory_id: args.p_inventory_lot_id, active: true });
          return client.rpc('record_store_item_movement', { p_stock_item_id: 'item-pharmacy', p_movement_type: 'receipt', p_quantity: args.p_quantity, p_direction: 'in', p_source_location_id: null, p_destination_location_id: args.p_destination_location_id, p_reason: args.p_reason, p_reference: args.p_reference });
        }
        if (name === 'configure_purchase_approval_tier') { fixture.tiers.push({ id: 'tier-new', facility_id: fixture.facility, minimum_amount: args.p_minimum, maximum_amount: args.p_maximum, approvals_required: args.p_approvals, approver_role: args.p_approver_role }); return { data: 'tier-new', error: null }; }
        if (name === 'create_procurement_supplier') { fixture.suppliers.push({ id: 'supplier-new', facility_id: fixture.facility, supplier_name: args.p_name, active: true }); return { data: 'supplier-new', error: null }; }
        if (name === 'submit_purchase_order') {
          const order = { id: 'order-new', facility_id: fixture.facility, supplier_id: args.p_supplier_id, order_number: args.p_order_number, total_amount: args.p_items.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0), status: 'pending_approval', created_by: fixture.actor };
          fixture.orders.unshift(order); fixture.orderItems.push(...args.p_items.map((line, index) => ({ id: `line-new-${index}`, purchase_order_id: order.id, stock_item_id: line.stock_item_id, quantity_ordered: line.quantity, unit_cost: line.unit_cost })));
          return { data: order.id, error: null };
        }
        if (name === 'approve_purchase_order') { const order = fixture.orders.find((row) => row.id === args.p_order_id); if (order) order.status = args.p_decision === 'approved' ? 'approved' : 'cancelled'; fixture.approvals.push({ id: 'approval-1', purchase_order_id: args.p_order_id, approver_id: fixture.actor, decision: args.p_decision }); return { data: order?.status || 'approved', error: null }; }
        if (name === 'receive_purchase_order') {
          const order = fixture.orders.find((row) => row.id === args.p_order_id); const line = args.p_receipt_lines[0];
          fixture.receipts.push({ id: `grn-${fixture.receipts.length + 1}`, facility_id: fixture.facility, purchase_order_id: order.id, received_at: new Date().toISOString(), supplier_delivery_reference: args.p_supplier_delivery_reference });
          fixture.receiptItems.push({ id: 'received-line-1', goods_received_note_id: fixture.receipts.at(-1).id, purchase_order_item_id: line.purchase_order_item_id, quantity_received: line.quantity, location_id: line.location_id });
          order.status = line.quantity < 10 ? 'partially_received' : 'received';
          return { data: fixture.receipts.at(-1).id, error: null };
        }
        if (name === 'return_supplier_goods') { fixture.returns.push({ id: 'return-1', facility_id: fixture.facility, supplier_id: args.p_supplier_id, return_reference: args.p_return_reference, reason: args.p_reason }); return { data: 'return-1', error: null }; }
        if (name === 'record_supplier_performance') { fixture.performance.push({ id: 'performance-1', facility_id: fixture.facility, supplier_id: args.p_supplier_id, delivery_score: args.p_delivery_score, quality_score: args.p_quality_score }); return { data: 'performance-1', error: null }; }
        return { data: `${name}-id`, error: null };
      }
    };
    window.__stockFixture = fixture;
    window.OneMedSupabase = { getClient: () => client, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  }, seedOrder);
}

test('stock manager records ledger receipts, sees reconciled balances, and gets a clear no-negative-stock error', async ({ page }) => {
  await signIn(page); await installFixture(page);
  await page.getByRole('button', { name: 'Inventory' }).click();
  const stock = page.getByRole('region', { name: 'Stock ledger and procurement' });
  await stock.getByLabel('Location code').fill('MAIN'); await stock.getByLabel('Location name').fill('Main Store');
  await stock.getByRole('button', { name: 'Create location' }).click(); await expect(stock.getByRole('status')).toContainText('Store location created');
  await stock.getByLabel('Item code').fill('MED-1'); await stock.getByLabel('Item name').fill('Amoxicillin'); await stock.getByLabel('Unit').fill('capsule');
  await stock.getByRole('button', { name: 'Create item' }).click(); await expect(stock.getByRole('status')).toContainText('Stock item created');
  await stock.getByLabel('Stock item').selectOption('item-1'); await stock.getByLabel('Movement type').selectOption('receipt');
  await stock.getByLabel('Destination location').selectOption('loc-1'); await stock.getByLabel('Quantity').fill('5'); await stock.getByLabel('Reason').fill('Opening balance');
  await stock.getByRole('button', { name: 'Post movement' }).click(); await expect(stock.getByRole('status')).toContainText('append-only ledger');
  await expect(stock.getByText('Reconciled')).toBeVisible();
  await stock.getByLabel('Movement type').selectOption('issue'); await stock.getByLabel('Source location').selectOption('loc-1');
  await stock.getByLabel('Quantity').fill('6'); await stock.getByLabel('Reason').fill('Test issue'); await stock.getByRole('button', { name: 'Post movement' }).click();
  await expect(stock.getByRole('alert')).toContainText('Not enough stock is available');
  expect(await page.evaluate(() => window.__stockFixture.movements.length)).toBe(1);
});

test('procurement configures approval, submits an order, partially receives goods, returns stock, and rates supplier', async ({ page }) => {
  await signIn(page); await installFixture(page, true);
  await page.getByRole('button', { name: 'Procurement' }).click();
  const procurement = page.getByRole('region', { name: 'Stock ledger and procurement' });
  await procurement.getByLabel('Minimum amount (NGN)').fill('100'); await procurement.getByLabel('Maximum (exclusive; blank = no limit)').fill('');
  await procurement.getByLabel('Approvals required').fill('1'); await procurement.getByLabel('Approver role').fill('accountant');
  await procurement.getByRole('button', { name: 'Save approval tier' }).click(); await expect(procurement.getByRole('status')).toContainText('tier configured');
  await procurement.getByLabel('Supplier name').fill('North Medical Supply'); await procurement.getByRole('button', { name: 'Create supplier' }).click();
  await procurement.getByLabel('Supplier', { exact: true }).first().selectOption('supplier-new');
  await procurement.getByLabel('Order number').fill('PO-100'); await procurement.getByLabel('Item').selectOption('item-1');
  await procurement.getByLabel('Quantity', { exact: true }).fill('10'); await procurement.getByLabel('Unit cost (NGN)').fill('500');
  await procurement.getByRole('button', { name: 'Submit purchase order' }).click(); await expect(procurement.getByRole('status')).toContainText('submitted for approval');
  const existingOrder = procurement.getByTestId('purchase-order-row').filter({ hasText: 'PO-EXISTING' });
  await existingOrder.getByRole('button', { name: 'Approve' }).click(); await expect(existingOrder.getByText('approved')).toBeVisible();
  await existingOrder.getByLabel('Order line').selectOption('line-existing'); await existingOrder.getByLabel('Quantity received').fill('4');
  await existingOrder.getByLabel('Destination location').selectOption('loc-1'); await existingOrder.getByRole('button', { name: 'Record partial / full receipt' }).click();
  await expect(procurement.getByRole('status')).toContainText('Goods receipt note recorded'); await expect(existingOrder.getByText('partially_received')).toBeVisible();
  await procurement.getByLabel('Supplier', { exact: true }).nth(1).selectOption('supplier-1');
  await procurement.getByLabel('Received goods line').selectOption('received-line-1'); await procurement.getByLabel('Quantity').last().fill('1');
  await procurement.getByLabel('Return reference').fill('RET-1'); await procurement.getByLabel('Reason').fill('Damaged packaging');
  await procurement.getByRole('button', { name: 'Record supplier return' }).click(); await expect(procurement.getByRole('status')).toContainText('Supplier return recorded');
  await procurement.getByLabel('Supplier').last().selectOption('supplier-1'); await procurement.getByLabel('Delivery score (0–100)').fill('90');
  await procurement.getByLabel('Quality score (0–100)').fill('95'); await procurement.getByLabel('Evaluation notes').fill('On-time delivery; quality verified.');
  await procurement.getByRole('button', { name: 'Save performance review' }).click(); await expect(procurement.getByRole('status')).toContainText('Supplier performance saved');
  expect(await page.evaluate(() => window.__stockFixture.calls.map((call) => call.name))).toEqual(expect.arrayContaining(['configure_purchase_approval_tier', 'submit_purchase_order', 'approve_purchase_order', 'receive_purchase_order', 'return_supplier_goods', 'record_supplier_performance']));
});
