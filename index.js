require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware: Sadece webhook için raw body kullan
app.use('/webhooks', express.raw({ type: 'application/json' }));

// Webhook doğrulama fonksiyonu
const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body;

  if (!hmacHeader || !rawBody) {
    console.error("❌ HMAC header veya body eksik");
    return res.status(401).send('Unauthorized');
  }

  const generatedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  if (!crypto.timingSafeEqual(
    Buffer.from(hmacHeader, 'base64'),
    Buffer.from(generatedHmac, 'base64')
  )) {
    console.error("❌ Webhook doğrulaması başarısız");
    return res.status(401).send('Unauthorized');
  }

  try {
    req.body = JSON.parse(rawBody.toString());
    next();
  } catch (err) {
    console.error("❌ JSON parse hatası:", err);
    return res.status(400).send('Bad Request');
  }
};

// Webhook endpoint
app.post('/webhooks/orders/paid', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log(`🧾 Sipariş alındı: #${order.order_number}`);

    // Gift card dönüşüm kontrolü
    const shouldConvert = order.note_attributes?.some(
      attr => attr.name === 'convertToGiftCard' && attr.value === 'true'
    );

    if (shouldConvert) {
      console.log('🎁 Hediye kartı oluşturuluyor...');

      const response = await fetch(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/gift_cards.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_TOKEN,
          },
          body: JSON.stringify({
            gift_card: {
              note: `Sipariş #${order.order_number} için oluşturuldu`,
              initial_value: parseFloat(order.total_price),
              currency: order.currency,
              customer_id: order.customer?.id || null,
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors || 'Gift card oluşturulamadı');
      }

      console.log(`✅ Gift card oluşturuldu: ${data.gift_card.id}`);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Hata:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Kök endpoint
app.get('/', (req, res) => {
  res.send('Shopify Gift Card Webhook Çalışıyor');
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
  console.log(`🏪 Mağaza: ${process.env.SHOPIFY_STORE_DOMAIN}`);
});
