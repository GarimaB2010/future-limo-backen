// ==========================================
// FUTURE LIMO STRIPE BACKEND
// ==========================================

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

// ==========================================
// CORS
// ==========================================

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

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.send("✅ Future Limo backend running");
});

// ==========================================
// STRIPE WEBHOOK - MUST BE BEFORE express.json()
// ==========================================

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
        if (customerEmail) {
          await resend.emails.send({
            from: "Future Limo <reservations@future-limo.com>",
            to: customerEmail,
            subject: "Your Future Limo Booking Confirmation",
            html: `
              <h1>Booking Confirmed</h1>
              <p>Thank you for booking with Future Limo.</p>

              <h3>Trip Details</h3>
              <p><strong>Name:</strong> ${customerName}</p>
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

              <br />
              <p>We look forward to serving you.</p>
              <p>Future Limo</p>
            `,
          });
        }

        await resend.emails.send({
          from: "Future Limo <reservations@future-limo.com>",
          to: "reservations@future-limo.com",
          subject: "New Paid Booking - Future Limo",
          html: `
            <h1>New Paid Booking</h1>

            <h3>Customer Details</h3>
            <p><strong>Name:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Phone:</strong> ${customerPhone}</p>

            <h3>Trip Details</h3>
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

            <br />
            <p>Payment ID: ${paymentIntent.id}</p>
          `,
        });

        console.log("📧 Booking emails sent");
      } catch (emailError) {
        console.error("❌ Email sending failed:", emailError);
      }
    }

    res.sendStatus(200);
  }
);

// ==========================================
// JSON ROUTES
// ==========================================

app.use(express.json());

// ==========================================
// CREATE PAYMENT INTENT
// ==========================================

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
        error: {
          message: "Invalid payment amount.",
        },
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: "cad",
      receipt_email: customerEmail || undefined,

      automatic_payment_methods: {
        enabled: true,
      },

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
      error: {
        message: error.message,
      },
    });
  }
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
