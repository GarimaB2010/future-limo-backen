const express = require('express');
const cors = require('cors');
require('dotenv').config();

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

// ==========================================
// CORS
// ==========================================

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://future-limo.com'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/', (req, res) => {
  res.send('✅ Future Limo backend running');
});

// ==========================================
// WEBHOOK ROUTE
// MUST COME BEFORE express.json()
// ==========================================

app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (request, response) => {

    const sig = request.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {

      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        endpointSecret
      );

    } catch (err) {

      console.error(`❌ Webhook Error: ${err.message}`);

      return response.status(400).send(
        `Webhook Error: ${err.message}`
      );
    }

    // ==========================================
    // PAYMENT SUCCESS
    // ==========================================

    if (event.type === 'payment_intent.succeeded') {

      const paymentIntent = event.data.object;

      console.log(
        `✅ Payment succeeded: ${paymentIntent.amount / 100} CAD`
      );

      try {

        await resend.emails.send({
          from: 'Future Limo <onboarding@resend.dev>',
          to: paymentIntent.metadata.customerEmail,
          subject: 'Future Limo Booking Confirmation',
          html: `
            <h1>Booking Confirmed</h1>

            <p>Thank you for booking with Future Limo.</p>

            <h3>Trip Details</h3>

            <p>
              <strong>Name:</strong>
              ${paymentIntent.metadata.customerName}
            </p>

            <p>
              <strong>Pickup:</strong>
              ${paymentIntent.metadata.pickup}
            </p>

            <p>
              <strong>Destination:</strong>
              ${paymentIntent.metadata.destination}
            </p>

            <p>
              <strong>Vehicle:</strong>
              ${paymentIntent.metadata.vehicle}
            </p>

            <p>
              <strong>Date:</strong>
              ${paymentIntent.metadata.bookingDate}
            </p>

            <p>
              <strong>Total Paid:</strong>
              $${paymentIntent.amount / 100} CAD
            </p>

            <br />

            <p>We look forward to serving you.</p>

            <p>Future Limo</p>
          `
        });

        console.log('📧 Confirmation email sent');

      } catch (emailError) {

        console.error(
          '❌ Email sending failed:',
          emailError
        );
      }

    }

    // ==========================================
    // PAYMENT FAILED
    // ==========================================

    else if (event.type === 'payment_intent.payment_failed') {

      const paymentIntent = event.data.object;

      console.log(
        `❌ Payment failed: ${paymentIntent.amount / 100} CAD`
      );
    }

    response.sendStatus(200);
  }
);

// ==========================================
// NORMAL JSON ROUTES
// ==========================================

app.use(express.json());

// ==========================================
// CREATE PAYMENT INTENT
// ==========================================

app.post('/create-payment-intent', async (req, res) => {

  try {

    const {
      amount,
      customerName,
      customerEmail,
      pickup,
      destination,
      vehicle,
      bookingDate
    } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({

      amount: Math.round(amount * 100),

      currency: 'cad',

      automatic_payment_methods: {
        enabled: true,
      },

      metadata: {
        customerName,
        customerEmail,
        pickup,
        destination,
        vehicle,
        bookingDate
      }
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (error) {

    console.error(error);

    res.status(400).send({
      error: {
        message: error.message
      }
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
