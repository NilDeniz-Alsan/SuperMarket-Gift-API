const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// ❌ Burada express.json() veya express.urlencoded() OLMAMALI!

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

// ✅ Webhook doğrulama middleware
const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body;

  console.log('🔍 req.body typeof:', typeof req.body);
  console.log('🔍 req.body instanceof Buffer:', Buffer.isBuffer(req.body));

  const generatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  console.log("🧪 HMAC from Shopify:", hmacHeader);
  console.log("🧪 HMAC you generated:", generatedHmac);

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(generatedHmac, 'utf8'),
      Buffer.from(hmacHeader, 'utf8')
    );

    if (!isValid) {
      console.error("❌ Webhook doğrulaması başarısız.");
      return res.status(401).send('Unauthorized');
    }

    req.body = JSON.parse(rawBody.toString('utf8'));
    return next();
  } catch (err) {
    console.error("❌ JSON parse veya HMAC karşılaştırma hatası:", err);
    return res.status(400).send('Invalid HMAC or JSON');
  }
};

// ✅ Webhook Route – express.raw SADECE burada
app.post(
  '/webhooks/orders/paid',
  express.raw({ type: 'application/json' }),
  verifyS
