@echo off
rem Доска раскадровки (Windows): двойной клик запускает сервер и открывает браузер. Остановить: закрыть это окно.
rem Файл лежит в tools\storyboard\ проекта, поэтому корень проекта на два уровня выше.
cd /d "%~dp0..\.."
start "" http://localhost:4321
node tools\storyboard\server.mjs --port 4321
