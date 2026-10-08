# 5 коннекторов для маркетинга и продаж в Claude

Claude читает рекламные кабинеты, отвечает клиентам в WhatsApp, разбирает звонки, ищет B2B-контакты и ведёт сделки в Битрикс24. В терминал ничего вводить не нужно.

Нужна подписка Claude Pro или Max.

## Как подключить в приложении Claude

1. Открой приложение Claude (claude.ai/download) или claude.ai.
2. Слева Customize, вкладка Connectors, «+ Add», Add custom connector.
3. Имя любое, адрес из таблицы вставь в поле URL, нажми Add.
4. Дальше вход в свой аккаунт этого сервиса на его официальном сайте.

Адреса ниже не открываются как обычные страницы: это адреса подключения, их вставляют в Claude.

| Коннектор | Что делает | Адрес для Claude |
|---|---|---|
| Pipeboard, Meta Ads | статистика и кампании в Facebook и Instagram | `https://meta-ads.mcp.pipeboard.co/` |
| Pipeboard, Google Ads | реклама в Google и YouTube | `https://google-ads.mcp.pipeboard.co/` |
| Pipeboard, TikTok Ads | реклама в TikTok | `https://tiktok-ads.mcp.pipeboard.co/` |
| GREEN-API | WhatsApp внутри Claude: ответы клиентам и напоминания тем, кто замолчал | `https://mcp.green-api.com/mcp` |
| Fireflies | расшифровки звонков: видно, на какой фразе уходит клиент | `https://api.fireflies.ai/mcp` |
| Apollo | база B2B-контактов по описанию, с почтами | `https://mcp.apollo.io/mcp` |
| Битрикс24 | официальный коннектор: сделки, задачи, воронка | `https://mcp.bitrix24.tech/mcp/` |

Pipeboard это три отдельных коннектора: ставь те, что нужны.

## Как проверить

Напиши Claude: «Покажи расход и заявки по моим рекламным кампаниям за прошлую неделю». Ответ с цифрами из кабинета значит, что Pipeboard работает.
