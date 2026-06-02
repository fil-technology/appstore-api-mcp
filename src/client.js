import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { importPKCS8, SignJWT } from "jose";

const BASE_URL = "https://api.appstoreconnect.apple.com";

/**
 * Thin client for the App Store Connect API.
 * Handles ES256 JWT minting (cached until shortly before expiry) and
 * exposes request helpers plus a multi-step screenshot uploader.
 */
export class AppStoreConnectClient {
  constructor({ keyId, issuerId, privateKeyPath, privateKey, privateKeyBase64 }) {
    if (!keyId) throw new Error("ASC_KEY_ID is required");
    if (!issuerId) throw new Error("ASC_ISSUER_ID is required");
    this.keyId = keyId;
    this.issuerId = issuerId;
    // Accept the .p8 key three ways, in priority order:
    //   1. inline PEM text          (ASC_PRIVATE_KEY)
    //   2. base64-encoded PEM       (ASC_PRIVATE_KEY_BASE64) — easiest for env vars
    //   3. path to the .p8 file     (ASC_PRIVATE_KEY_PATH)
    this._pem =
      privateKey ||
      (privateKeyBase64
        ? Buffer.from(privateKeyBase64, "base64").toString("utf8")
        : null) ||
      (privateKeyPath ? readFileSync(privateKeyPath, "utf8") : null);
    if (!this._pem)
      throw new Error(
        "Provide the API key via ASC_PRIVATE_KEY_PATH, ASC_PRIVATE_KEY, or ASC_PRIVATE_KEY_BASE64",
      );
    this._token = null;
    this._tokenExp = 0;
  }

  async _getToken() {
    const now = Math.floor(Date.now() / 1000);
    // Reuse token while it still has >60s of life.
    if (this._token && now < this._tokenExp - 60) return this._token;
    const key = await importPKCS8(this._pem, "ES256");
    const exp = now + 19 * 60; // App Store Connect caps token life at 20 min.
    this._token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.keyId, typ: "JWT" })
      .setIssuedAt(now)
      .setIssuer(this.issuerId)
      .setExpirationTime(exp)
      .setAudience("appstoreconnect-v1")
      .sign(key);
    this._tokenExp = exp;
    return this._token;
  }

  /**
   * Core request. `path` may be a full URL (e.g. a paging `next` link) or a
   * path relative to the API root, with or without the leading /v1.
   */
  _buildUrl(path, query) {
    let url;
    if (/^https?:\/\//.test(path)) {
      url = new URL(path);
    } else {
      const clean = path.startsWith("/") ? path : `/${path}`;
      const withVersion = clean.startsWith("/v1") || clean.startsWith("/v2")
        ? clean
        : `/v1${clean}`;
      url = new URL(BASE_URL + withVersion);
    }
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }
    }
    return url;
  }

  async request(method, path, { query, body } = {}) {
    const token = await this._getToken();
    const url = this._buildUrl(path, query);
    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(url, { method, headers, body: payload });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const detail =
        data && data.errors
          ? data.errors
              .map((e) => `${e.status} ${e.code}: ${e.title} — ${e.detail}`)
              .join("; ")
          : typeof data === "string"
            ? data
            : JSON.stringify(data);
      const err = new Error(
        `App Store Connect ${method} ${url.pathname} failed: ${res.status} ${res.statusText} — ${detail}`,
      );
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  get(path, query) {
    return this.request("GET", path, { query });
  }
  post(path, body) {
    return this.request("POST", path, { body });
  }
  patch(path, body) {
    return this.request("PATCH", path, { body });
  }
  delete(path) {
    return this.request("DELETE", path);
  }

  /** Follow `links.next` and concatenate `data` arrays up to `maxPages`. */
  async getAll(path, query, maxPages = 20) {
    let page = await this.get(path, query);
    const all = Array.isArray(page.data) ? [...page.data] : [];
    let pages = 1;
    while (page.links && page.links.next && pages < maxPages) {
      page = await this.request("GET", page.links.next);
      if (Array.isArray(page.data)) all.push(...page.data);
      pages++;
    }
    return all;
  }

  /** True if the buffer starts with the gzip magic bytes. */
  static _isGzip(buf) {
    return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  }

  /**
   * GET a report endpoint (salesReports / financeReports) that returns a
   * gzip-compressed TSV. Returns the decompressed text. On error, the API
   * sends JSON instead of gzip — surfaced as a readable Error.
   */
  async getReport(path, query) {
    const token = await this._getToken();
    const url = this._buildUrl(path, query);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      let detail = buf.toString("utf8");
      try {
        const j = JSON.parse(detail);
        if (j.errors)
          detail = j.errors
            .map((e) => `${e.status} ${e.code}: ${e.title} — ${e.detail}`)
            .join("; ");
      } catch {
        /* leave detail as text */
      }
      const err = new Error(
        `App Store Connect report ${url.pathname} failed: ${res.status} ${res.statusText} — ${detail}`,
      );
      err.status = res.status;
      throw err;
    }
    return AppStoreConnectClient._isGzip(buf)
      ? gunzipSync(buf).toString("utf8")
      : buf.toString("utf8");
  }

  /** Download a (possibly gzipped) report/segment file from a pre-signed URL. */
  async downloadUrl(url) {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok)
      throw new Error(`Download failed (${res.status}) for ${url}`);
    return AppStoreConnectClient._isGzip(buf)
      ? gunzipSync(buf).toString("utf8")
      : buf.toString("utf8");
  }

  /** Parse TSV/CSV text into an array of row objects. Auto-detects delimiter. */
  static parseDelimited(text, delimiter) {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return { columns: [], rows: [] };
    const d = delimiter || (lines[0].includes("\t") ? "\t" : ",");
    const columns = lines[0].split(d);
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(d);
      const row = {};
      columns.forEach((c, i) => (row[c] = cells[i]));
      return row;
    });
    return { columns, rows };
  }

  /**
   * Upload an image to a freshly-reserved upload-asset (screenshot or preview).
   * `uploadOperations` come from the reservation's attributes.
   */
  async uploadAsset(uploadOperations, fileBuffer) {
    for (const op of uploadOperations) {
      const chunk = fileBuffer.subarray(op.offset, op.offset + op.length);
      const headers = {};
      for (const h of op.requestHeaders || []) headers[h.name] = h.value;
      const res = await fetch(op.url, {
        method: op.method,
        headers,
        body: chunk,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(
          `Asset chunk upload failed (${op.method} ${op.url}): ${res.status} ${t}`,
        );
      }
    }
  }

  static md5(buffer) {
    return createHash("md5").update(buffer).digest("hex");
  }
}
