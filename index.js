const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

// 🔐 Webhook doğrulama middleware
const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body;

  if (!rawBody) {
    console.error('❌ Webhook body boş.');
    return res.status(400).send('Bad Request');
  }

  const generatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');
  console.log("🧪 HMAC from Shopify:", hmacHeader);
  console.log("🧪 HMAC you generated:", generatedHmac);
  
  if (generatedHmac === hmacHeader) {
    try {
      req.body = JSON.parse(rawBody.toString('utf8'));
      return next();
    } catch (err) {
      console.error('❌ JSON parse hatası:', err);
      return res.status(400).send('Bad JSON');
    }
  } else {
    console.error('❌ Webhook doğrulaması başarısız.');
    return res.status(401).send('Unauthorized');
  }
};

// ✅ Shopify webhook rotası: express.raw() ile birlikte
app.post(
  '/webhooks/orders/paid',
  express.raw({ type: 'application/json' }), // 🟡 BU OLMADAN doğrulama çalışmaz!
  verifyShopifyWebhook,
  async (req, res) => {
    const order = req.body;
    console.log(`🧾 Order #${order.order_number} alındı.`);

    if (order.note_attributes && order.note_attributes.some(attr => attr.name === 'convertToGiftCard' && attr.value === 'true')) {
      console.log('🎁 Hediye kartı oluşturulacak.');

      const giftCardData = {
        gift_card: {
          note: `Order #${order.order_number} üzerinden oluşturuldu.`,
          initial_value: parseFloat(order.total_price),
          currency: order.currency,
          customer_id: order.customer ? order.customer.id : null,
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

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(JSON.stringify(responseData.errors));
        }

        console.log(`✅ Gift card oluşturuldu: ${responseData.gift_card.id}`);
      } catch (error) {
        console.error(`❌ Gift card oluşturulamadı:`, error);
      }
    } else {
      console.log('Normal sipariş, işlem yapılmadı.');
    }

    res.status(200).send('OK');
  }
);

// 🚀 Sunucu başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
