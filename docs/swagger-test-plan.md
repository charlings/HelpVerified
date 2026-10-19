# Swagger test plan (API, Phase 2)

A manual test script for every route in `http://localhost:8000/docs`. Each row says who to sign in as, what
to send, and the result the API gave when this plan was last run (2026-10-14, after
`uv run python -m app.scripts.seed --reset`). Run the sections **in order on freshly seeded data**: later
steps depend on earlier ones (for example, Joy is listed in VF4 and proposed in PR2).

All paths below are relative to `/api/v1` (except `/health`). Every error comes back as
`{ "error": { code, message, details, request_id } }`: check the `code` as well as the status.

## Setup

```powershell
cd apps/api
uv run python -m app.scripts.seed --reset
uv run fastapi dev app/main.py        # http://localhost:8000/docs
```

**Signing in:** `POST /auth/login` → copy `access_token` → **Authorize** (top right) → paste. Tokens last
15 minutes. Switching user = log in as them and paste the new token. Login is limited to 5 tries a minute
per email.

| Actor | Email | Password | Notes |
| --- | --- | --- | --- |
| Ada | `family@demo.hv` | `SEED_DEMO_PASSWORD` | family, Okafor family |
| Bola | `bola@demo.hv` | `SEED_DEMO_PASSWORD` | family, Martins family |
| New family | `newfamily@demo.hv` | `SEED_DEMO_PASSWORD` | family, no history |
| Sunrise | `agency@demo.hv` | `SEED_DEMO_PASSWORD` | agency admin, approved, Lagos |
| Kano | `kano@demo.hv` | `SEED_DEMO_PASSWORD` | agency admin, approved, Kano |
| Pending | `pending@demo.hv` | `SEED_DEMO_PASSWORD` | agency admin, Bright Hands (pending) |
| New agency | `newagency@demo.hv` | `SEED_DEMO_PASSWORD` | agency admin, no agency yet |
| Unverified | `unverified@demo.hv` | `SEED_DEMO_PASSWORD` | agency admin, email not verified |
| Suspended | `suspended@demo.hv` | `SEED_DEMO_PASSWORD` | suspended family |
| Admin | `admin@demo.hv` | `SEED_ADMIN_PASSWORD` | super admin |

**Demo IDs** (fixed on every reseed):

| Name | ID | State after seeding |
| --- | --- | --- |
| Amaka (worker) | `95cf43fa-2ca2-56d2-b52d-c8dc12c0a60b` | nanny, listed, available |
| Blessing (worker) | `74f6bae7-be83-5384-848b-0b4c653474fa` | nanny, on trial with Ada |
| Joy (worker) | `83ab5a0b-4904-5023-a35e-7ec2dc27644a` | nanny, 3/4 checks (address submitted) |
| Emeka (worker) | `a1546f80-e0b8-58a4-a7d9-a9607768e2c0` | driver, guarantor rejected |
| Tobi (worker) | `c96f590f-02c5-5b72-a228-9dba6c2a7452` | nanny, no checks started |
| Fatima (worker) | `9e3b9f76-1ddd-5148-8306-81b2d614e86d` | cleaner, listed |
| Halima (worker) | `b666f07d-e75d-5b59-88ce-2efed6c28b9e` | cleaner, references expired, delisted |
| Zainab (worker) | `158926bc-a55b-58b4-aa49-ba24c7360197` | nanny, Kano agency, listed |
| Emeka's ID document | `60d5562d-9e74-5487-adb4-5375eadf58aa` | |
| Emeka's guarantor document | `b67fcb75-19ef-599e-969a-cd6df21b4bd0` | |
| Ada's nanny request | `fbe887a8-e513-547d-8ca4-1a34f2939c03` | open, Lagos |
| Bola's cleaner request | `bbba28c6-42d4-55e4-9368-056e0cf3ca4f` | open, Lagos |
| Amaka → Ada proposal | `2c0fc5b0-d5c0-5d6f-a109-d771a23fface` | pending |
| Blessing placement | `a757e9df-c47f-542e-92ae-c87abd4f1c26` | trial (Ada) |
| Chinedu placement | `2a1620ed-098b-524f-8ca5-3ec32af0be54` | confirmed (Bola) |
| Grace placement | `149f94d2-9d2c-52e4-a5a5-4720dff8857d` | pending_payment (Bola), hold ends ~25 min after seeding |
| Musa placement | `ef44e84c-a942-527b-b0f1-0ad607d31db0` | ended (Ada) |
| Kano Home Helpers | `e2aaba1b-292d-56a8-ad6b-c402db1143ea` | approved |
| Bright Hands | `3d7cf159-f990-524f-95b9-aa16dfbb25a3` | pending |
| Harbour Care | `56923c47-472c-58c2-8c2e-7296508ab761` | suspended |

## Known issues found by this plan

1. **Paystack refuses every `@demo.hv` email.** Accept (PR16), pay (PY1) and agency subscription (BI3)
   return `502 PAYMENT_PROVIDER_ERROR` because Paystack answers `400 "email" must be a valid email`.
   Seeded accounts therefore can't reach checkout. The demo domain is owner input #12. Until it's decided,
   test payments with an account you sign up yourself using a real email address.
2. **The 502 message is misleading.** It says "The payment provider could not be reached" when Paystack was
   reached and refused the request.
3. **Accept keeps the hold when checkout fails.** After PR16's 502 the placement is already
   `pending_payment` (logged as `placement.created`) and the request is `matched`. Retrying returns
   `409 REQUEST_NOT_OPEN`, even with the same `Idempotency-Key`. The family can still pay through
   `POST /placements/{id}/pay` or let the hold expire, but the UI needs to handle this.
   **Addressed in the working tree (ADR 0017, Proposed, uncommitted):** a retried accept with the same `Idempotency-Key` now resumes the checkout (replay rule), or returns `CHECKOUT_IN_PROGRESS` while another call is opening it, or `HOLD_EXPIRED` once the hold has lapsed.
4. **A pending agency can add workers.** WK7 returned `201`. Listing still requires an approved, subscribed
   agency (`403 AGENCY_NOT_ACTIVE`), so rule 1 holds, but check this is intended.

---

## 0. Public

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| H1 | — | `GET /health` | | 200 |
| C1 | — | `POST /contact` | `{"name":"Test Person","email":"t@example.com","topic":"family","message":"Hello, testing the contact form."}` | 202 |
| C2 | — | `POST /contact` | `{"name":"T","email":"bad","topic":"x","message":""}` | 422 `VALIDATION_ERROR` (per-field `details`) |

## 1. Auth and profile

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| AU1 | — | `POST /auth/login` | `{"email":"family@demo.hv","password":"wrong-password"}` | 401 `INVALID_CREDENTIALS` |
| AU2 | — | `POST /auth/login` | Suspended account | 403 `ACCOUNT_SUSPENDED` |
| AU3 | — (no token) | `GET /me` | | 401 `UNAUTHENTICATED` |
| ME1 | Ada | `GET /me` | | 200, `role: "family"` |
| ME2 | Ada | `PATCH /me` | `{"phone":"08031112222"}` | 200 |
| ME3 | Ada | `PATCH /me` | `{"full_name":"A"}` | 422 `VALIDATION_ERROR` |
| AU4 | — | `POST /auth/signup` | `{"email":"<new>@example.com","password":"Str0ng-Passw0rd!","full_name":"Swagger Tester","role":"family","privacy_notice_version":"draft-2026-10-05"}` | 201 |
| AU5 | — | `POST /auth/signup` | same body again | 409 `EMAIL_TAKEN` |
| AU6 | — | `POST /auth/signup` | `role:"super_admin"`, `password:"short"` | 422 `VALIDATION_ERROR` |
| AU7 | — | `POST /auth/verify-email` | `{"token":"<from the email>"}` | 200 |
| AU8 | — | `POST /auth/verify-email` | same token | 410 `TOKEN_EXPIRED` |
| AU9 | — | `POST /auth/resend-verification` | `{"email":"unverified@demo.hv"}` | 202 |
| AU10 | — | `POST /auth/forgot-password` | your AU4 email | 202 |
| AU11 | — | `POST /auth/forgot-password` | `{"email":"nobody@example.com"}` | 202 (same as AU10: doesn't reveal accounts) |
| AU12 | — | `POST /auth/reset-password` | `{"token":"<from the email>","password":"An0ther-Str0ng-Pass!"}` | 204 |
| AU13 | — | `POST /auth/reset-password` | same token | 410 `TOKEN_EXPIRED` |
| AU14 | any signed-in user | `POST /auth/refresh` | (uses the `hv_refresh` cookie set by login) | 200, new `access_token` |
| AU15 | same | `POST /auth/logout` | | 204 |
| AU16 | same | `POST /auth/refresh` | | 401 `UNAUTHENTICATED` |
| AU17 | — | `GET /auth/google/start` | | 303 to Google (Swagger shows a network error, not the redirect: test in a browser) |
| AU18 | — | `GET /auth/google/pending` | | 410 `TOKEN_EXPIRED` |
| AU19 | — | `POST /auth/google/complete` | `{"full_name":"G User","role":"family","privacy_notice_version":"draft-2026-10-05"}` | 410 `TOKEN_EXPIRED` |
| AU20 | — | `GET /auth/google/callback` | `error=access_denied` | 303 back to the web login |

AU7 and AU12 need the link from the email. With `EMAIL_PROVIDER=smtp` it goes to the real inbox, so use an
address you can read. To keep email local instead, set `EMAIL_PROVIDER=outbox` and read the JSON file in
`EMAIL_OUTBOX_DIR`. Each address may receive 3 emails an hour (`RATE_LIMIT_EMAIL_PER_HOUR`).

## 2. Agencies

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| AG1 | Sunrise | `GET /agencies/me` | | 200 |
| AG2 | Sunrise | `PATCH /agencies/me` | `{"phone":"08030000000"}` | 200 |
| AG3 | Sunrise | `GET /agencies/me/dashboard` | | 200 |
| AG4 | New agency | `GET /agencies/me` | | 403 `FORBIDDEN` (no agency yet) |
| AG5 | New agency | `POST /agencies` | `{"name":"Swagger Test Agency","cac_number":"RC 7654321","email":"ops@swaggertest.example","phone":"08035550000","address_line":"1 Test Close","state":"Lagos","lga":"Ikeja","roles_offered":["nanny"]}` | 201, `status: "pending"` |
| AG6 | New agency | `POST /agencies` | same body | 409 `AGENCY_EXISTS` |
| AG7 | Unverified | `POST /agencies` | same body | 403 `EMAIL_NOT_VERIFIED` |
| AG8 | Ada | `GET /agencies/me` | | 403 `FORBIDDEN` |

## 3. Workers (rule 1)

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| WK1 | Sunrise | `GET /workers` | | 200 (own workers only) |
| WK2 | Sunrise | `GET /workers` | `role=nanny&listing_status=listed&available=true` | 200, filtered |
| WK3 | Sunrise | `POST /workers` | `{"full_name":"Test Worker","role":"cleaner","years_experience":2,"languages":["English"],"live_in_ok":false,"state":"Lagos","lga":"Ikeja","nin":"<11 new digits>","consent":true}` | 201, draft, four `not_started` checks |
| WK4 | Sunrise | `POST /workers` | same NIN | 409 `DUPLICATE_WORKER` |
| WK5 | Sunrise | `POST /workers` | new NIN, `consent:false` | 422 `VALIDATION_ERROR` |
| WK6 | Sunrise | `POST /workers` | `nin:"123"` | 422 `VALIDATION_ERROR` |
| WK7 | Pending | `POST /workers` | new NIN | 201 (see known issue 4) |
| WK8 | Sunrise | `GET /workers/{Amaka}` | | 200 |
| WK9 | Kano | `GET /workers/{Amaka}` | | **404** `NOT_FOUND` (another tenant: 404, not 403) |
| WK10 | Sunrise | `PATCH /workers/{Amaka}` | `{"bio":"Calm and patient with toddlers."}` | 200 |
| WK11 | Sunrise | `POST /workers/{Joy}/list` | | **409 `WORKER_NOT_VERIFIED`** (3 of 4 checks) |
| WK12 | Sunrise | `POST /workers/{WK3 worker}/list` | | 409 `WORKER_NOT_VERIFIED` |
| WK13 | Sunrise | `POST /workers/{Fatima}/delist` | | 200, `delisted` |
| WK14 | Sunrise | `POST /workers/{Fatima}/list` | | 200, `listed` |
| WK15 | Ada | `GET /workers` | | 403 `FORBIDDEN` |
| WK16 | Sunrise | `POST /workers/{Halima}/list` | | 409 `WORKER_NOT_VERIFIED` (expired check) |

## 4. Verification and documents

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| VF1 | Sunrise | `GET /workers/{Joy}/verification` | | 200, list of 4 checks with document metadata (no URLs) |
| VF2 | Kano | `GET /workers/{Joy}/verification` | | 404 `NOT_FOUND` |
| VF3 | Sunrise | `PATCH /workers/{Joy}/verification/address` | `{"status":"verified"}` | 200 |
| VF4 | Sunrise | `POST /workers/{Joy}/list` | | **200, listed** (now 4/4) |
| VF5 | Sunrise | `PATCH /workers/{Tobi}/verification/id` | `{"status":"verified"}` | 409 `ILLEGAL_TRANSITION` (not started, no evidence) |
| VF6 | Sunrise | `PATCH /workers/{Tobi}/verification/id` | `{"details":{"document_type":"NIN slip"}}` | 200 |
| VF7 | Sunrise | `PATCH /workers/{Emeka}/verification/id` | `{"status":"rejected"}` (no reason) | 422 `VALIDATION_ERROR` |
| VF8 | Sunrise | `POST /uploads/signature` | `{"purpose":"verification_doc","worker_id":"<Tobi>","kind":"id"}` | 200, signed Cloudinary params |
| VF9 | Sunrise | `POST /uploads/signature` | `{"purpose":"worker_photo","worker_id":"<Tobi>"}` | 200 |
| VF10 | Kano | `POST /uploads/signature` | as VF8 | 404 `NOT_FOUND` |
| VF11 | Sunrise | `POST /workers/{Tobi}/verification/id/documents` | `{"public_id":"workers/docs/not-a-real-upload"}` | 422 `VALIDATION_ERROR` (Cloudinary has no such file) |
| VF12 | Sunrise | `GET /workers/{Emeka}/verification` | | 200 (the document IDs used below) |
| DOC1 | Sunrise | `GET /documents/{Emeka ID doc}/url` | | 200, short-lived signed URL (opening it shows Cloudinary's not-found: seeded files are metadata only) |
| DOC2 | Ada | `GET /documents/{Emeka ID doc}/url` | | 404 (families never see documents) |
| DOC3 | Kano | `GET /documents/{Emeka ID doc}/url` | | 404 |
| DOC4 | Admin | `GET /documents/{Emeka ID doc}/url` | | 200 |
| VF13 | Sunrise | `DELETE /workers/{Emeka}/verification/guarantor/documents/{guarantor doc}` | | 204 |
| VF14 | Sunrise | `DELETE /workers/{Emeka}/verification/id/documents/{ID doc}` | | 204 |

A real upload (VF8 → upload to Cloudinary → attach with the returned `public_id` → 201) can't be done from
Swagger alone. Test it through the web app at B7.

## 5. Requests and proposals (rule 2)

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| RQ1 | Ada | `POST /requests` | `{"role":"nanny","schedule":"full_time","live_in":false,"state":"Lagos","lga":"Ikeja","start_date":"2026-11-01","trial_days":14,"title":"Swagger test nanny","description":"A test request created from the Swagger plan.","budget_min_kobo":7000000,"budget_max_kobo":10000000}` | 201 (keep the `id`) |
| RQ2 | Ada | `POST /requests` | `title:"x"`, `trial_days:3` | 422 `VALIDATION_ERROR` |
| RQ3 | Sunrise | `POST /requests` | RQ1 body | 403 `FORBIDDEN` |
| RQ4 | Ada | `GET /requests` | | 200, own requests |
| RQ5 | Sunrise | `GET /requests` | | 200, open requests for its roles in Lagos |
| RQ6 | Ada | `GET /requests/{Ada nanny request}` | | 200 |
| RQ7 | Bola | `GET /requests/{Ada nanny request}` | | 404 |
| RQ8 | Sunrise | `GET /requests/{Ada nanny request}` | | 200 |
| PR1 | Sunrise | `POST /requests/{Ada nanny request}/proposals` | `{"worker_id":"<Blessing>"}` | **409 `WORKER_UNAVAILABLE`** (already on trial) |
| PR2 | Sunrise | same | `{"worker_id":"<Joy>","note":"Joy is great with toddlers."}` | 201 (keep the `id`) |
| PR3 | Sunrise | same | `{"worker_id":"<Joy>"}` | 409 `ALREADY_PROPOSED` |
| PR4 | Sunrise | same | `{"worker_id":"<Tobi>"}` | 409 `WORKER_NOT_LISTED` |
| PR5 | Kano | same | `{"worker_id":"<Zainab>"}` | 404 (request is outside Kano's state) |
| PR6 | Sunrise | `GET /requests/{Ada nanny request}/proposals` | | 200, its own proposals |
| PR7 | Ada | same | | 200, all except withdrawn |
| PR8 | Ada | `GET /workers/{Joy}/public` | | 200 (proposed to Ada) |
| PR9 | Bola | `GET /workers/{Joy}/public` | | 404 |
| PR10 | Sunrise | `GET /workers/{Joy}/public` | | 403 `FORBIDDEN` |
| PR11 | Sunrise | `POST /proposals/{PR2 id}/withdraw` | | 200 |
| PR12 | Sunrise | same | | 409 `ILLEGAL_TRANSITION` |
| PR13 | Sunrise | `POST /requests/{Bola cleaner request}/proposals` | `{"worker_id":"<Fatima>"}` | 201 (re-proposing a withdrawn worker is allowed) |
| PR14 | Ada | `POST /proposals/{PR13 id}/decline` | | 404 (not Ada's request) |
| PR15 | Bola | `POST /proposals/{PR13 id}/decline` | | 200 |
| PR16 | Ada | `POST /proposals/{Amaka → Ada}/accept` | header `Idempotency-Key: <any UUID>` | Designed: 201 with the placement (`pending_payment`) and a checkout link. **Now: 502 `PAYMENT_PROVIDER_ERROR`** (known issue 1), but the placement is still created |
| PR17 | Ada | same, same key | | 409 `REQUEST_NOT_OPEN` (known issue 3) |
| PR19 | Sunrise | `POST /requests/{RQ1 id}/proposals` | `{"worker_id":"<Amaka>"}` | **409 `WORKER_UNAVAILABLE`** (Amaka is held) |
| RQ9 | Ada | `POST /requests/{RQ1 id}/cancel` | | 200 |
| RQ10 | Ada | same | | 409 `REQUEST_NOT_OPEN` |
| RQ11 | Bola | `POST /requests/{Ada nanny request}/cancel` | | 404 |

## 6. Placements

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| PL1 | Ada | `GET /placements` | | 200, own placements with `allowed_actions` |
| PL2 | Sunrise | `GET /placements` | `status=trial` | 200 |
| PL3 | Admin | `GET /placements` | | 200, all |
| PL4 | Ada | `GET /placements/{Blessing}` | | 200 |
| PL5 | Bola | `GET /placements/{Blessing}` | | 404 |
| PL6 | Kano | `GET /placements/{Blessing}` | | 404 |
| PY1 | Bola | `POST /placements/{Grace}/pay` | header `Idempotency-Key` | Designed: 200 with the checkout link. **Now: 502** (known issue 1) |
| PY2 | Ada | `POST /placements/{Grace}/pay` | | 404 |
| PY3 | Ada | `POST /placements/{Blessing}/pay` | | 409 `ILLEGAL_TRANSITION` (already paid) |
| PL7 | Bola | `POST /placements/{Grace}/cancel` | `{"reason":"Changed our plans."}` | 200, `cancelled`, Grace released |
| PL8 | Bola | same | `{"reason":"Again, please."}` | 409 `ILLEGAL_TRANSITION` |
| PL9 | Sunrise | `POST /placements/{Blessing}/confirm` | | 403 `FORBIDDEN` (only the family confirms) |
| PL10 | Ada | `POST /placements/{Blessing}/confirm` | header `Idempotency-Key` | 200, `confirmed` |
| PL11 | Ada | same, new key | | 409 `ILLEGAL_TRANSITION` |
| PL12 | Ada | `POST /placements/{Musa}/replacement` | `{"reason":"Need someone else."}` | 409 `ILLEGAL_TRANSITION` (ended) |
| PL13 | Ada | `POST /placements/{Blessing}/replacement` | `{"reason":"Schedules no longer match."}` | 200 (inside the 30-day window) |
| PL14 | Sunrise | `POST /placements/{Chinedu}/end` | `{"reason":"Worker moved away."}` | 200, `ended` |
| PL15 | Bola | same | `{"reason":"Again, please."}` | 409 `ILLEGAL_TRANSITION` |

Reasons must be at least 5 characters (422 otherwise).

## 7. Payments and billing

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| PY4 | Ada | `GET /payments` | | 200, Ada's placement fees |
| PY5 | Sunrise | `GET /payments` | | 200, subscription payments |
| PY6 | Ada | `GET /payments/HV-SEED-PF-BLESSING/verify` | | 200, `status: success`, `refund_status: none` |
| PY7 | Bola | same | | 404 (only the payer) |
| BI1 | Sunrise | `GET /billing/subscription` | | 200 |
| BI2 | Ada | `GET /billing/subscription` | | 403 `FORBIDDEN` |
| BI3 | Sunrise | `POST /billing/subscription` | | Designed: 200 with the checkout link. **Now: 502** (known issue 1) |
| WH1 | — | `POST /webhooks/paystack` | any body, no signature | 401 `UNAUTHENTICATED`. Hidden from Swagger: send it with curl, or use Paystack's dashboard for a signed test event |

## 8. Families and notifications

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| FA1 | Ada | `GET /families/me` | | 200 |
| FA2 | Ada | `GET /families/me/dashboard` | | 200, active placements and open requests |
| FA3 | Sunrise | `GET /families/me` | | 403 `FORBIDDEN` |
| FA4 | New family | `GET /families/me` | | 200 |
| NT1 | Ada | `GET /notifications` | | 200 (keep an item `id`) |
| NT2 | Ada | `GET /notifications` | `unread_only=true` | 200 |
| NT3 | Ada | `POST /notifications/{id}/read` | | 200 |
| NT4 | Bola | `POST /notifications/{Ada's id}/read` | | 404 |
| NT5 | Ada | `POST /notifications/read-all` | | 200 |

## 9. Admin

| ID | As | Request | Body / params | Expect |
| --- | --- | --- | --- | --- |
| AD1 | Admin | `GET /admin/overview` | | 200 |
| AD2 | Ada | `GET /admin/overview` | | 403 `FORBIDDEN` |
| AD3 | Admin | `GET /admin/agencies` | `status=pending` | 200 (Bright Hands, Swagger Test Agency) |
| AD4 | Admin | `GET /admin/agencies/{Bright Hands}` | | 200 |
| AD5 | Admin | `POST /admin/agencies/{Bright Hands}/approve` | `{}` | 200 |
| AD6 | Admin | same | `{}` | 409 `ILLEGAL_TRANSITION` |
| AD7 | Admin | `POST /admin/agencies/{Harbour}/reinstate` | `{}` | 200 |
| AD8 | Admin | `POST /admin/agencies/{Kano}/suspend` | `{}` | 422 (reason required) |
| AD9 | Admin | same | `{"reason":"Testing suspension."}` | 200 |
| AD10 | Admin | `POST /admin/agencies/{Kano}/reinstate` | `{}` | 200 |
| AD11 | Admin | `POST /admin/agencies/{Kano}/explode` | `{}` | 404 (unknown action) |
| AD13 | Admin | `POST /admin/agencies/{Swagger Test Agency}/reject` | `{"reason":"CAC number does not match."}` | 200 |
| AD14 | Admin | `GET /admin/workers` | `listing_status=listed` | 200 |
| AD15 | Admin | `GET /admin/workers/{Zainab}` | | 200 |
| AD16 | Admin | `POST /admin/workers/{Zainab}/flag` | `{"kind":"guarantor","reason":"Guarantor letter looks altered."}` | 200, Zainab delisted |
| AD17 | Admin | `POST /admin/workers/{Tobi}/flag` | `{"kind":"address","reason":"Address not verified yet."}` | 409 `ILLEGAL_TRANSITION` (only verified checks can be flagged) |
| AD18 | Admin | `GET /admin/audit-log` | | 200, newest first (includes AD5–AD16) |
| AD19 | Admin | `GET /admin/audit-log` | `action=agency_approved` | 200 |
| AD20 | Sunrise | `GET /admin/workers` | | 403 `FORBIDDEN` |
| AD21 | Admin | `GET /admin/alerts` | `state=open` | 200 (empty on a fresh seed); `GET /admin/overview` shows `open_alerts` |
| AD22 | Ada | `GET /admin/alerts` | | 403 `FORBIDDEN` |
| AD23 | Admin | `POST /admin/alerts/{unknown id}/resolve` | `{"note":"Checked."}` | 404 |
| AD24 | Admin | `POST /admin/alerts/{id}/resolve` | `{"note":""}` | 422 (note required). Alerts only exist after a payment problem, so AD24 needs a test-mode late payment first |

## Not testable from Swagger

- **Google sign-in end to end:** needs a browser redirect to Google (owner input #6b, B7).
- **Real document upload:** the file goes straight from the browser to Cloudinary.
- **Signed Paystack webhooks and completed payments:** need Paystack's checkout page and dashboard.
- **Concurrency of rule 2:** two accepts at the same moment. Covered by
  `uv run pytest tests/concurrency -q`.
- **Scheduled jobs:** run one by hand with `uv run python -m app.jobs run <name>`, e.g. `expire_holds` after
  the Grace hold lapses.
