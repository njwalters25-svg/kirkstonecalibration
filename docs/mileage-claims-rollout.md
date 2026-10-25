# Mileage claims, Shelley access and invoice integration — implementation contract

Status: **design / work in progress; not safe to deploy**. The feature branch is a draft PR.

## Confirmed business rules
- Dan retains his existing Google sign-in. Shelley needs a username/password experience; do not put a password in JavaScript or Firestore. Use a secure server-mediated username mapping to a Firebase Auth account.
- Shelley may read the entire work calendar, with customer, place, date and assigned technician but **no commercial values**. She may read/update only job sheets to which she is assigned, including joint jobs. Enforce at the database/API boundary, not only by hiding tabs.
- Separate journeys for Dan and Shelley on joint jobs. Mileage and origin can be overridden, and car-sharing must record who drove. One car journey must not produce duplicate reimbursement to both people.
- Every submitted claim must notify info@kirkstonecalibration.co.uk through a trusted backend after successful persistence. Include job, employee, date, route, miles, amount, car sharing and a review link. Do not send mail from client JavaScript or expose SMTP credentials.
- Dan alone can approve/reject claims. Record approver UID, timestamp, original and adjusted figures, and reason. Submitted claims are not costs payable until approved.
- **Invoice spreadsheet 'Completed' checkbox is a manual money-moved/paid action**, never an automatic side effect of submission or approval.
- Approved claims should be reflected in job actual costs, invoice spreadsheet, annual summary and outstanding reimbursement / pot allocations, without double counting existing quote mileage or fuel estimates.
- Locked invoice snapshots must not silently drop later approved claims; show a reconciliation item for Dan instead of silently mutating locked figures.

## Security design needed before rollout
The current Firestore `jobs` documents contain customer and financial fields together. Firestore security rules are **document-level**, so field masking in the browser is insufficient. Provide separate safe `employeeJobs` and `employeeCalendar` projections written by trusted server code, with owner-only full `jobs` access. Employee updates should be restricted to validated allowed fields, preferably through server functions.

For claims, use an owner UID/role defined and checked on the server. Shelley can create her own draft/submitted claims and read only her own claims. Owner-only approval transitions must be enforced server-side. Do not trust `employee`, `approvedBy`, `status` or `rate` fields sent by the browser. Set these based on authenticated identity and server rules.

Email notification should be triggered by the backend on first transition to submitted and be idempotent (dedupe on claim ID), with retry/failure logging. Do not expose email service credentials to the browser.

## Accounting design
Use a unique approved expense record as the source of truth, keyed by claim ID. Do not add an approved amount to `job.costs.fuel` if the same amount is already counted as quoted or estimated mileage. Prefer separate `actualEmployeeExpenses` breakdown and a single reconciled actual-cost calculation, then feed the invoice spreadsheet from that calculation. For completed/locked rows, create a visible adjustment pending reconciliation. Track claim status independently: submitted → approved/rejected → paid. Paid is only recorded when Dan confirms money moved.

## Current code caveats
- The new `js/mileage-claims.js` is a **prototype**. It currently has no owner approval workflow or backend notifications, and its collection access is not employee-secured. It must not be enabled for production without rules and role separation.
- The existing invoice spreadsheet `getLiveInvoiceSpreadsheetValues` uses `calculateJobSheet`; locked rows use `invoiceSpreadsheetSnapshot`. The annual summary consumes invoice spreadsheet values. These are the correct integration points, but the integration is not yet implemented.
- Verify the UK tax treatment of the configured 55p/mile reimbursement with KLN independently of the application's costing rate.

## Acceptance tests
1. Dan Google login still works; Shelley username/password works; wrong credentials rejected.
2. Shelley cannot query full quotes, financial job data, other users' claims, settings, or owner-only write APIs, including by direct Firestore requests.
3. Shelley can see all calendar entries without prices and only her assigned job sheets.
4. Joint job produces two independent journeys; car-sharing correctly results in only one mileage reimbursement per vehicle journey.
5. Both job-linked and non-job claims submit; email is sent once to the Kirkstone inbox; submission does not approve or pay a claim.
6. Dan can approve/adjust/reject with audit history; Shelley cannot approve, even via forged requests.
7. Approved job claims flow exactly once into actual job cost, invoice spreadsheet and annual summary; no estimated mileage double count.
8. Locked/completed invoice rows are not silently rewritten; late expense adjustments are surfaced.
9. Paid/money-moved state changes only on Dan's explicit action.
