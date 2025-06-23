const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Your Shopify App credentials from the Partner Dashboard
const SHOPIFY_API_SECRET = '';
const SHOPIFY_ADMIN_API_TOKEN = '';
const SHOPIFY_STORE_DOMAIN = ''; // e.g., my-amazing-store.myshopify.com

// Middleware to verify the webhook request is from Shopify
const verifyShopifyWebhook = (req, res, next) => {
  // We need the raw body for verification, so we disable body-parser for this route
  // and parse it manually after verification.
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  let rawBody = '';
  req.on('data', chunk => {
    rawBody += chunk.toString();
  });
  req.on('end', () => {
    const hash = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');

    if (hash === hmac) {
      // It's a valid request. Attach the parsed body for the next handler.
      req.body = JSON.parse(rawBody);
      next();
    } else {
      console.error('Webhook verification failed.');
      res.status(401).send('Unauthorized');
    }
  });
};

// Route to handle the webhook
// Note: We apply the middleware only to this specific route.
app.post('/webhooks/orders/paid', verifyShopifyWebhook, async (req, res) => {
  const order = req.body;
  console.log(`Received paid order webhook for order #${order.order_number}`);

  // --- THIS IS THE CORE SUBROUTINE LOGIC ---
  if (order.note_attributes && order.note_attributes.some(attr => attr.name === 'convertToGiftCard' && attr.value === 'true')) {
    console.log('Order is flagged for gift card conversion.');

    // Prepare data for gift card creation
    const giftCardData = {
      gift_card: {
        note: `Created from order #${order.order_number}.`,
        initial_value: parseFloat(order.total_price),
        currency: order.currency,
        customer_id: order.customer ? order.customer.id : null,
      },
    };

    // If there's no customer ID, we can still create a code, but we can't email it automatically.
    // It's best practice to encourage or require customer accounts for this.
    if (!giftCardData.gift_card.customer_id) {
       console.warn(`Order #${order.order_number} has no customer ID. A gift card will be created but not automatically sent.`);
    }

    // Call the Shopify Admin API to create the gift card
    try {
      const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/gift_cards.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
        },
        body: JSON.stringify(giftCardData),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(JSON.stringify(responseData.errors));
      }

      console.log(`Successfully created gift card ${responseData.gift_card.id} for order #${order.order_number}.`);

    } catch (error) {
      console.error(`Failed to create gift card for order #${order.order_number}:`, error);
    }
  } else {
    console.log('Order is a standard purchase. No action taken.');
  }

  // Respond to Shopify to acknowledge receipt of the webhook
  res.status(200).send('OK');
});
app.use(express.json());

// Start the server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
