# Restricted employee access — draft, not approved for deployment

This branch adds a cPanel-authenticated employee entry point and a private Firebase bridge. Do not merge it or publish its Firestore rules independently. Backend configuration ships disabled. No password or service-account key belongs in this repository.

## Access and existing interface

Keep the existing owner username/password. The proposed named employee username is `ShelleyCoates`. The owner app retains its financial controls and operational work-sheet renderer. Its bootstrap now obtains a custom Firebase owner token through Apache rather than anonymous authentication; failures stop data loading.

`/employee/` adapts the existing work-sheet card, expected/actual/remaining counts, daily service rows, notes and calendar conventions to a permitted payload. It does not load owner scripts, calculations, settings or local-storage caches. The team calendar is read-only. Only active jobs assigned to Shelley as lead or additional worker have editable job sheets. Joining dates remain attendance dates, rather than changing the lead’s booking.

Employees may record daily service counts, update quantities of already-listed parts, write employee-specific work notes, and record their own mileage, hotel, meals, other travel/parking and other expenses. These are stored in a separate employeeExpenses map, displayed to the owner for review, and never automatically added to aggregate job costs. Mileage records distance only; no payment rate is inferred. Owner costs and prices remain private. Additional parts are recorded in notes for the owner to add, because creating priced parts automatically would require a separate verified catalogue/pricing integration. The owner’s existing notes, costs and part prices are never sent to the employee. The owner can publish explicit employee instructions and see employee work in the existing sheet.

Every backend read/write checks the Apache identity. Every write checks assignment, permitted keys and types, CSRF, Origin and the current Firestore document version. Firestore’s atomic update precondition rejects a reassignment or owner edit that races the employee save. Owner saves use a transaction and employee revision check to reject stale owner copies after an employee update.

## Runtime and private configuration

- PHP 8.1+ with OpenSSL, JSON, sessions and cURL; HTTPS, Apache Basic Auth, mod_headers and AllowOverride for the included authentication directives.
- Verify `REMOTE_USER` reaches PHP after Apache authenticates the named user. HTTP headers containing usernames or roles must not be treated as identity. Unknown and disabled principals are rejected.
- Provision a dedicated service-account credential for this Firebase project, with only the database permissions this backend requires. A Datastore User role is a starting point for runtime database access; review project-specific IAM and key policy. The bridge signs custom owner tokens locally. Do not grant project Owner or Editor just to make it work.
- Copy `access.example.php` to the private path referenced in `server/firebase-bridge.php`, outside every website document root, file mode 0600. Put the JSON key alongside it with mode 0600. Neither file is included in cPanel deployment or GitHub.
- Set the actual approved HTTPS origin, project ID and service-account filename. Leave `enabled=false` and the employee disabled until the cutover checks pass. No credential has been provisioned by this branch.
- Owner custom tokens expire after five minutes; Firestore requires an owner bridge authentication within the past hour. The owner app renews through Apache every 40 minutes. A refresh token alone cannot extend that rule window. The employee API rechecks the enabled-principal map on every request. For emergency owner revocation, increment the bridge version in both private configuration and rules; also revoke Firebase refresh tokens as appropriate.

## Authentication configuration

The root `.htaccess` uses the inspected cPanel-managed password-file location and restricts owner routes to `Danwalters`. Do not overwrite or redeploy any `.htpasswd` file. `/employee/` and shared CSS explicitly allow the owner and named employee. `/api/owner-token.php` is owner-only; `/server/` is denied to all HTTP requests. The private key and configuration must remain outside the web root even with these denials.

The existing cPanel deployment recipe is expanded to include the new runtime files and root access configuration. A merge to `main` triggers the existing site update workflow. Review and approve the full cutover before merging. Do not point a test environment at production data just to complete local checks.

## Verification

Run the existing JavaScript tests plus `owner-bridge.test.cjs`, the PHP `employee-policy.test.php`, and the DOM `employee-ui.test.cjs` with jsdom available. Run `employee-rules.test.cjs` only inside the Firestore emulator using `security/firebase.json` and the Firebase JS/rules test packages. The demo project ID prevents accidental production use.

The existing browser regression test requires a Chrome executable. DOM tests validate interactions and escaping, but do not establish browser rendering, real Apache authorisation or real Firebase token exchange. These remain distinct checks. Tests must not claim live hosting compatibility unless performed there.

Before enabling access, test owner/employee/unknown credentials against `/`, `/index.html`, `/js/data.js`, `/api/owner-token.php`, `/employee/`, `/employee/api.php`, `/css/styles.css` and `/server/`. Owner routes and default pricing scripts must return 403 to the employee. Missing credentials must get the normal authentication challenge. Requests for password files, source-private directories and configuration must fail.

Use synthetic assigned/unassigned/shared/closed jobs; verify the employee network responses, DOM, exports and storage contain no financial sentinel. Verify assignment changes and concurrent edits produce conflicts. Confirm owner notes and part prices survive valid employee saves. Confirm employee work is visible to the owner after refresh.

## Approved cutover sequence — execute only after owner approval

1. Back up live Apache configuration, rules and affected data in protected storage. Keep the current owner password file untouched.
2. Complete staging checks, including real Apache-to-PHP identity propagation, the private runtime credential and Firebase custom-token exchange. Do not enable the employee account on the unrestricted owner app.
3. Agree a maintenance window. Stage the protected backend, owner bridge and employee route with employee access disabled. Check the owner can obtain the intended signed identity. Existing permissive data access must not be used as proof of correct bridge identity.
4. In the same controlled window publish the restrictive rules and activate the owner bridge. Verify normal owner reads, saves and calculations. Do not publish the rules against the old anonymous bootstrap alone.
5. Have the owner enter and submit Shelley’s new password directly in cPanel. Do not transmit it through chat, store it in source or reuse the owner password. Enable the named employee principal only after the authorisation tests pass.
6. Verify employee API limits and denied owner routes with the real named account. Share the `/employee/` URL through the owner; no message is sent automatically.

If cutover fails, disable the employee and backend access, retain restricted database rules and fix the owner bridge or use a maintenance page. Do not reopen the database to all authenticated users as an ordinary rollback. Restoring an old page without a compatible secure owner data path is not a complete rollback.

Deployment approval is still required, and credential provisioning/password entry require owner participation. This draft does not activate employee access.
