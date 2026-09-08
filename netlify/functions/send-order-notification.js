// Emails the store owner (fowestwurld@gmail.com) whenever a new order is placed.
// Uses Resend's shared sending address (onboarding@resend.dev), which works
// without owning a domain — but can ONLY deliver to the email address on the
// Resend account itself. That's fine here since the recipient is the owner's
// own inbox. Customer-facing emails need a verified domain and are not sent
// by this function.

const { Resend } = require("resend");

const OWNER_EMAIL = "fowestwurld@gmail.com";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set in Netlify environment variables.");
    return { statusCode: 500, body: JSON.stringify({ error: "Email service not configured." }) };
  }

  let order;
  try {
    order = JSON.parse(event.body).order;
    if (!order) throw new Error("Missing order in request body");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body." }) };
  }

  const resend = new Resend(apiKey);

  const itemsHtml = (order.items || [])
    .map(
      (it) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(it.name)} (Size ${escapeHtml(it.size)})</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${it.qty}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${formatNaira(it.price * it.qty)}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="margin-bottom:4px;">New Order — ${escapeHtml(order.orderNumber)}</h2>
      <p style="color:#666;margin-top:0;">${new Date(order.date).toLocaleString("en-NG")}</p>

      <h3>Customer</h3>
      <p style="margin:0;">${escapeHtml(order.customerName)}<br/>
      ${escapeHtml(order.phone)}<br/>
      ${order.email ? escapeHtml(order.email) + "<br/>" : ""}
      ${escapeHtml(order.address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.state)}</p>

      <h3>Items</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333;">Item</th>
            <th style="text-align:center;padding:6px 10px;border-bottom:2px solid #333;">Qty</th>
            <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #333;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <table style="width:100%;margin-top:10px;">
        <tr><td>Subtotal</td><td style="text-align:right;">${formatNaira(order.subtotal)}</td></tr>
        <tr><td>Delivery</td><td style="text-align:right;">${formatNaira(order.deliveryFee)}</td></tr>
        <tr><td style="font-weight:bold;padding-top:6px;">Total</td><td style="text-align:right;font-weight:bold;padding-top:6px;">${formatNaira(order.total)}</td></tr>
      </table>

      <p style="margin-top:20px;"><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod)}<br/>
      <strong>Payment status:</strong> ${escapeHtml(order.paymentStatus)}</p>

      ${order.instructions ? `<p><strong>Instructions:</strong> ${escapeHtml(order.instructions)}</p>` : ""}
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: "Fowest Wurld Orders <onboarding@resend.dev>",
      to: [OWNER_EMAIL],
      subject: `New Order ${order.orderNumber} — ${formatNaira(order.total)}`,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return { statusCode: 502, body: JSON.stringify({ error: "Failed to send email.", detail: error }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, id: data.id }) };
  } catch (e) {
    console.error("Unexpected error sending order notification:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected error.", detail: e.message || String(e) }) };
  }
};

function formatNaira(n) {
  const num = Number(n) || 0;
  return "₦" + num.toLocaleString("en-NG");
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
