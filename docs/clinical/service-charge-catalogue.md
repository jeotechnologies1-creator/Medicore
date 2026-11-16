# Service and charge catalogue

The service charge catalogue is maintained per facility. This repository defines no service prices. Authorized Accounts users submit entries or later price versions with facility, code, name, department, price, and effective dates. A different authorized Accounts user must approve every proposed price before it can be used. Retroactive prices are rejected; correct an issued charge with an invoice credit note.

Approvals, catalogue changes, price history, invoice line snapshots, and credit notes are audited. Invoice line items capture the approved catalogue item and price version as issued. Invoice details and itemized lines are immutable. A credit note records a correction separately and never rewrites the original invoice or its line values. Retiring an item prevents future invoice use while preserving price and invoice history.

Catalogue reads and writes are scoped to the staff member's authorized facility. A Super Admin can manage authorized facilities through the same Billing workflow. New catalogue prices and effective dates must be supplied by the facility; no defaults or repository price list are provided.
