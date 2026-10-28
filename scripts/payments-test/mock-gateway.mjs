// A stand-in for Safaricom Daraja and Flutterwave, for tests. No real money, no network.
// Point the app at it with MPESA_BASE_URL and FLUTTERWAVE_BASE_URL (see run.sh).
// Control endpoints:  POST /__set  {kind:"mpesa"|"flw", ref, result}
//   mpesa result: "0" success | "1032" cancelled by user | "pending"
//   flw result:   "successful" | "failed" | "pending", optional amount, currency
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const KEY = process.env.MOCK_MPESA_KEY || "ck";
const SECRET = process.env.MOCK_MPESA_SECRET || "cs";
const FLW_SECRET = process.env.MOCK_FLW_SECRET || "FLWSECK_TEST";

const mpesa = new Map(); // checkoutRequestId -> result
const flw = new Map(); // tx_ref -> {result, amount, currency}
let seq = 0;
const requests = [];

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
    });
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const auth = req.headers.authorization || "";
    const body = req.method === "POST" ? await readBody(req) : {};
    requests.push({ method: req.method, path: url.pathname, body });

    if (url.pathname === "/__requests") return json(res, 200, requests);
    if (url.pathname === "/__set") {
      if (body.kind === "mpesa") mpesa.set(body.ref, body.result);
      else flw.set(body.ref, { result: body.result, amount: body.amount, currency: body.currency });
      return json(res, 200, { ok: true });
    }

    // ---- Daraja ----
    if (url.pathname === "/oauth/v1/generate") {
      const ok = auth === "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64");
      return ok ? json(res, 200, { access_token: "mock-token", expires_in: "3599" }) : json(res, 400, { errorMessage: "Bad credentials" });
    }
    if (url.pathname === "/mpesa/stkpush/v1/processrequest") {
      if (auth !== "Bearer mock-token") return json(res, 401, { errorMessage: "Invalid token" });
      if (!body.CallBackURL || !/^2547\d{8}$|^2541\d{8}$/.test(String(body.PhoneNumber))) return json(res, 400, { errorMessage: "Bad request" });
      const id = `ws_CO_mock_${++seq}`;
      mpesa.set(id, "pending");
      return json(res, 200, { MerchantRequestID: `m${seq}`, CheckoutRequestID: id, ResponseCode: "0", ResponseDescription: "Success", CustomerMessage: "Success. Request accepted for processing" });
    }
    if (url.pathname === "/mpesa/stkpushquery/v1/query") {
      if (auth !== "Bearer mock-token") return json(res, 401, { errorMessage: "Invalid token" });
      const r = mpesa.get(body.CheckoutRequestID);
      if (r === undefined || r === "pending") return json(res, 500, { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" });
      return json(res, 200, { ResponseCode: "0", ResultCode: r, ResultDesc: r === "0" ? "The service request is processed successfully." : "Request cancelled by user" });
    }

    // ---- Flutterwave ----
    if (url.pathname.startsWith("/v3/")) {
      if (auth !== `Bearer ${FLW_SECRET}`) return json(res, 401, { status: "error", message: "Invalid authorization key" });
      if (url.pathname === "/v3/banks/KE") return json(res, 200, { status: "success", data: [] });
      if (url.pathname === "/v3/payments") {
        flw.set(body.tx_ref, flw.get(body.tx_ref) ?? { result: "pending", amount: body.amount, currency: body.currency });
        const e = flw.get(body.tx_ref);
        if (!e.amount) e.amount = body.amount;
        if (!e.currency) e.currency = body.currency;
        return json(res, 200, { status: "success", data: { link: `https://checkout.flutterwave.test/pay/${body.tx_ref}` } });
      }
      if (url.pathname === "/v3/transactions/verify_by_reference") {
        const e = flw.get(url.searchParams.get("tx_ref"));
        if (!e) return json(res, 404, { status: "error", message: "No transaction was found for this id" });
        return json(res, 200, { status: "success", data: { status: e.result, amount: e.amount, currency: e.currency, flw_ref: `FLW-${url.searchParams.get("tx_ref")}`, processor_response: e.result === "failed" ? "Declined" : "Approved" } });
      }
    }
    json(res, 404, { error: "not found" });
  })
  .listen(PORT, () => console.log(`[mock-gateway] listening on ${PORT}`));
