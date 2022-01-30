import express from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";
import dayjs from "dayjs";
import joi from "joi";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const participantSchema = joi.object({
  name: joi.string().required(),
});

const messageSchema = joi.object({
  from: joi.string().required(),
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message", "private_message"),
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(async () => {
  db = mongoClient.db("batepapo_uol");
});

setInterval(updateParticipants, 15000);

async function updateParticipants() {
  try {
    const participants = await db.collection("participant").find().toArray();

    participants.map(async (participant) => {
      const time = Date.now() - participant.lastStatus;

      if (time > 10) {
        try {
          await db
            .collection("participant")
            .deleteOne({ _id: participant._id });
          await db.collection("messages").insertOne({
            from: participant.name,
            to: "Todos",
            text: "sai da sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss").toString(),
          });
        } catch (err) {
          console.log(err);
        }
      }
    });
  } catch (err) {
    console.log(err);
  }
}

app.get("/participants", async (req, res) => {
  try {
    const listParticipants = await db
      .collection("participant")
      .find()
      .toArray();
    res.send(listParticipants);
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

app.post("/participants", async (req, res) => {
  const participant = req.body;

  const validation = participantSchema.validate(participant, {
    abortEarly: false,
  });
  if (validation.error) {
    const err = validation.error.details.map((detail) => detail.message);
    res.status(422).send(err);
    return;
  }

  const participantExist = await db
    .collection("participant")
    .find({ name: participant.name })
    .toArray();
  if (participantExist.length !== 0) {
    res.status(409).send("name already exists");
    return;
  }

  try {
    const participantStatus = await db
      .collection("participant")
      .insertOne({ name: participant.name, lastStatus: Date.now() });

    await db.collection("messages").insertOne({
      from: participant.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss").toString(),
    });

    if (participantStatus) {
      res.sendStatus(201);
    }
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

app.post("/messages", async (req, res) => {
  const message = { ...req.body, from: req.headers.user };

  const validation = messageSchema.validate(message, { abortEarly: false });
  if (validation.error) {
    const err = validation.error.details.map((detail) => detail.message);
    res.status(422).send(err);
    return;
  }
  // type não pode ser private se o "to" for "todos"
  const participantLogged = await db
    .collection("participant")
    .find({ name: message.from })
    .toArray();
  if (participantLogged.length === 0) {
    res.status(422).send("user does not have permission");
    return;
  }

  try {
    const status = await db
      .collection("messages")
      .insertOne({ ...message, time: dayjs().format("HH:mm:ss").toString() });
    if (status) {
      res.sendStatus(201);
    }
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const user = req.headers.user;

  try {
    let listMessages = await db.collection("messages").find().toArray();
    listMessages = listMessages.filter(
      (message) =>
        message.to === user || message.to === "Todos" || message.from === user
    );

    if (limit) {
      listMessages = listMessages.slice(-limit);
    }
    res.send(listMessages);
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

app.post("/status", async (req, res) => {
  const user = req.headers.user;
  console.log(user);

  try {
    const participant = await db
      .collection("participant")
      .find({ name: user })
      .toArray();

    if (participant.length > 0) {
      try {
        const status = await db.collection("participant").updateOne(
          {
            _id: participant[0]._id,
          },
          { $set: { lastStatus: Date.now() } }
        );
        if (status) {
          res.sendStatus(200);
        }
      } catch {
        res.sendStatus(500);
      }
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    res.sendStatus(500);
  }
});

app.listen(5000, () => {
  console.log("Servidor rodando na porta 5000");
});
