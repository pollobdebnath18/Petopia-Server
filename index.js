const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
app.use(cors());
dotenv.config();
const port = process.env.PORT || 8000;

const uri = process.env.MONGODB_URI;
// "mongodb://petopia:HJMVKaZIcJwxPimC@ac-mpjzkew-shard-00-00.0wxl8hn.mongodb.net:27017,ac-mpjzkew-shard-00-01.0wxl8hn.mongodb.net:27017,ac-mpjzkew-shard-00-02.0wxl8hn.mongodb.net:27017/?ssl=true&replicaSet=atlas-13w1b2-shard-0&authSource=admin&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    const db = client.db("petopiadb");
    const petsCollection = db.collection("pets");

    app.get("/pets", async (req, res) => {
      const result = await petsCollection.find().toArray();
      res.send(result);
    });

    app.get("/pets/:petsId", async (req, res) => {
      const { petsId } = req.params;
      const query = {
        _id: new ObjectId(petsId),
      };
      const result = await petsCollection.findOne(query);
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
