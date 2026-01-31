const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для ограничения количества запросов (защита от злоупотреблений)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // Максимум 100 запросов с одного IP за период windowMs
  message: 'Слишком много запросов с вашего IP-адреса. Пожалуйста, попробуйте позже.'
});

app.use(limiter);

// Раздача статических файлов из директории public
app.use(express.static(path.join(__dirname, 'public')));

// Главный маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер Sojmieblo запущен на http://localhost:${PORT}`);
});
