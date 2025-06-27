const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const GIFT_CARD_VARIANTS = {
  100.00: '42350092419177',
  50.00: '42350092386409',
  20.00: '42350092353641',
  10.00: '42350092320873',
  1.00: '42358204137577',
  0.50: '42350092517481',
  0.10: '42350092550249',
  0.05: '42350092484713',
  0.01: '42350092451945',
};

const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  let rawBody = '';

  req.on('data', chunk => {
    rawBody += chunk.toString();
  });

  req.on('end', () => {
    const generatedHmac = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');

    if (generatedHmac === hmacHeader) {
      try {
        req.body = JSON.parse(rawBody);
        return next();
      } catch (err) {
        return res.status(400).send("JSON parse failed.");
      }
    } else {
      return res.status(401).send("Unauthorized");
    }
  });
};

app.post('/webhooks/orders/paid', verifyShopifyWebhook, async (req, res) => {
  const order = req.body;
  console.log(`📦 Sipariş alındı: Order #${order.order_number}, Toplam: ${order.total_price} ${order.currency}`);

  const convertGift = order.note_attributes?.some(
    attr => attr.name === 'convertToGiftCard' && attr.value === 'true'
  );

  if (convertGift) {
    console.log('🎁 Hediye kartı oluşturulacak.');

    let remaining = parseFloat(order.total_price);
    const createdGiftCards = [];

    for (const amount of Object.keys(GIFT_CARD_VARIANTS).map(Number).sort((a, b) => b - a)) {
      while (remaining >= amount) {
        const giftCardData = {
          gift_card: {
            note: `Order #${order.order_number} üzerinden oluşturuldu.`,
            initial_value: amount,
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

          const data = await response.json();
          if (!response.ok) {
            console.error("❌ Hediye kartı API hatası:", data.errors);
            throw new Error(JSON.stringify(data.errors));
          }
          createdGiftCards.push(data.gift_card);
          console.log(`✅ Gift Card oluşturuldu: ${amount} GBP → ID ${data.gift_card.id}`);
          remaining = +(remaining - amount).toFixed(2);
        } catch (err) {
          console.error("❌ Gift card oluşturulamadı:", err.message);
          break;
        }
      }
    }

    if (remaining > 0) {
      console.warn(`⚠️ ${remaining} GBP kalan miktar hediye kartı olarak bölünemedi.`);
    }
  } else {
    console.log('ℹ️ Bu sipariş için hediye kartı oluşturulmayacak.');
  }

  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
