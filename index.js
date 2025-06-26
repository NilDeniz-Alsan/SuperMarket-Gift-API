require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🛠️  Uygulama başlatılıyor...');
console.log('🔍 Ortam değişkenleri kontrol ediliyor:');
console.log(`- SHOPIFY_STORE_DOMAIN: ${process.env.SHOPIFY_STORE_DOMAIN ? '✔️' : '❌'}`);
console.log(`- SHOPIFY_API_SECRET: ${process.env.SHOPIFY_API_SECRET ? '✔️' : '❌'}`);
console.log(`- SHOPIFY_ADMIN_API_TOKEN: ${process.env.SHOPIFY_ADMIN_API_TOKEN ? '✔️' : '❌'}`);

// Middleware: Sadece webhook için raw body kullan
app.use('/webhooks', express.raw({ type: 'application/json' }));

// Webhook doğrulama fonksiyonu
const verifyShopifyWebhook = (req, res, next) => {
  console.log('\n🔔 Yeni webhook isteği alındı');
  console.log('🔒 HMAC doğrulaması başlıyor...');
  
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body;
  const shopDomain = req.get('X-Shopify-Shop-Domain');
  const topic = req.get('X-Shopify-Topic');

  console.log(`🏪 Mağaza: ${shopDomain}`);
  console.log(`📌 Konu: ${topic}`);
  console.log(`🔑 Gelen HMAC: ${hmacHeader}`);

  if (!hmacHeader || !rawBody) {
    console.error('❌ Kritik Hata: HMAC header veya body eksik');
    return res.status(401).send('Unauthorized');
  }

  try {
    const generatedHmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(rawBody)
      .digest('base64');

    console.log(`🔐 Oluşturulan HMAC: ${generatedHmac}`);

    if (!crypto.timingSafeEqual(
      Buffer.from(hmacHeader, 'base64'),
      Buffer.from(generatedHmac, 'base64')
    )) {
      console.error('❌ HMAC uyuşmazlığı! Doğrulama başarısız');
      return res.status(401).send('Unauthorized');
    }

    console.log('✅ HMAC doğrulaması başarılı');
    
    req.body = JSON.parse(rawBody.toString());
    req.shopDomain = shopDomain;
    next();
  } catch (err) {
    console.error('❌ Doğrulama hatası:', err.message);
    console.error('Hata detayı:', err.stack);
    return res.status(400).send('Bad Request');
  }
};

// Webhook endpoint
app.post('/webhooks/orders/paid', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log('\n🧾 Sipariş Detayları:');
    console.log(`- Sipariş No: #${order.order_number}`);
    console.log(`- Toplam Tutar: ${order.total_price} ${order.currency}`);
    console.log(`- Müşteri ID: ${order.customer?.id || 'Yok'}`);
    
    if (order.note_attributes) {
      console.log('📝 Not Özellikleri:');
      order.note_attributes.forEach(attr => {
        console.log(`  - ${attr.name}: ${attr.value}`);
      });
    }

    const shouldConvert = order.note_attributes?.some(
      attr => attr.name === 'convertToGiftCard' && attr.value === 'true'
    );

    if (shouldConvert) {
      console.log('\n🎁 Hediye kartı dönüşümü başlatılıyor...');
      console.log(`💰 Dönüştürülecek Tutar: ${order.total_price} ${order.currency}`);

      const giftCardData = {
        gift_card: {
          note: `Sipariş #${order.order_number} için oluşturuldu`,
          initial_value: parseFloat(order.total_price),
          currency: order.currency,
          customer_id: order.customer?.id || null,
        }
      };

      console.log('📤 Shopify API isteği gönderiliyor...');
      console.log('API Payload:', JSON.stringify(giftCardData, null, 2));

      const apiUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/gift_cards.json`;
      console.log(`🔗 API URL: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_TOKEN,
        },
        body: JSON.stringify(giftCardData)
      });

      const data = await response.json();
      console.log('📥 API Yanıtı:', JSON.stringify(data, null, 2));

      if (!response.ok) {
        console.error('❌ API Hatası:', data.errors || 'Bilinmeyen hata');
        throw new Error(data.errors || 'Gift card oluşturulamadı');
      }

      console.log(`✅ Gift card oluşturuldu! ID: ${data.gift_card.id}`);
      console.log(`🔗 Yönetim Paneli Linki: https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/gift_cards/${data.gift_card.id}`);
    } else {
      console.log('ℹ️ Gift card dönüşümü gerekmiyor - İşlem atlandı');
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('\n❌ SİSTEM HATASI:');
    console.error('Hata Mesajı:', err.message);
    console.error('Stack Trace:', err.stack);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Kök endpoint
app.get('/', (req, res) => {
  console.log('🌐 Kök endpoint çağrıldı');
  res.send('Shopify Gift Card Webhook Çalışıyor');
});

// Hata yakalayıcı
app.use((err, req, res, next) => {
  console.error('🔥 Yakalanmamış Hata:', err);
  res.status(500).send('Internal Server Error');
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`\n🚀 Sunucu ${PORT} portunda çalışıyor`);
  console.log(`🏪 Mağaza: ${process.env.SHOPIFY_STORE_DOMAIN}`);
  console.log('🛡️ HMAC Doğrulama Aktif');
  console.log('🔔 Webhook URL: /webhooks/orders/paid');
  console.log('📝 Loglar aktif - Tüm aktiviteler kaydediliyor\n');
});
