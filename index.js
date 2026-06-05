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

    let session = sessions.get(userId);

    if (isRestart(message)) {

      sessions.delete(userId);

      session = {
        step: "ask_field",
        field: "",
        position: "",
        level: "",
        history: [],
        answersCount: 0
        };

      sessions.set(userId, session);

      return sendText(
        res,
        "Привет! Начнем заново.\n\nВ какой сфере ты хочешь пройти собеседование?"
      );
    }

if (!session || isRestart(message)) {
  session = {
    step: "ask_field",
    field: "",
    position: "",
    level: "",
    history: [],
    answersCount: 0
  };

  sessions.set(userId, session);

  return sendText(
    res,
    "Привет! Я помогу тебе потренироваться перед собеседованием.\n\nВ какой сфере ты хочешь пройти собеседование? Например: IT, продажи, маркетинг, дизайн."
  );
}

    if (session.step === "ask_field") {
      session.field = message;
      session.step = "ask_position";
      return sendText(res, "Отлично. На какую должность ты проходишь собеседование?");
    }

    if (session.step === "ask_position") {
      session.position = message;
      session.step = "ask_level";
      return sendText(res, "Какой у тебя уровень? Например: без опыта, Junior, Middle или Senior.");
    }

    if (session.step === "ask_level") {
      session.level = message;
      session.step = "interview";
      return sendText(res, "Хорошо, начинаем тренировочное собеседование.\n\nРасскажи коротко о себе и своем опыте.");
    }

    if (session.step === "interview") {
      session.answersCount += 1;

      const prompt = `
Ты живой HR-интервьюер и технический интервьюер.

Ты проводишь тренировочное собеседование.

Данные кандидата уже известны:
Сфера: ${session.field}
Должность: ${session.position}
Уровень: ${session.level}

Критически важные правила:
1. Никогда не проси повторно сферу, должность или уровень.
2. Не говори "уточните сферу", "укажите должность", "предоставьте информацию".
3. Не веди себя как анкета.
4. Веди себя как живой интервьюер.
5. Не выдумывай достижения кандидата.
6. Не хвали без причины.
7. Если ответ неполный, задай один конкретный уточняющий вопрос.
8. Если кандидат дает технический ответ, продолжай техническое интервью.
9. Учитывай всю историю диалога.
10. Задавай только один вопрос за раз.

Контекст:
Кандидат проходит собеседование на ${session.position}, уровень ${session.level}, сфера ${session.field}.

Как отвечать:
- Сначала коротко отреагируй на последний ответ кандидата.
- Затем задай один логичный следующий вопрос.
- Не используй длинные списки.
- Не повторяй уже заданные вопросы.
- Не проси заново данные кандидата.

Если кандидат говорит про backend, микросервисы, базы данных:
задавай вопросы про архитектуру, API, БД, нагрузку, очереди, кэширование, отказоустойчивость, оптимизацию, мониторинг.

Пример хорошего поведения:
Кандидат: "Работал с базой данных"
Ты: "Понял. Давай чуть глубже: с какими базами данных ты работал и какие задачи решал — проектирование схемы, оптимизация запросов, миграции или что-то другое?"

После 7 ответов кандидата дай финальный результат:
балл 1-10, сильные стороны, слабые стороны, рекомендации.
`;

      const yandexResponse = await fetch(
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
              temperature: 0.6,
              maxTokens: 1200
            },
            messages: [
              { role: "system", text: prompt },
              ...session.history,
              { role: "user", text: message }
            ]
          })
        }
      );

      const data = await yandexResponse.json();

      console.log("YANDEX RESPONSE:", JSON.stringify(data));

      if (!data.result || !data.result.alternatives) {
        return sendText(res, "Ошибка YandexGPT: " + JSON.stringify(data));
      }

      const reply = data.result.alternatives[0].message.text;

      session.history.push({ role: "user", text: message });
      session.history.push({ role: "assistant", text: reply });

      if (session.answersCount >= 7) {
        session.step = "finished";
      }

      sessions.set(userId, session);

      return sendText(res, reply);
    }

    if (session.step === "finished") {
      if (isRestart(message)) {
        sessions.delete(userId);
        return sendText(res, "Хорошо, начнем заново. Напиши любое сообщение.");
      }

      return sendText(res, "Интервью уже завершено. Напиши «заново», чтобы начать новое.");
    }

    return sendText(res, "Напиши «заново», чтобы начать сначала.");

  } catch (error) {
    console.error("SERVER ERROR:", error);
    return sendText(res, "Ошибка сервера. Проверь логи Render.");
  }
});

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
