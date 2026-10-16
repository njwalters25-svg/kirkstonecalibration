# Job assignment, operational sheets and calendar

This update leaves the existing site username/password prompt, Firebase authentication, Firestore rules, cPanel settings and deployment workflows unchanged. The paused employee-login implementation is not included.

## Assigning work and travel defaults

- New quotes have an **Assigned to** selector and a **Travel starting postcode** field.
- Owner jobs use the existing Home Base postcode. Shelley jobs default to **NE32 5QA**, configurable under **Settings → Team travel and Outlook calendar**.
- The travel start is separate from the customer's address and destination postcode. Selecting Shelley does not overwrite customer details.
- Assignment remains editable on existing Job Sheets and on the Calendar. Save the Job Sheet or schedule to persist changes through the existing Firebase save path.
- Changing assignee resets the job's travel start to that person's default and marks the previous route for review. **Calculate travel** gives a one-way estimate. It deliberately does not overwrite recorded expenses or infer total job mileage; enter total job mileage in Costs.
- Existing quote references, invoice numbering, pricing snapshots, job expenses and owner calculations are retained.

## Shelley work-sheet view

Jobs assigned to Shelley open with an operational sheet containing the customer, quote reference, expected/actual/remaining pipette counts, daily service rows, parts used, job expenses and work notes. Purchase costs remain visible; customer unit prices, revenue, profit/loss, tax, pension, wages and invoice controls are absent.

**Owner financial view** opens the original full Job Sheet for review and pricing. **Back to work sheet** returns to the operational view. Print and CSV actions on the work sheet generate a separate allow-listed output; existing private quote/job notes are not copied into work notes.

This is a view preference in the existing shared owner app, not employee authentication. Anyone with the current site login can still use the owner controls. It is suitable for preparing or printing an operational sheet while the separate employee-login project remains on hold.

## Calendar

The **Calendar** tab shows exact work dates, assignees, provisional bookings and an agenda. Set start and end dates on a Job Sheet or in the agenda, then save. End dates are inclusive. Existing month-only proposals stay under **Needs exact dates**; the app does not assume a day. Archived, cancelled, deleted and historical jobs are excluded from active planning.

**Export jobs for Outlook (.ics)** exports scheduled active jobs for the selected assignee filter, across all dates. Event identifiers are stable, all-day date ranges include the last workday, and exports omit financial amounts and attendees. Importing an ICS file is a snapshot, not a live subscription; repeated manual imports can duplicate events depending on Outlook's import behaviour.

## Optional live Outlook connection

The Outlook connector available in this chat is separate from the self-hosted app. Live app access needs a Microsoft application registration; it does not need a new app login, Firebase changes or a client secret.

1. In Microsoft Entra **App registrations**, register an application that supports personal Microsoft accounts (and organisational accounts if needed).
2. Add a **Single-page application (SPA)** redirect URI matching the site's deployed callback page exactly: your app's folder URL followed by `outlook-callback.html`. For example, if the app opens at `https://quotes.kirkstonecalibration.co.uk/`, register `https://quotes.kirkstonecalibration.co.uk/outlook-callback.html`. Use the actual host and folder where you open the app.
3. Enable delegated Microsoft Graph permissions **User.Read** and **Calendars.ReadWrite**. Do not create or paste a client secret.
4. Copy the public **Application (client) ID** into **Settings → Team travel and Outlook calendar**, then select **Save team and calendar settings**.
5. On **Calendar**, select **Connect Outlook**, sign in with the intended Microsoft account and choose a calendar. Read-only calendars can be displayed but cannot receive jobs.

The app uses Microsoft's MSAL Browser 4.29.0 (loaded on demand from its pinned jsDelivr npm module) and Microsoft Graph v1.0. The callback is a blank page as recommended for this MSAL version's popup flow. Tokens and fetched event details are kept in browser memory, never saved to Firebase or job records. Reloading requires reconnecting. Disconnect clears the app's Microsoft cache and event overlay without signing the user out of other Microsoft websites.

### What synchronisation does

- **Connect / Refresh Outlook** displays the selected calendar's events, including recurring occurrences in the calendar's visible range.
- **Send / update in Outlook** saves the job, then creates or updates its linked all-day appointment. It sends the customer name/address, quote reference, assignee and dates, without amounts, financial notes or attendees.
- Repeated sends update the same linked event. A deterministic transaction ID and local link receipt protect retries after a save failure.
- If an Outlook appointment's dates change, refresh the calendar, select its entry and choose **Use Outlook dates for this job**. Dates are written back to Firebase without rewriting the rest of the Job Sheet. Timed Outlook events are represented as work dates; time-of-day is not stored on the job.
- Updates are explicit while the app is open. This is not background server synchronisation.
- Events with attendees are not updated by the app, to avoid sending meeting changes or invitations. Manage those in Outlook.
- Archiving/deleting an app job does not cancel or delete its Outlook appointment.
- Sending to another calendar/account creates a separate copy and does not remove the original. Calendars marked read-only cannot receive jobs.
- Linked-event deduplication applies to appointments created by this connection, not earlier manually imported ICS copies.

## Validation

- `node --test tests/planning.test.cjs`: seven date, projection, Outlook payload, calendar export and CSV checks.
- `node tests/planning.browser.cjs` with Playwright available: original startup, new-quote assignment, Shelley travel origin, unchanged customer address, operational edits/exports, owner financial view, archive/restore, reload persistence, calendar layout and Outlook API simulations. The browser checks mock Firebase and Microsoft requests and do not contact real calendars. Set `NODE_PATH` if using a bundled Playwright installation; Chrome is used by default.
- Real Microsoft sign-in/consent and live Firebase writes require the site's authenticated environment. They are not claimed as tested by local fixtures.

Microsoft references: [MSAL popup redirect guidance for the pinned version](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/msal-browser-v4.29.0/lib/msal-browser/docs/login-user.md#redirecturi-considerations), [app initialisation and registration](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization), [calendarView](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0), [create event](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0), [Outlook ICS import](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web).


## Working together and named worker costs

A job keeps one lead assignee. On the quote, tick **Second person on job** and choose **Additional worker** (Phil, Shelley, or Owner when Shelley leads). Job Sheets retain the team and allow the additional worker to be changed after creation. Swapping lead between Owner and Shelley preserves both people when they work together. Travel origin follows the lead; calendar filters include everyone taking part. Calendar events and operational exports name the lead and team without pay rates.

Phil retains the existing configured second-person day rate. Shelley uses **£15.87/hour** for work and travel, whether she leads or is the additional worker. Automatic paid hours use reduced team work time plus all planned home trips, hotel commutes and return-home journeys. The optional paid-hours override covers different attendance or separate travel. The owner's existing labour allowance applies when the owner participates; it is omitted on Shelley-only jobs. The existing second-person calibration time reduction still applies.

Shelley's additional hotel, fuel and food totals enter internal cost/profit calculations; they do not automatically change customer prices. Enter only expenses not already covered by main job accommodation, mileage or subsistence. These amounts seed the editable Job Sheet hotel, fuel and food totals, and calculated worker pay seeds its aggregate worker cost. Job Sheet expenses remain actual editable totals rather than a live wage calculator; changing a job's assignment/team does not rewrite the saved quote or recorded expenses. Revise the quote to re-estimate costs.

New quotes snapshot the rate and team costing version. Existing saved quotes keep their original calculations when loaded or printed; changing their team or Shelley cost inputs opts them into named-worker costing. Manual planned-days and single-day controls continue to work with hourly costing. No login, Firebase rules, deployment or workflow changes are included.

## Shelley part-time availability

On a quote, **Days Shelley is available** is optional: blank retains whole-job behaviour; zero means no attendance. Enter **Days Shelley is available = 2**; total job duration still comes from the pipette quantities and configured per-service timings. Eight solo working days with two days of Shelley at the same pace is roughly six days for the lead. Planned days override remains optional. Whole days are supported. Automatic paid hours use her attendance days (capped at total job days) times the configured working-day length, plus travel. Manual paid hours still take priority.

For limited attendance, daily commuting is charged only for her attendance days. Overnight travel uses one home round trip plus hotel commutes for her attendance, using the quote's travel-day-before pattern. Additional return-home trips made by the lead are not automatically charged to Shelley. Use the paid-hours override for her different travel, split attendance, extra home journeys or shorter shifts. Hotel, fuel and food remain explicit additional totals; changing availability does not rescale entered receipts or budgets.

Shelley contributes the same configured pipette capacity per work minute as the lead. Her contribution is capped by her available days, using daily work capacity after regular commuting; a two-person job cannot take less than half its solo work time. The remaining work runs at the solo pace; manual total-day overrides remain authoritative. Existing quotes without availability retain their calculation. Saved quotes, new Job Sheets and operational exports retain the available-day count. Calendar entries still cover the whole job and state that Shelley's attendance dates are not set; a number of days does not establish which dates she will attend.

## Automatic Shelley fuel and separate travel

New quotes default to **Shelley travelling separately**. Selecting Shelley and entering/changing the job postcode fetches her own driving route from her configured postcode (default NE32 5QA). **Recalculate Shelley's route** retries the lookup. The lead's route fields remain unchanged. Clearing **Shelley fuel override** calculates mileage using the quote's saved mileage cost rate; any entered amount, including zero, takes priority. This is a mileage-cost estimate, not litres of fuel at a pump price.

Daily commuting uses a home return trip per Shelley attendance day. Overnight work uses one home return trip plus the job's entered hotel-to-work mileage for her attendance days. Split visits or extra return-home trips should use a manual fuel override. Travelling together gives no automatic additional fuel. With a valid separate route, automatic paid travel hours also use Shelley's own route time; the paid-hours override remains authoritative.

When Shelley is lead, her mileage is carried in fuel instead of also being counted as the lead mileage allowance. New Job Sheets therefore seed zero lead mileage in that case and retain the calculated Shelley amount in fuel. Owner-led jobs retain owner mileage and add Shelley fuel separately. No customer travel charge is automatically added for Shelley's separate vehicle. Existing quotes retain recorded manual fuel until these travel controls are edited or her route is explicitly calculated. Route snapshots are saved with quotes and rejected when postcodes change. An unfinished/failed lookup is shown and blocks saving an automatic zero estimate; an explicit override permits saving.

## Shelley training override

Tick **No time saving for Shelley — training** in Shelley’s quote costs to remove both the normal second-person percentage reduction and the contribution from her available days. Pipette/service timings stay at the solo work duration. Her hourly pay, travel and expenses still apply. The checkbox is saved with the quote and restored on reload; clearing the form resets it. Untick it to restore normal Shelley time savings. Phil’s existing reduction is unaffected. Manual Planned days overrides remain authoritative.
