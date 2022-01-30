import express from "express";
import cors from "cors";

import { stripHtml } from "string-strip-html";
import dayjs from "dayjs";
import joi from "joi";

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { ObjectID } from "bson";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

setInterval(updateParticipants, 15000);

async function updateParticipants() {
  const { mongoClient, db } = await connectMongo();

  try {
    const participants = await db.collection("participant").find().toArray();

    participants.map(async (participant) => {
      const time = (Date.now() - participant.lastStatus) * 0.001;

      if (time > 10) {
        await db.collection("participant").deleteOne({ _id: participant._id });
        await db.collection("messages").insertOne({
          from: participant.name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: dayjs().format("HH:mm:ss").toString(),
        });
      }
      mongoClient.close();
    });
  } catch (err) {
    mongoClient.close();
    console.log(err);
  }
}

const participantSchema = joi.object({
  name: joi.string().required(),
});

const messageSchema = joi.object({
  from: joi.string().required(),
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message", "private_message").required(),
});

async function connectMongo(res) {
  const mongoClient = new MongoClient(process.env.MONGO_URI);
  try {
    await mongoClient.connect();
    const db = mongoClient.db("batepapo_uol");
    return { mongoClient, db };
  } catch (err) {
    if (res) {
      mongoClient.close();
      res.sendStatus(500);
    } else {
      console.log(err);
    }
  }
}

app.get("/participants", async (req, res) => {
  const { mongoClient, db } = await connectMongo(res);

  try {
    const listParticipants = await db
      .collection("participant")
      .find()
      .toArray();
    mongoClient.close();
    res.send(listParticipants);
  } catch (err) {
    mongoClient.close();
    res.sendStatus(500);
  }
});

app.post("/participants", async (req, res) => {
  const { mongoClient, db } = await connectMongo(res);

  const nameTreated = stripHtml(req.body.name);
  const participant = { name: nameTreated.result.trim() };

  const validation = participantSchema.validate(participant, {
    abortEarly: false,
  });
  if (validation.error) {
    const err = validation.error.details.map((detail) => detail.message);
    mongoClient.close();
    res.status(422).send(err);
    return;
  }

  const participantExist = await db
    .collection("participant")
    .find({ name: participant.name })
    .toArray();
  if (participantExist.length !== 0) {
    mongoClient.close();
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
      mongoClient.close();
      res.sendStatus(201);
    }
  } catch {
    mongoClient.close();
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const { mongoClient, db } = await connectMongo(res);

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
    mongoClient.close();
    res.send(listMessages);
  } catch {
    mongoClient.close();
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { mongoClient, db } = await connectMongo(res);
  // sanitizar todos os parâmetros de mensagem
  // ---
  // const messageTrated = stripHtml(req.body.text);
  // const participant = { name: nameTreated.result.trim() };
  const message = { ...req.body, from: req.headers.user };

  const validation = messageSchema.validate(message, { abortEarly: false });
  if (validation.error) {
    const err = validation.error.details.map((detail) => detail.message);
    mongoClient.close();
    res.status(422).send(err);
    return;
  }
  // type não pode ser private se o "to" for "todos"
  const participantLogged = await db
    .collection("participant")
    .find({ name: message.from })
    .toArray();
  if (participantLogged.length === 0) {
    mongoClient.close();
    res.status(422).send("user does not have permission");
    return;
  }

  try {
    const status = await db
      .collection("messages")
      .insertOne({ ...message, time: dayjs().format("HH:mm:ss").toString() });
    if (status) {
      mongoClient.close();
      res.sendStatus(201);
    }
  } catch {
    mongoClient.close();
    res.sendStatus(500);
  }
});

app.delete("/messages/:idMessage", async (req, res) => {
  const { mongoClient, db } = await connectMongo(res);

  const user = req.headers.user;
  const { idMessage } = req.params;

  try {
    const messageExist = await db
      .collection("messages")
      .find({ _id: new ObjectID(idMessage) })
      .toArray();

    if (messageExist.length === 0) {
      mongoClient.close();
      res.sendStatus(404);
    } else if (messageExist[0].from !== user) {
      mongoClient.close();
      res.sendStatus(401);
    } else {
      await db
        .collection("messages")
        .deleteOne({ _id: new ObjectID(idMessage) });
      mongoClient.close();
      res.sendStatus(200);
    }
  } catch (err) {
    mongoClient.close();
    res.sendStatus(500);
  }
});

app.put("/messages/:idMessage", (req, res) => {});

app.post("/status", async (req, res) => {
  const { mongoClient, db } = await connectMongo(res);

  const user = req.headers.user;

  try {
    const participant = await db
      .collection("participant")
      .find({ name: user })
      .toArray();

    if (participant.length > 0) {
      const status = await db.collection("participant").updateOne(
        {
          _id: participant[0]._id,
        },
        { $set: { lastStatus: Date.now() } }
      );
      if (status) {
        res.sendStatus(200);
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
