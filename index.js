import express from "express";

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const FOLDER_ID = process.env.FOLDER_ID;

const sessions = new Map();

app.get("/", (req, res) => {
  res.send("Server is working");
});

app.post("/interview", async (req, res) => {
  try {
    const userId = String(req.body.vk_user_id || req.body.user_id || "default_user");

    const message = String(
      req.body.message ||
      req.body.user_message ||
      req.body.text ||
      req.body.body ||
      req.body.query ||
      ""
    ).trim();

    if (!message) {
      return res.status(204).send();
    }

    if (isRestart(message)) {
      const session = createEmptySession();
      sessions.set(userId, session);

      return sendText(
        res,
        "Привет! Начнём заново.\n\nВ какой сфере ты хочешь пройти собеседование? Например: IT, продажи, склад, маркетинг, дизайн."
      );
    }

    let session = sessions.get(userId);

    if (!session) {
      session = createEmptySession();
      sessions.set(userId, session);

      return sendText(
        res,
        "Привет! Я помогу тебе потренироваться перед собеседованием.\n\nВ какой сфере ты хочешь пройти собеседование? Например: IT, продажи, склад, маркетинг, дизайн."
      );
    }

    if (session.step === "ask_field") {
      session.field = message;
      session.step = "ask_position";
      sessions.set(userId, session);

      return sendText(res, "Отлично. На какую должность ты проходишь собеседование?");
    }

    if (session.step === "ask_position") {
      session.position = message;
      session.category = detectCategory(message);
      session.step = "ask_level";
      sessions.set(userId, session);

      return sendText(res, "Какой у тебя уровень? Например: без опыта, начальный, средний, опытный.");
    }

    if (session.step === "ask_level") {
      session.level = message;
      session.step = "interview";
      session.answersCount = 0;
      session.history = [];
      session.currentTopic = "";
      session.topicQuestions = 0;
      sessions.set(userId, session);

      return sendText(
        res,
        "Хорошо, начинаем тренировочное собеседование.\n\nРасскажи коротко о себе и своём опыте."
      );
    }

    if (session.step === "interview") {
      session.answersCount += 1;

      const analysis = await analyzeAnswer(message, session);

      if (!session.currentTopic || session.topicQuestions >= 3) {
        session.currentTopic =
          analysis.best_topic ||
          analysis.topics?.[0] ||
          "опыт кандидата";
        session.topicQuestions = 0;
      }

      session.topicQuestions += 1;

      const reply = await generateInterviewReply(message, session, analysis);

      session.history.push({ role: "user", text: message });
      session.history.push({ role: "assistant", text: reply });

      if (session.answersCount >= 15) {
        session.step = "finished";
      }

      sessions.set(userId, session);

      return sendText(res, reply);
    }

    if (session.step === "finished") {
      return sendText(res, "Интервью уже завершено. Напиши «заново», чтобы начать новое.");
    }

    return sendText(res, "Напиши «заново», чтобы начать сначала.");
  } catch (error) {
    console.error("SERVER ERROR:", error);
    return sendText(res, "Ошибка сервера. Проверь логи Render.");
  }
});

function createEmptySession() {
  return {
    step: "ask_field",
    field: "",
    position: "",
    level: "",
    category: "",
    currentTopic: "",
    topicQuestions: 0,
    answersCount: 0,
    history: []
  };
}

function detectCategory(position) {
  const p = position.toLowerCase();

  if (
    p.includes("developer") ||
    p.includes("разработ") ||
    p.includes("python") ||
    p.includes("java") ||
    p.includes("backend") ||
    p.includes("frontend") ||
    p.includes("программист") ||
    p.includes("devops") ||
    p.includes("qa") ||
    p.includes("тестиров")
  ) {
    return "it";
  }

  if (
    p.includes("кладов") ||
    p.includes("комплект") ||
    p.includes("грузчик") ||
    p.includes("склад") ||
    p.includes("логист")
  ) {
    return "warehouse";
  }

  if (
    p.includes("продаж") ||
    p.includes("продав") ||
    p.includes("кассир") ||
    p.includes("менеджер по продаж")
  ) {
    return "sales";
  }

  if (
    p.includes("маркет") ||
    p.includes("smm") ||
    p.includes("таргет") ||
    p.includes("контент")
  ) {
    return "marketing";
  }

  if (
    p.includes("дизайн") ||
    p.includes("ui") ||
    p.includes("ux")
  ) {
    return "design";
  }

  if (
    p.includes("бухгалтер") ||
    p.includes("финанс") ||
    p.includes("экономист")
  ) {
    return "finance";
  }

  if (
    p.includes("hr") ||
    p.includes("рекрутер") ||
    p.includes("кадров")
  ) {
    return "hr";
  }

  return "other";
}

async function analyzeAnswer(message, session) {
  const prompt = `
Ты анализируешь ответ кандидата на собеседовании.

Категория профессии: ${session.category}
Сфера: ${session.field}
Должность: ${session.position}
Уровень: ${session.level}

Ответ кандидата:
${message}

Выдели из ответа:
- темы;
- конкретные обязанности;
- инструменты или программы;
- проблемы;
- достижения;
- метрики;
- самый перспективный предмет для следующего вопроса.

Ответь строго JSON без markdown:

{
  "topics": [],
  "responsibilities": [],
  "tools": [],
  "problems": [],
  "achievements": [],
  "metrics": [],
  "best_topic": ""
}
`;

  const data = await callYandex([
    { role: "system", text: prompt },
    { role: "user", text: message }
  ], 400);

  try {
    const text = data.result.alternatives[0].message.text;
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      topics: [],
      responsibilities: [],
      tools: [],
      problems: [],
      achievements: [],
      metrics: [],
      best_topic: ""
    };
  }
}

async function generateInterviewReply(message, session, analysis) {
  const prompt = `
Ты профессиональный интервьюер и карьерный консультант.

Ты проводишь спокойное, реалистичное тренировочное собеседование.

Данные кандидата:
Сфера: ${session.field}
Должность: ${session.position}
Уровень: ${session.level}
Категория профессии: ${session.category}

Текущая тема интервью:
${session.currentTopic}

Количество вопросов по текущей теме:
${session.topicQuestions}

Что кандидат только что сказал:
${message}

Что было выделено из ответа:
${JSON.stringify(analysis, null, 2)}

Главные правила:

1. Задавай только один вопрос за раз.

2. После ответа кандидата сначала дай короткую человеческую реакцию на 1 предложение.

3. Затем задай следующий вопрос.

4. Следующий вопрос обязан ссылаться на конкретную деталь из последнего ответа кандидата.

5. Нельзя задавать вопрос, ответ на который уже был в последнем ответе кандидата.

6. Не меняй тему, пока не задал хотя бы 3 уточняющих вопроса по текущей теме.

7. Не используй слово "проект" для профессий, где обычно нет проектов.

8. Если категория профессии НЕ it, запрещено спрашивать про:
- программирование;
- API;
- архитектуру ПО;
- стек;
- фреймворки;
- базы данных;
- технологии разработки.

9. Для warehouse спрашивай про:
- приёмку;
- комплектовку;
- отгрузку;
- инвентаризацию;
- пересорт;
- брак;
- накладные;
- ТСД;
- 1С;
- нормы;
- физическую нагрузку;
- внимательность;
- дисциплину;
- безопасность.

10. Для sales спрашивай про:
- план продаж;
- клиентов;
- возражения;
- средний чек;
- допродажи;
- конфликтные ситуации;
- выполнение KPI.

11. Для marketing спрашивай про:
- каналы продвижения;
- бюджет;
- конверсии;
- лиды;
- аналитику;
- кампании;
- результат.

12. Для it спрашивай про:
- реальные задачи;
- архитектурные решения;
- причины выбора инструментов;
- проблемы в production;
- диагностику;
- компромиссы;
- масштабирование;
- тестирование;
- мониторинг.

13. Если кандидат упомянул конкретную деталь, цепляйся за неё.

14. Не пиши длинные списки.

15. Не звучни как анкета.

16. Не используй фразы:
- "уточните сферу";
- "укажите должность";
- "какие технологии использовали", если они уже названы;
- "расскажите о проектах", если профессия не IT.

17. Если ответ слабый, скажи мягко и помоги раскрыть его.

18. Если ответ сильный, отметь конкретно, что именно было сильным.

19. Не завершай интервью сам, если не пришла инструкция завершить. Просто продолжай задавать вопросы.

Формат ответа:

Короткий комментарий по последнему ответу.
Один следующий вопрос.
`;

  const messages = [
    { role: "system", text: prompt },
    ...session.history.slice(-12),
    { role: "user", text: message }
  ];

  const data = await callYandex(messages, 1000);

  if (!data.result || !data.result.alternatives) {
    return "Ошибка YandexGPT: " + JSON.stringify(data);
  }

  return data.result.alternatives[0].message.text;
}

async function callYandex(messages, maxTokens = 1000) {
  const response = await fetch(
    "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
    {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        modelUri: `gpt://${FOLDER_ID}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.45,
          maxTokens
        },
        messages
      })
    }
  );

  return await response.json();
}

function sendText(res, text) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send(text);
}

function isRestart(message) {
  const text = message.toLowerCase().trim();
  return text === "заново" || text === "restart";
}

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
