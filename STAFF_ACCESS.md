# Owner and staff access

The app now requires verified Google sign-in. It no longer signs in anonymously or falls back to unrestricted Firestore reads. Existing entries in `config/allowedusers.emails` remain owners. Lowercase email addresses are required for server-side matching. The explicit `roles` map overrides the legacy list: `owner`, `staff`, or an empty string to revoke access.

## Firebase setup before inviting staff

Repository changes do not apply Firebase rules. No workflow, hosting configuration or deployment setup has been changed.

1. In Firebase Authentication, confirm Google sign-in is enabled and the app's hostname is an authorised domain.
2. In Firestore, inspect `config/allowedusers`. Preserve all existing owner emails, normalise them to lowercase, and explicitly add your verified Google email to the `roles` map as `owner`. Do this before publishing the rules so that you keep owner access.
3. Add the employee's lowercase Google email to `roles` as `staff`. Leave `staffAccessReady` false. Explicit staff roles override any accidental entry in the legacy owner list.
4. Review existing Firestore rules, then publish the repository's `firestore.rules` in the Firebase console. It denies anonymous access and protects owner collections. Merge any required unrelated application rules deliberately; never retain a broad authenticated-user allow rule.
5. Sign in as owner and open Job Sheets. Existing jobs are projected into `staffJobSheets` using a strict field allow-list. New saves update the full owner job and safe staff projection in one batch.
6. Verify with an actual staff account that reading `jobs`, `quotes`, `customers`, `config/settings` and another staff member's reports is denied; check that allowed sheet reads and own report saves succeed. Set `staffAccessReady` true only once the rules are published, then complete those staff checks before sharing access for real work. The readiness flag is an operator acknowledgement, not a substitute for server-side rules.

Example configuration (replace these example addresses):
```json
{
  "emails": ["owner@example.com"],
  "roles": {
    "owner@example.com": "owner",
    "employee@example.com": "staff"
  },
  "staffAccessReady": false
}
```

## What each user sees

Owners retain the original app screens, quotes, settings, history, invoices and financial summaries. Their Job Sheets also show staff daily records with counts, expense descriptions, amounts and parts used. Counts feed actual/remaining totals and revenue at the owner's service-level prices; submitted expenses feed job costs and profit. Staff reports are included in owner CSV exports. Refresh owner Job Sheets to retrieve the latest staff submissions.

Staff load a separate module and never load owner scripts, browser caches, quotes, full job records, settings or financial summaries. Cached Kirkstone owner data is cleared on sign-out and when entering staff mode on a shared browser. They see customer name, quote reference, expected/actual/remaining counts by channel, and service-level names. They can add and amend their own daily reports, their own expense amounts/descriptions, and parts descriptions/quantities. Other employees' expenses are private; their completed counts contribute to shared actual totals through separate count-only progress records. Closed jobs remain visible but cannot receive staff edits.

Parts are recorded as descriptions and quantities without exposing purchase/catalogue/customer prices. Owners price those parts in the existing Parts editor when needed. Do not re-enter submitted staff expenses into owner cost inputs: they are already included separately. Staff cannot delete jobs, change quote references, edit owner rows or read financial exports.

## Storage and security

Full owner documents keep their existing schema. Reports live under `staffJobSheets/{jobId}/reports/{reportId}`; progress documents contain only uid and five counts. Each report/progress pair is committed atomically and rules enforce identical counts and immutable account ownership. Staff cannot write the job projection or owner collections.

Deleting a job removes its staff projection before deleting the owner job. Firestore retains subcollections, including reports, for recovery/audit; orphan reports are not listed by the staff app and cannot receive staff writes. Owner saves do not embed reports into the full job, avoiding duplication.

A Google account and Firebase security setup are required for production owner access. Local `?preview` on localhost still previews owner functionality without Firebase. Staff access is intentionally unavailable until the security readiness flag is enabled.

## Validation

Run `node --test tests/staff-access.test.cjs` for seven regression checks covering role resolution, owner-only collection helpers, safe projections, atomic owner saves, staff counts/expenses in owner financial totals, and separated startup. Local headless browser checks also passed for owner settings/Job Sheets/extensions, owner staff-record visibility and pricing, and the staff mobile form's save/edit flow and totals. These used fixtures and mocked Firebase; production credentials and the Firebase emulator were unavailable, so server rules and live persistence still require the Firebase checks above.

