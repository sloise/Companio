# Foster messaging

Messaging uses the existing placement, its approved application, the application's decided_by staff record, and staff shelter identity. Staff from that shelter can initiate a conversation only when the placement is Active and the animal is In Foster Care. The application must be Approved and belong to the same animal. Foster parents reply and share pet updates in the staff-initiated conversation. No assignment, matching, or additional approval is required.

For Super Admin approvals, the existing animal creation event identifies shelter staff. Super Admin does not get private conversation access. If a legacy staff account has no shelter identity, only the staff member recorded in the approval/creation record is authorized; no global staff fallback is used. Records lacking either source cannot safely identify shelter staff and fail closed.

The former messaging-shelter assignment API and UI have been removed. The legacy animals.shelter_key column is unused by messaging and retained to avoid a destructive schema change. Existing conversation, participant, message, and notification tables are reused; no new migration is needed for this correction. Conversations and photos are preserved. Participant records store read cursors, while current role and existing foster records determine authorization on every request.

Returned and Adopted placements retain read-only message and photo history. They cannot start new conversations or send messages. Pending applications and pets outside active foster care cannot start or send messages. Notifications link directly to the correct role-specific conversation. Existing polling updates chat every 4 seconds and badges every 10 seconds.

No websocket service, queue worker, or new environment setting is required. Keep the local storage disk private and writable. Photos are authenticated JPEG/PNG/WebP uploads, at most 5 MB. Do not expose conversation-photos through public storage. Deploy with the existing communications migration applied and rebuild the React frontend with npm run build.

Validation: php artisan test in companio-api; npm run lint, npm run build, and node tests/browser-messages.cjs in companio-frontend. Browser tests use mocked API data; backend tests exercise database persistence and authorization.

## Unified Messages inbox

The separate bell has been removed from both navigation layouts. Messages combines pet conversations with a Companio updates thread in the same inbox. Application decisions, foster changes, pet care news, and existing account notices reuse persisted user_notifications. Updates poll every 10 seconds; chat polls every 4 seconds. Super Admin can read its own existing account updates but gains no private chat access.

The inbox requests /notifications?inbox=1 to exclude chat alerts (conversation cursors already count those messages). Navigation displays unread chat messages plus unread automatic updates. Clicking an update marks only that item read and opens its existing internal destination; Mark updates as read applies only to visible system updates. Earlier updates are paginated. No migration, new service, or environment setting is needed.
