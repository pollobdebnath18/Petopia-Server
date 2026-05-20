const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
app.use(cors());
dotenv.config();
app.use(express.json());
const port = process.env.PORT || 8000;

const uri = process.env.MONGODB_URI;

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
      const { search, species } = req.query;

      let cursor;

      if (search) {
        cursor = await petsCollection.find({
          petName: {
            $regex: search,
            $options: "i",
          },
        });
      }
      else if(species){
        
      }
      else {
        cursor = petsCollection.find();
      }

      const result = await cursor.toArray();
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

    app.post("/pets", async (req, res) => {
      const getData = req.body;
      // console.log(getData, "getdata  ");
      const result = await petsCollection.insertOne(getData);
      res.json(result);
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
