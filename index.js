const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

// HMAC doğrulama middleware
const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body;

  console.log("🔍 typeof:", typeof rawBody);
  console.log("🔍 instanceof Buffer:", rawBody instanceof Buffer);

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
    console.log("✅ HMAC doğrulandı ve JSON parse başarılı.");
    next();
  } catch (err) {
    console.error("❌ JSON parse veya HMAC karşılaştırma hatası:", err);
    return res.status(400).send('Bad Request');
  }
};

// Sadece HMAC test endpoint
app.post(
  '/webhook/test',
  express.raw({ type: 'application/json' }),
  verifyShopifyWebhook,
  (req, res) => {
    res.status(200).send('Webhook HMAC doğrulandı 🎉');
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
