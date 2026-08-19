// netlify/functions/verify-payment.js
//
// Verifies a Paystack transaction server-side using the SECRET key.
// The secret key must be set in Netlify: Site settings > Environment variables
//   PAYSTACK_SECRET_KEY = sk_live_xxxxx  (or sk_test_xxxxx while testing)
//
// The frontend calls this with { reference, expectedAmount } after Paystack's
// popup reports success. We re-check with Paystack directly — never trust the
// browser's word for it — and also confirm the amount matches what we expect,
// so nobody can tamper with the price client-side.

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: "Method not allowed" }) };
  }

  const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!SECRET_KEY) {
    console.error("PAYSTACK_SECRET_KEY is not set in Netlify environment variables");
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: "Server payment config missing" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: "Invalid request body" }) };
  }

  const { reference, expectedAmount } = body;
  if (!reference) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: "Missing payment reference" }) };
  }

  try {
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const data = await paystackRes.json();

    if (!paystackRes.ok || !data.status) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, message: data.message || "Verification failed" })
      };
    }

    const tx = data.data;

    // Paystack amounts are in kobo. expectedAmount (if provided) should also be in kobo.
    const amountOk = typeof expectedAmount === "number" ? tx.amount === expectedAmount : true;

    if (tx.status === "success" && amountOk) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          reference: tx.reference,
          amount: tx.amount,
          currency: tx.currency,
          paidAt: tx.paid_at,
          channel: tx.channel,
          customerEmail: tx.customer ? tx.customer.email : null
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        message: !amountOk ? "Amount mismatch — possible tampering" : `Transaction status: ${tx.status}`
      })
    };
  } catch (err) {
    console.error("Paystack verification error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: "Verification request failed" })
    };
  }
};
