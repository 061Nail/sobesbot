import express from "express";

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const FOLDER_ID = process.env.FOLDER_ID;

const sessions = new Map();

app.post("/interview", async (req, res) => {
  try {
    const userId = req.body.vk_user_id || "default_user";
    const message = req.body.message || "";

    let session = sessions.get(userId);

    if (!session) {
      session = {
        step: "ask_field",
        field: "",
        position: "",
        level: "",
        history: [],
        answersCount: 0
      };
      sessions.set(userId, session);

      return sendText(res, "Привет! Я помогу тебе потренироваться перед собеседованием.\n\nВ какой сфере ты хочешь пройти собеседование?");
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
Ты HR-интервьюер и карьерный тренер.

Ты проводишь тренировочное собеседование.

Сфера: ${session.field}
Должность: ${session.position}
Уровень: ${session.level}

Правила:
1. Не здоровайся повторно.
2. Не пиши "ответ хороший, если..." или "ответ слабый, если...".
3. Не объясняй критерии оценки заранее.
4. Общайся напрямую с кандидатом.
5. Дай короткую обратную связь на ответ кандидата.
6. Затем задай один следующий вопрос.
7. Если это 7-й ответ кандидата, заверши интервью и дай итог:
- балл от 1 до 10;
- сильные стороны;
- слабые стороны;
- рекомендации.
`;

      const response = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
        method: "POST",
        headers: {
          "Authorization": `Api-Key ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          modelUri: `gpt://${FOLDER_ID}/yandexgpt/latest`,
          completionOptions: {
            stream: false,
            temperature: 0.6,
            maxTokens: 1000
          },
          messages: [
            { role: "system", text: prompt },
            ...session.history,
            { role: "user", text: message }
          ]
        })
      });

      const data = await response.json();

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

      return sendText(res, reply);
    }

    if (session.step === "finished") {
      if (message.toLowerCase().includes("заново") || message.toLowerCase().includes("начать")) {
        sessions.delete(userId);
        return sendText(res, "Хорошо, начнем заново.\n\nВ какой сфере ты хочешь пройти собеседование?");
      }

      return sendText(res, "Интервью уже завершено. Напиши «заново», чтобы начать новое.");
    }

  } catch (error) {
    console.log(error);
    return sendText(res, "Ошибка сервера. Проверь Render logs, API_KEY и FOLDER_ID.");
  }
});

app.get("/", (req, res) => {
  res.send("Server is working");
});

function sendText(res, text) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send(text);
}

app.listen(process.env.PORT || 3000);
