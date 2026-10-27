// Мост stdio <-> Streamable HTTP для синтакс-помощника 1С (сервер mcp-bsl-context).
// Claude Desktop запускает этот процесс локально; все вызовы инструментов
// пересылаются на сервер mcp-bsl-context, адрес которого задаёт пользователь
// при установке расширения (переменная окружения SYNTAX_HELPER_URL).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import TOOLS_SNAPSHOT from "./tools.snapshot.json" with { type: "json" };
import MANIFEST from "../manifest.json" with { type: "json" };

const SERVER_URL = (process.env.SYNTAX_HELPER_URL || "").trim();
const VERSION = MANIFEST.version; // единственный источник версии — manifest.json

const INSTRUCTIONS = `Справка по API платформы 1С:Предприятие (Синтакс-помощник, справка из файлов платформы на сервере mcp-bsl-context).
Правила работы:
1. Не пиши вызовы методов, свойств, конструкторов и обработчики событий платформы по памяти: сначала проверь сигнатуру через info (глобальные методы/свойства, типы) или getMember (член типа: метод, свойство, событие).
2. Если в ответе есть «⚠️ Не рекомендуется использовать», не используй этот элемент в новом коде — используй указанную замену («Рекомендуется использовать»).
3. Учитывай раздел «Доступность» (тонкий клиент, сервер, веб-клиент и т.д.) при выборе контекста исполнения (&НаКлиенте / &НаСервере).
4. Сначала определи вид формы — именно формы, а не клиента.
   • Управляемая форма (ФормаКлиентскогоПриложения). Признаки: Элементы.<Имя>; директивы &НаКлиенте/&НаСервере в модуле формы; если доступны файлы выгрузки — FormType = Managed и файл Ext/Form.xml. Элемент имеет тип ПолеФормы / ТаблицаФормы / ГруппаФормы / КнопкаФормы / ДекорацияФормы; свойства конкретного вида ищи в типах «Расширение поля формы для …», «Расширение таблицы формы для …», «Расширение группы формы для …», «Расширение декорации формы для …». Коллекция элементов — свойство Элементы (тип ВсеЭлементыФормы). Это верно для любого клиента — тонкого, веб, мобильного и толстого. Новая разработка ведётся на управляемых формах: если вид формы не указан, но и нет признаков обычной — исходи из управляемой.
   • Обычная форма (тип Форма). Признаки: ЭлементыФормы.<Имя>, ЭтаФорма.Панель, отсутствие директив компиляции в модуле формы; если доступны файлы выгрузки — FormType = Ordinary и двоичный Ext/Form.bin. Работает только в толстом клиенте — в обычном приложении или в управляемом при включённом свойстве конфигурации «Использовать обычные формы в управляемом приложении». Используй типы элементов управления обычной формы (ПолеВвода, ТабличноеПоле, ПолеHTMLДокумента, Панель, КоманднаяПанель и др.) и типы «Расширение элементов управления, расположенных в форме / на панели / в табличном поле / в поле табличного документа», «Расширение элементов управления принадлежащих табличному документу».
   • Тип относится к обычным формам, если в справке у него в «Доступности» указан только «Толстый клиент». В выдаче search такие элементы помечены «⚠️ Только толстый клиент» и стоят ниже.
   • Одноимённые типы различаются суффиксом: «ЭлементыФормы» — коллекция подчинённых элементов формы клиентского приложения, «ЭлементыФормы (Толстый клиент)» — коллекция элементов обычной формы; так же «Расширение элементов управления, расположенных в форме» и «… (Толстый клиент)». Если в описании типа есть «Есть одноимённый тип» — проверь, какой из вариантов нужен.
   • Если по коду, выгрузке и формулировке задачи вид формы определить нельзя — спроси. Цитируя справку, называй тип, с чьей страницы взят факт, и его доступность.
5. Глобальные методы и свойства (СтрЗаменить, ПоместитьФайл) — через info. Глобальные события (ПриНачалеРаботыСистемы, ПередЗавершениемРаботыСистемы и т.п.) — через getMember с типом ГлобальныйКонтекст; в заголовке указан модуль (Модуль приложения / сеанса / обычного приложения / внешнего соединения) — проверь, что он совпадает с модулем, для которого пишется код; полный список — getMembers ГлобальныйКонтекст.
6. События типов ищи через тип: getMember(ТипОбъекта, ИмяСобытия) или search «ТипОбъекта НачалоИмениСобытия». Поиск события только по имени, без типа, не работает.
7. В search пиши слова через пробел, а не через точку: «Запрос Выполнить», а не «Запрос.Выполнить».
8. Имена указывай по-русски, английские имена не поддерживаются.
9. Системные перечисления (ВидДвиженияНакопления, МетодСжатияФайлаАрхива и т.п.) — это типы: значения смотри через info или getMember. Старые имена переименованных перечислений (например, СтандартнаяКомандаПланировщика → СтандартнаяКомандаПоляПланировщика) тоже находятся, их значения помечены «не рекомендуется» — используй актуальное имя.
10. Если в описании возвращаемого значения указан тип результата (например, у Обещания — «Строка … или Неопределено»), учитывай все варианты, включая Неопределено.`;

const log = (...a) => console.error("[1c-syntax-helper]", ...a); // stdout занят протоколом

let client = null;
let connecting = null;

function serverUrl() {
  if (!SERVER_URL) {
    throw new Error("не указан адрес сервера — задайте его в настройках расширения (например, http://<сервер>:<порт>/mcp)");
  }
  let url;
  try {
    url = new URL(SERVER_URL);
  } catch {
    throw new Error(`адрес сервера «${SERVER_URL}» не является URL (ожидается http(s)://<сервер>:<порт>/mcp)`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`адрес сервера должен начинаться с http:// или https://, указано «${SERVER_URL}»`);
  }
  return url;
}

async function connect() {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const c = new Client({ name: "mcp-bsl-context-desktop-bridge", version: VERSION });
    const transport = new StreamableHTTPClientTransport(serverUrl());
    c.onerror = (e) => log("ошибка соединения:", e?.message || e);
    c.onclose = () => { if (client === c) client = null; };
    await c.connect(transport);
    log("подключено к", SERVER_URL);
    client = c;
    return c;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function reset() {
  const c = client;
  client = null;
  if (c) { try { await c.close(); } catch { /* ignore */ } }
}

// Один повтор с переподключением: сервер мог перезапуститься (сессия устарела).
async function withRetry(fn) {
  try {
    return await fn(await connect());
  } catch (e) {
    log("повтор после ошибки:", e?.message || e);
    await reset();
    return await fn(await connect());
  }
}

const unavailable = (e) => ({
  isError: true,
  content: [{
    type: "text",
    text: `❌ Сервер синтакс-помощника 1С недоступен (${SERVER_URL || "адрес не указан"}): ${e?.message || e}. ` +
      "Проверьте адрес сервера в настройках расширения и доступность сервера по сети.",
  }],
});

const server = new Server(
  { name: "1c-syntax-helper", version: VERSION },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    return await withRetry((c) => c.listTools());
  } catch (e) {
    // Сервер недоступен при запуске Claude Desktop: отдаём сохранённый список,
    // чтобы инструменты были видны; сами вызовы вернут понятную ошибку.
    log("tools/list недоступен, используется сохранённый список:", e?.message || e);
    return { tools: TOOLS_SNAPSHOT };
  }
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await withRetry((c) => c.callTool(req.params, undefined, { timeout: 120000 }));
  } catch (e) {
    return unavailable(e);
  }
});

const shutdown = async () => { await reset(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);

await server.connect(new StdioServerTransport());
log("мост запущен, сервер:", SERVER_URL || "(адрес не указан)");
