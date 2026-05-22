import express from "express";

const app = express();

app.use(express.json());

const API_KEY = process.env.API_KEY;
const FOLDER_ID = process.env.FOLDER_ID;

const sessions = new Map();

app.post("/interview", async (req, res) => {

  try {

    const {
      vk_user_id,
      message,
      field,
      position,
      level
    } = req.body;

    const history =
      sessions.get(vk_user_id) || [];

    const prompt = `
Ты HR-интервьюер.

Проводишь тренировочное собеседование.

Сфера: ${field}
Должность: ${position}
Уровень: ${level}

Правила:
- задавай только 1 вопрос
- оценивай ответы
- после 7 вопросов дай итоговую оценку
`;

    const messages = [
      {
        role: "system",
        text: prompt
      },
      ...history,
      {
        role: "user",
        text: message
      }
    ];

    const response = await fetch(
      "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
      {
        method: "POST",
        headers: {
          "Authorization":
            `Api-Key ${API_KEY}`,
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          modelUri:
            `gpt://${FOLDER_ID}/yandexgpt/latest`,
          completionOptions: {
            stream: false,
            temperature: 0.6,
            maxTokens: 1000
          },
          messages
        })
      }
    );

    const data =
      await response.json();

    const reply =
      data.result.alternatives[0]
      .message.text;

    history.push({
      role: "user",
      text: message
    });

    history.push({
      role: "assistant",
      text: reply
    });

    sessions.set(
      vk_user_id,
      history
    );

    res.json({
      reply
    });

  } catch (error) {

    console.log(error);

    res.type("text/plain").send(reply);

  }

});

app.listen(
  process.env.PORT || 3000
);
