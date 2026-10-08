# Установка: инструкция для Claude Code

Ты подключаешь пользователю четыре коннектора. Пользователь ничего не набирает в терминале: все шаги делаешь ты. Существующие коннекторы с такими же именами не затирай: покажи, что уже есть, и спроси.

1. Подключи удалённые коннекторы командой `claude mcp add --transport http <имя> <адрес>`:
   - `perplexity` → `https://api.perplexity.ai/mcp`
   - `firecrawl` → `https://mcp.firecrawl.dev/v2/mcp`
   - `composio` → `https://connect.composio.dev/mcp`
2. Поставь Playwright MCP по официальной инструкции https://github.com/microsoft/playwright-mcp.
3. Проверь `claude mcp list`: все четыре на месте.
4. Скажи пользователю, что Perplexity и Composio при первом вызове попросят войти в аккаунт на их сайтах, это нормально.
5. Коротко доложи: что подключено и как проверить.
