const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 🚫 DİKKAT: express.json() veya express.urlencoded() middleware YOK!

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

// ✅ Webhook doğrulama middleware
const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body; // buffer

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

// ✅ Sadece bu route için express.raw kullan!
app.post(
  '/webhooks/orders/paid',
  express.raw({ type: 'application/json' }), // bu sadece bu route'ta geçerli!
  verifyShopifyWebhook,
  async (req, res) => {
    const order = req.body;
    console.log(`🧾 Order #${order.order_number} alındı.`);

    if (order.note_attributes?.some(attr => attr.name === 'convertToGiftCard' && attr.value === 'true')) {
      console.log('🎁 Hediye kartı oluşturulacak.');

      const giftCardData = {
        gift_card: {
          note: `Order #${order.order_number} üzerinden oluşturuldu.`,
          initial_value: parseFloat(order.total_price),
          currency: order.currency,
          customer_id: order.customer?.id || null,
        },
      };

      try {
        const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/gift_cards.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
          },
          body: JSON.stringify(giftCardData),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(JSON.stringify(data.errors));
        }

        console.log(`✅ Gift card oluşturuldu: ${data.gift_card.id}`);
      } catch (err) {
        console.error('❌ Gift card oluşturulamadı:', err);
      }
    } else {
      console.log('ℹ️ Normal sipariş, işlem yapılmadı.');
    }

    res.status(200).send('OK');
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
