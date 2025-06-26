const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

// 🔹 Shopify webhook’ları için raw body middleware
app.use(express.raw({ type: '*/*' }));

app.post('/webhooks/orders/paid', (req, res) => {
  const shopifyHmac = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body;

  // 🪵 Debug logları
  console.log("🔍 req.body typeof:", typeof rawBody);
  console.log("🔍 req.body instanceof Buffer:", rawBody instanceof Buffer);

  // 🔐 HMAC hesapla
  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  console.log("🧪 HMAC from Shopify:", shopifyHmac);
  console.log("🧪 HMAC you generated:", calculatedHmac);

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHmac, 'base64'),
      Buffer.from(shopifyHmac, 'base64')
    );

    if (!isValid) {
      console.error('❌ Webhook doğrulaması başarısız.');
      return res.status(401).send('Unauthorized');
    }

    const data = JSON.parse(rawBody.toString('utf8'));
    console.log('✅ Webhook doğrulandı. Payload:', data);

    // TODO: Gift Card gibi işlemler burada yapılır.

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ HMAC veya JSON işleme hatası:', err);
    return res.status(400).send('Invalid request');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook sunucusu ${PORT} portunda çalışıyor`);
});
