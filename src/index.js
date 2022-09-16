import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import connect from "./db.js";
import mongo, { ConnectionClosedEvent } from "mongodb";
import auth from "./auth.js";

const app = express(); // instanciranje aplikacije
const port =  process.env.PORT; // port na kojem će web server slušati

app.use(cors()); // omogući CORS na svim rutama
app.use(express.json()); //modul za dekodiranje JSON poruke

//--------------- sve za recepte ---------------//

//dohvat svih recepata i pretraga
app.get("/recepti", async (req, res) => {
  let db = await connect(); //spajanje na bazu
  let query = req.query; //da bi dobili parametre
  let selekcija = {}; //radimo prazan objekt tako da ako korisnik ne pretražuje da vrati sve recepte
  if (query.nazivRecepta) {
    //RegExp koristimo da bi se pretraživana riječ tražila u cijelom nazivu recepta
    //i unutar RegExp koristimo kako veličina slova ne bi igrala ulogu u pretraživanju
    selekcija.nazivRecepta = new RegExp(query.nazivRecepta, "i");
  }
  console.log("Selekcija", selekcija);

  //find metoda pretražuje dokumente u kolekciji
  let cursor = await db
    .collection("recepti")
    .find(selekcija)
    .sort({ objavljeno: -1 });
  //rezultati se dohvaćaju pomoću kursora
  //toArray() sve dokumente pod kursorom pretvara u listu objekata
  let results = await cursor.toArray();
  res.json(results);
});

//dohvat jednog recepta po id
//id definira dinamičnu rutu
//dinamična ruta je jer hendla sve moguće kombinacije id-jeva koji će doći ovdje
app.get("/recepti/:id", async (req, res) => {
  let id = req.params.id; //ovako čitamo id iz url-a parametra
  let db = await connect(); //spajamo se na bazu
  var ObjectId = require("mongodb").ObjectId; //dodano jer je bacalo grešku za ObjectId
  //findOne vraća prvi dokument na koji naiđe. Koji odgovora uvjetu.
  //zato ne radi kursor. Nije potreban
  let doc = await db.collection("recepti").findOne({ _id: ObjectId(id) });
  res.json(doc);
});

//brisanje određenog recepta i svih njegovih komentara
app.delete("/recepti/:id", async (req, res) => {
  let id = req.params.id;
  let db = await connect();
  var ObjectId = require("mongodb").ObjectId;
  let result = await db.collection("recepti").deleteOne({ _id: ObjectId(id) });
  if (result && result.deletedCount == 1) {
    let result2 = await db.collection("comment").deleteMany({ idRecepta: id });
    res.json({ status: "success" });
  } else {
    res.json({ status: "fail" });
  }
});

//funkcija checkAttributes provjerava atribute koje je unio korisnik
let checkAttributes = (data) => {
  if (
    !data.slika ||
    !data.nazivRecepta ||
    !data.sastojci ||
    !data.priprema ||
    !data.težinaPripreme ||
    !data.brojOsoba ||
    !data.vrijemePripreme ||
    !data.grupaJela ||
    !data.kategorija
  ) {
    return false;
  }
  return true;
};

//kreiranje novog recepta
app.post("/recepti", async (req, res) => {
  let data = req.body; //data su podaci sa frontenda
  let check = checkAttributes(data);
  if (!check) {
    res.json({
      status: "fail",
      reason: "incomplete post",
    });
    return;
  }
  let db = await connect();
  let result = await db.collection("recepti").insertOne(data); //insertOne dodaje jedan dokument u kolekciju recepti
  if (result) {
    res.json({ status: "success" });
  } else {
    res.json({ status: "fail" });
  }
});

//dohvat svih recepata po odabranom filteru
app.get("/recepti/filter/:filter", async (req, res) => {
  let filter = req.params.filter;
  let db = await connect();
  //traži recepte ili po kategoriji ili po grupi jela
  let cursor = await db
    .collection("recepti")
    .find({ $or: [{ kategorija: filter }, { grupaJela: filter }] })
    .sort({ objavljeno: -1 });
  let results = await cursor.toArray();
  res.json(results);
});

//dohvat svih recepata određenog korisnika
app.get("/recepti/korisnik/:korisnik", async (req, res) => {
  let username = req.params.korisnik;
  let db = await connect();
  let cursor = await db
    .collection("recepti")
    .find({ korisnik: username })
    .sort({ objavljeno: -1 });
  let results = await cursor.toArray();
  res.json(results);
});

//dohvat random recepta
app.get("/recepti-slucajni", async (req, res) => {
  let db = await connect();
  let cursor = db.collection("recepti").aggregate([{ $sample: { size: 1 } }]);
  let result = await cursor.toArray();
  let doc = result[0];
  res.json(doc);
});

//dohvat recepta sa najviše komentara
app.get("/recepti-popularni", async (req, res) => {
  let db = await connect();
  let cursor = await db.collection("comment").aggregate([
    {
      //group - grupira komentare po id recepta kojem pripadaju te ih stavlja u polje _id
      //sum - zbraja koliko puta se određeni recept pojavljuje te se rezultat stavlja u polje num
      //sort - služi da sortirtamo rezultate silazno
      //limit - služi da dobijemo id recepta koji ima najviše komentara
      $group: {
        _id: "$idRecepta",
        num: {
          $sum: 1,
        },
      },
    },
    {
      $sort: {
        num: -1,
      },
    },
    {
      $limit: 1,
    },
  ]);
  let result = await cursor.toArray();

  var ObjectId = require("mongodb").ObjectId;
  //nakon što smo dobili id recepta koji ima najviše komentara
  //pronalazimo ga u kolekciji recepti da dobijemo njegove podatke
  let doc = await db
    .collection("recepti")
    .findOne({ _id: ObjectId(result[0]._id) });
  res.json(doc);
});

//--------------- sve za komentare ---------------//

//kreiranje novog komentara
app.post("/recepti/:id/komentari", async (req, res) => {
  let data = req.body;
  let db = await connect();
  let result = await db.collection("comment").insertOne(data);
  if (result && result.acknowledged == true) {
    console.log(result);
    res.json({ status: "success" });
  } else {
    res.json({ status: "fail" });
  }
});

//dohvat svih komentara
app.get("/recepti/:id/komentari", async (req, res) => {
  let id = req.params.id;
  let db = await connect();
  let cursor = await db
    .collection("comment")
    .find({ idRecepta: id })
    .sort({ objavljeno: -1 });
  let results = await cursor.toArray();
  res.json(results);
});

//brisanje određenog komentara
app.delete("/recepti/komentari/:komentarid", async (req, res) => {
  let idkomentara = req.params.komentarid;
  let db = await connect();
  var ObjectId = require("mongodb").ObjectId;
  let result = await db
    .collection("comment")
    .deleteOne({ _id: ObjectId(idkomentara) });
  if (result && result.deletedCount == 1) {
    res.json({ status: "success" });
  } else {
    res.json({ status: "fail" });
  }
});

//mijenjanje određenog komentara
app.patch("/recepti/komentari/:komentarid", async (req, res) => {
  let id = req.params.komentarid;
  let data = req.body;
  delete data._id;
  let db = await connect();
  var ObjectId = require("mongodb").ObjectId;
  let result = await db
    .collection("comment")
    .updateOne({ _id: ObjectId(id) }, { $set: data });
  if (result && result.modifiedCount == 1) {
    console.log(result);
    res.json({ status: "success" });
  } else {
    res.json({ status: "fail" });
  }
});

//--------------- sve za prijavu i registraciju ---------------//

//za registraciju
app.post("/users", async (req, res) => {
  //dohvaćamo korisnika iz podataka sa frontenda
  let user = req.body;
  let id;
  try {
    id = await auth.registerUser(user); //poziv funkcije iz auth.js
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
  res.json({ id: id });
});

//za prijavu
app.post("/auth", async (req, res) => {
  let user = req.body;

  try {
    //poziv funkcije sa podacima koji su došli sa frontenda
    let result = await auth.authenticateUser(user.username, user.password);
    res.json(result);
  } catch (e) {
    res.status(401).json({ erorr: e.message });
  }
});

//auth.verify je middleware funkcija. Izvršava se prije ostatka koda (tijela funkcije)
app.get("/tajna", [auth.verify], (req, res) => {
  res.json({ message: "Ovo je tajna " + req.jwt.username });
});

//promjena lozinke
//auth.verify koristimo jer korisnik mora biti ulogiran
app.patch("/users", async (req, res) => {
  //podaci koje je korisnik poslao s frontenda
  let changes = req.body;
  //dobivanje korisničkog imena od korisnika
  //let username = req.jwt.username
  //ako podaci sa frontenda imaju i staru i novu lozinku
  if (changes.new_password && changes.old_password) {
    //poziv funkcije te spremanje podataka
    let result = await auth.changeUserPassword(
      changes.korisnik,
      changes.old_password,
      changes.new_password
    );
    if (result) {
      res.status(201).send();
    } else {
      res.status(500).json({ error: "cannot change password" });
    }
  } else {
    res.status(400).json({ error: "Krivi upit" });
  }
});

app.listen(port, () => console.log(`Slušam na portu ${port}!`));
