const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ❌ Global olarak express.json() KULLANMIYORUZ — Bu önemli!

// ✅ Webhook doğrulama middleware
const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body; // buffer olarak gelmeli

  // ✅ HMAC hesapla
  const generatedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody) // Buffer olmalı
    .digest('base64');

  console.log('🧪 HMAC from Shopify:', hmacHeader);
  console.log('🧪 HMAC you generated:', generatedHmac);

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(generatedHmac, 'utf8'),
      Buffer.from(hmacHeader, 'utf8')
    );

    if (!isValid) {
      console.error('❌ Webhook doğrulaması başarısız.');
      return res.status(401).send('Unauthorized');
    }

    // ✅ JSON'a çevir
    req.body = JSON.parse(rawBody.toString('utf8'));
    return next();
  } catch (err) {
    console.error('❌ JSON parse veya HMAC karşılaştırma hatası:', err);
    return res.status(400).send('Bad Request');
  }
};

app.use('/webhooks/orders/paid', (req, res, next) => {
  console.log('🔍 req.body typeof:', typeof req.body);
  console.log('🔍 req.body instanceof Buffer:', req.body instanceof Buffer);
  next();
});

// ✅ Shopify orders/paid webhook
app.post(
  '/webhooks/orders/paid',
  express.raw({ type: 'application/json' }), // bu route için özel
  verifyShopifyWebhook,
  async (req, res) => {
    const order = req.body;
    console.log(`🧾 Order #${order.order_number} alındı.`);

    const shouldConvert = order.note_attributes?.some(
      attr => attr.name === 'convertToGiftCard' && attr.value === 'true'
    );

    if (shouldConvert) {
      console.log('🎁 Hediye kartı oluşturulacak...');

      const giftCardData = {
        gift_card: {
          note: `Order #${order.order_number} üzerinden oluşturuldu.`,
          initial_value: parseFloat(order.total_price),
          currency: order.currency,
          customer_id: order.customer?.id || null,
        },
      };

      try {
        const response = await fetch(
          `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/gift_cards.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_TOKEN,
            },
            body: JSON.stringify(giftCardData),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(JSON.stringify(result.errors));
        }

        console.log(`✅ Gift card oluşturuldu: ${result.gift_card.id}`);
      } catch (err) {
        console.error('❌ Gift card oluşturulamadı:', err);
      }
    } else {
      console.log('ℹ️ Normal sipariş, işlem yapılmadı.');
    }

    res.status(200).send('OK');
  }
);

// 🚀 Sunucu başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
