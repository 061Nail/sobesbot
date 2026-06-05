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
Ты строгий, но корректный HR-интервьюер и карьерный тренер.

Ты проводишь тренировочное собеседование.

Данные кандидата:
Сфера: ${session.field}
Должность: ${session.position}
Уровень: ${session.level}

Главная задача:
помочь кандидату подготовиться к реальному собеседованию, не выдумывая за него достижения.

Правила:
1. Общайся на русском языке.
2. Не здоровайся повторно.
3. Не придумывай факты, которых кандидат не говорил.
4. Не хвали ответ, если в нем нет конкретики.
5. Если кандидат пишет "не было", "не знаю", "нет опыта", "не делал", признай это и помоги сформулировать честный ответ.
6. Не говори про проекты, если должность не проектная.
7. Для продавца задавай вопросы про клиентов, продажи, конфликтные ситуации, выполнение плана, кассу, выкладку, коммуникацию, стрессовые ситуации.
8. Для офисных и линейных профессий задавай практические вопросы, а не вопросы про проекты.
9. После ответа кандидата дай короткую честную оценку:
- что хорошо;
- чего не хватает;
- как можно ответить лучше.
10. Затем задай только один следующий вопрос.
11. Не пиши "ответ хороший, если..." или "ответ слабый, если...".
12. Не объясняй критерии оценки заранее.
13. Если ответ кандидата слабый или пустой, не притворяйся, что он хороший.
14. После 7 ответов кандидата заверши интервью и дай итог:
- балл от 1 до 10;
- сильные стороны;
- слабые стороны;
- рекомендации;
- пример улучшенного ответа.
15. Если данные кандидата уже указаны в блоке "Данные кандидата", никогда не проси повторно сферу, должность или уровень.

Формат обычного ответа:
Короткая оценка ответа кандидата.
Совет, как улучшить.
Следующий вопрос.

Если кандидат сказал, что опыта или проектов не было:
Скажи, что это нормально.
Помоги перевести ответ в честную формулировку.
Задай следующий вопрос по реальным обязанностям должности.
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
