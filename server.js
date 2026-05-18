const express = require("express");
const cors = require("cors");
require("dotenv").config();

const Stripe = require("stripe");
const { Resend } = require("resend");
const PDFDocument = require("pdfkit");
const twilio = require("twilio");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const smsClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://future-limo.com",
      "https://www.future-limo.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.send("✅ Future Limo backend running");
});

function createInvoicePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 45 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      doc.fontSize(24).text("FUTURE LIMOUSINE", { align: "center" });
      doc.fontSize(10).text("future-limo.com | 226-989-6216", {
        align: "center",
      });

      doc.moveDown(2);
      doc.fontSize(30).text("INVOICE", { align: "center" });
      doc.moveDown();

      doc.fontSize(12).text(
        `Invoice Date: ${new Date().toLocaleDateString("en-CA")}`,
        { align: "right" }
      );

      doc.moveDown();
      doc.fontSize(15).text("Prepared For");
      doc.fontSize(12).text(data.customerName || "Customer");
      doc.text(data.customerEmail || "");
      doc.text(data.customerPhone || "");

      doc.moveDown();
      doc.fontSize(15).text("Service Details");
      doc.fontSize(12).text(`Ride Type: ${data.rideType}`);
      doc.text(`Pickup: ${data.pickup}`);
      doc.text(`Drop-off: ${data.destination}`);
      doc.text(`Vehicle: ${data.vehicle}`);
      doc.text(`Date: ${data.bookingDate}`);
      doc.text(`Time: ${data.bookingTime}`);
      doc.text(`Distance: ${data.distanceKm} km`);
      doc.text(`Flight Number: ${data.flightNumber}`);
      doc.text(`Special Requests: ${data.specialRequests}`);

      doc.moveDown();
      doc.fontSize(15).text("Payment Summary");
      doc.fontSize(13).text(`Total Paid: $${data.totalPaid} CAD`);

      doc.moveDown(2);
      doc.fontSize(10).text("Thank you for choosing Future Limousine.", {
        align: "center",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Webhook error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;

      const customerName = paymentIntent.metadata.customerName || "Customer";
      const customerEmail = paymentIntent.metadata.customerEmail || "";
      const customerPhone = paymentIntent.metadata.customerPhone || "";
      const pickup = paymentIntent.metadata.pickup || "Not provided";
      const destination = paymentIntent.metadata.destination || "Not provided";
      const vehicle = paymentIntent.metadata.vehicle || "Not provided";
      const rideType = paymentIntent.metadata.rideType || "Not provided";
      const bookingDate = paymentIntent.metadata.bookingDate || "Not provided";
      const bookingTime = paymentIntent.metadata.bookingTime || "Not provided";
      const flightNumber = paymentIntent.metadata.flightNumber || "None";
      const specialRequests = paymentIntent.metadata.specialRequests || "None";
      const distanceKm = paymentIntent.metadata.distanceKm || "Not provided";
      const totalPaid = (paymentIntent.amount / 100).toFixed(2);

      try {
        const invoicePDF = await createInvoicePDF({
          customerName,
          customerEmail,
          customerPhone,
          pickup,
          destination,
          vehicle,
          rideType,
          bookingDate,
          bookingTime,
          flightNumber,
          specialRequests,
          distanceKm,
          totalPaid,
        });

        const invoiceAttachment = [
          {
            filename: "Future-Limo-Invoice.pdf",
            content: invoicePDF.toString("base64"),
          },
        ];

        if (customerEmail) {
          await resend.emails.send({
            from: "Future Limo <reservations@future-limo.com>",
            to: customerEmail,
            subject: "Your Future Limo Booking Confirmation",
            html: `
              <h2>Hi ${customerName},</h2>

              <p>Thank you for booking with Future Limo. Your payment has been received and your ride is now confirmed.</p>

              <h3>Your Booking Confirmation</h3>

              <p><strong>Pickup:</strong> ${pickup}</p>
              <p><strong>Drop-off:</strong> ${destination}</p>
              <p><strong>Vehicle:</strong> ${vehicle}</p>
              <p><strong>Ride Type:</strong> ${rideType}</p>
              <p><strong>Date:</strong> ${bookingDate}</p>
              <p><strong>Time:</strong> ${bookingTime}</p>
              <p><strong>Total Paid:</strong> $${totalPaid} CAD</p>

              <p>Your official PDF invoice is attached to this email for your records.</p>

              <p>If you need to update your booking, please reply to this email or contact us at reservations@future-limo.com.</p>

              <br />
              <p>Thank you,</p>
              <p><strong>Future Limo</strong></p>
            `,
            attachments: invoiceAttachment,
          });

          console.log("📧 Customer email with PDF invoice sent");
        }

        await resend.emails.send({
          from: "Future Limo <reservations@future-limo.com>",
          to: "reservations@future-limo.com",
          subject: "New Paid Booking - Future Limo",
          html: `
            <h1>New Paid Booking</h1>
            <p><strong>Name:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Phone:</strong> ${customerPhone}</p>
            <p><strong>Pickup:</strong> ${pickup}</p>
            <p><strong>Drop-off:</strong> ${destination}</p>
            <p><strong>Vehicle:</strong> ${vehicle}</p>
            <p><strong>Ride Type:</strong> ${rideType}</p>
            <p><strong>Date:</strong> ${bookingDate}</p>
            <p><strong>Time:</strong> ${bookingTime}</p>
            <p><strong>Distance:</strong> ${distanceKm} km</p>
            <p><strong>Flight Number:</strong> ${flightNumber}</p>
            <p><strong>Special Requests:</strong> ${specialRequests}</p>
            <p><strong>Total Paid:</strong> $${totalPaid} CAD</p>
            <p><strong>Payment ID:</strong> ${paymentIntent.id}</p>
          `,
          attachments: invoiceAttachment,
        });

        console.log("📧 Company email with PDF invoice sent");

        if (customerPhone) {
          try {
            await smsClient.messages.create({
              from: process.env.TWILIO_PHONE_NUMBER,
              to: customerPhone,
              body: `Hi ${customerName},

Your Future Limo booking is confirmed.

Pickup: ${pickup}
Drop-off: ${destination}
Date: ${bookingDate}
Time: ${bookingTime}

Total Paid: $${totalPaid} CAD

A confirmation email with your PDF invoice has been sent.

Questions: reservations@future-limo.com

Future Limo`,
            });

            console.log("📱 SMS confirmation sent");
          } catch (smsError) {
            console.error("❌ SMS failed:", smsError);
          }
        }

        console.log("✅ Booking confirmation flow completed");
      } catch (emailError) {
        console.error("❌ Email/PDF sending failed:", emailError);
      }
    }

    res.sendStatus(200);
  }
);

app.use(express.json());

app.post("/create-payment-intent", async (req, res) => {
  try {
    const {
      amount,
      customerName,
      customerEmail,
      customerPhone,
      pickup,
      destination,
      vehicle,
      rideType,
      bookingDate,
      bookingTime,
      flightNumber,
      specialRequests,
      distanceKm,
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).send({
        error: { message: "Invalid payment amount." },
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: "cad",
      receipt_email: customerEmail || undefined,
      automatic_payment_methods: { enabled: true },
      metadata: {
        customerName: customerName || "",
        customerEmail: customerEmail || "",
        customerPhone: customerPhone || "",
        pickup: pickup || "",
        destination: destination || "",
        vehicle: vehicle || "",
        rideType: rideType || "",
        bookingDate: bookingDate || "",
        bookingTime: bookingTime || "",
        flightNumber: flightNumber || "",
        specialRequests: specialRequests || "",
        distanceKm: distanceKm ? String(distanceKm) : "",
      },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("❌ Payment intent error:", error);
    res.status(400).send({
      error: { message: error.message },
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
