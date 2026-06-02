# Analytics, sales & finance — setup

The reporting tools (`get_sales_report`, `get_subscription_report`,
`get_finance_report`, and the `*_analytics_report*` tools) pull **downloads,
proceeds, subscriptions, retention, and engagement** from App Store Connect.

They have **two requirements** that the metadata tools don't:

## 1. A key with the right role (App Manager is NOT enough)

Apple gates report APIs behind specific roles. An **App Manager** key — perfect
for keywords/descriptions/screenshots — returns **`403 FORBIDDEN`** for reports.
The tools detect this and append a hint telling you exactly what's wrong.

| Report | Role the API key needs |
| --- | --- |
| Sales & subscriptions (`get_sales_report`, `get_subscription_report`) | **Admin**, **Finance**, or **Sales** |
| Finance (`get_finance_report`) | **Admin** or **Finance** |
| Analytics Reports API (`request_analytics_report`, …) | **Admin** |

**What to do:** generate a *separate* API key with the needed role in
**App Store Connect → Users and Access → Integrations → App Store Connect API**
(click **+**, pick e.g. **Sales** or **Admin**). You can keep your App Manager
key for metadata and use the report key only for analytics — see
[Using two keys](#using-two-keys) below.

## 2. Your Vendor Number (for sales & finance)

Sales and finance reports are scoped to a **Vendor Number** — an 8–9 digit ID,
**not** the same as your Key ID or Issuer ID.

- Find it in **App Store Connect → Payments and Financial Reports** (or **Sales
  and Trends**) — it's the **Vendor #** shown at the top:

![Where to find the Vendor Number in App Store Connect → Payments and Financial Reports](https://raw.githubusercontent.com/fil-technology/appstore-api-mcp/main/assets/where-to-find-vendor-number.png)

- Provide it either way:
  - **Per call:** pass `vendorNumber` in the tool arguments, or
  - **Globally:** set the `ASC_VENDOR_NUMBER` environment variable in your MCP config.

(The Analytics Reports API — downloads/sessions/engagement — does **not** need a
Vendor Number, only the Admin role.)

## Using two keys

Keep your metadata key and add a report-capable one as a second MCP server:

```bash
# metadata (App Manager) — your existing one
claude mcp add appstore-api --scope user \
  --env ASC_KEY_ID=METADATA_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_ID \
  --env ASC_PRIVATE_KEY_PATH=/path/to/metadata.p8 \
  -- npx -y appstore-api-mcp

# reports (Admin/Finance/Sales) + vendor number
claude mcp add appstore-reports --scope user \
  --env ASC_KEY_ID=REPORT_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_ID \
  --env ASC_PRIVATE_KEY_PATH=/path/to/report.p8 \
  --env ASC_VENDOR_NUMBER=12345678 \
  -- npx -y appstore-api-mcp
```

(For other clients, add a second entry in the `mcpServers` block with its own env.)

## Examples

```jsonc
// Yesterday's units & proceeds
{ "name": "get_sales_report",
  "arguments": { "frequency": "DAILY", "reportType": "SALES", "reportDate": "2026-06-01" } }

// Active subscribers snapshot
{ "name": "get_subscription_report",
  "arguments": { "kind": "ACTIVE", "reportDate": "2026-06-01" } }

// Subscription events (subscribe/cancel/renew) for retention analysis
{ "name": "get_subscription_report",
  "arguments": { "kind": "EVENTS", "reportDate": "2026-06-01" } }

// Monthly proceeds, consolidated across regions
{ "name": "get_finance_report",
  "arguments": { "regionCode": "ZZ", "reportDate": "2026-05" } }
```

For downloads/sessions/engagement (Analytics Reports API), the flow is async:

1. `request_analytics_report` with your `appId` → returns a request id
2. wait (minutes–hours while Apple generates it)
3. `list_analytics_reports` (filter by `category`) → pick a report id
4. `list_analytics_report_instances` → pick an instance id
5. `get_analytics_report_data` → parsed rows

## Troubleshooting

| Error | Meaning / fix |
| --- | --- |
| `403 ... does not allow this request` | Key role too low — use an Admin/Finance/Sales key (see table above). |
| `vendorNumber is required` | Pass `vendorNumber` or set `ASC_VENDOR_NUMBER`. |
| Report errors / empty | The date may have no data yet (reports lag ~1 day), or the `frequency`/`reportDate` format don't match (DAILY=`YYYY-MM-DD`, MONTHLY=`YYYY-MM`). |
| Analytics instance has no segments | Still processing — try `get_analytics_report_data` again later. |
