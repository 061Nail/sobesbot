import express from "express";

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const FOLDER_ID = process.env.FOLDER_ID;

const sessions = new Map();

app.post("/interview", async (req, res) => {
  try {
    const { vk_user_id, message, field, position, level } = req.body;

    const history = sessions.get(vk_user_id) || [];

    const prompt = `
Ты HR-интервьюер, который проводит тренировочное собеседование с кандидатом.

Сфера: ${field || "не указана"}
Должность: ${position || "не указана"}
Уровень: ${level || "не указан"}

Твоя задача:
провести живое собеседование, как настоящий HR.

Правила поведения:
1. Не объясняй, каким должен быть хороший или плохой ответ.
2. Не пиши фразы вроде: "ответ хороший, если..." или "ответ слабый, если...".
3. Не раскрывай критерии оценки заранее.
4. Общайся напрямую с кандидатом.
5. Задавай только один вопрос за раз.
6. Если это начало интервью, сначала коротко поприветствуй кандидата.
7. После ответа кандидата дай короткую обратную связь на 1-2 предложения.
8. Потом задай следующий вопрос.
9. После 7 ответов кандидата заверши интервью и дай итоговую оценку.

Формат обычного ответа:
короткая обратная связь по ответу кандидата + следующий вопрос.

Формат первого сообщения:
Приветствие + первый вопрос.

Не используй списки критериев. Не объясняй, как надо отвечать. Просто проводи интервью.
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
          ...history,
          { role: "user", text: message || "Начать интервью" }
        ]
      })
    });

    const data = await response.json();
    const reply = data.result.alternatives[0].message.text;

    history.push({ role: "user", text: message || "Начать интервью" });
    history.push({ role: "assistant", text: reply });
    sessions.set(vk_user_id, history);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(reply);

  } catch (error) {
    console.log(error);
    res.status(200).json({
      reply: "Ошибка сервера. Проверь API_KEY, FOLDER_ID и логи Render.",
      gpt_reply: "Ошибка сервера. Проверь API_KEY, FOLDER_ID и логи Render.",
      text: "Ошибка сервера. Проверь API_KEY, FOLDER_ID и логи Render."
    });
  }
});

app.get("/", (req, res) => {
  res.send("Server is working");
});

app.listen(process.env.PORT || 3000);
