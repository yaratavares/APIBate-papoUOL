import express, { json } from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";
dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

const participantSchema = joi.object({
  name: joi.string().required(),
});

const messageSchema = joi.object({
  from: joi.string().required(),
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().required(),
  time: joi.string(),
});

mongoClient.connect().then(() => {
  db = mongoClient.db("batepapo_uol");
});

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

    const enterMessage = await db.collection("messages").insertOne({
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
  try {
    const status = await db.collection("messages").insertOne(req.body);
    if (status) {
      res.status(201).send(status);
    }
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

app.get("/messages", async (req, res) => {
  try {
    const listMessages = await db.collection("messages").find().toArray();
    res.send(listMessages);
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

app.post("/post", async (req, res) => {
  try {
    const status = await db
      .collection("participant")
      .find({ name: req.headers.user })
      .toArray();
    if (status.length !== 0) {
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
    mongoClient.close();
  } catch (err) {
    res.sendStatus(404);
    mongoClient.close();
  }
});

app.listen(4000, () => {
  console.log("Servidor rodando na porta 4000");
});
