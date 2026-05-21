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
    const requestCollection = db.collection("requests");

    app.get("/requests", async (req, res) => {
      try {
        const { email } = req.query;

        // validation
        if (!email) {
          return res.status(400).send({
            message: "Email is required",
          });
        }

        // find requests by user email
        const result = await requestCollection
          .find({ email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.log(error);

        res.status(500).send({
          message: "Failed to get requests",
        });
      }
    });

    app.get("/requests/pet/:petId", async (req, res) => {
      try {
        const { petId } = req.params;

        const result = await requestCollection
          .find({ petId })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to get requests" });
      }
    });

    app.patch("/requests/:requestId", async (req, res) => {
      try {
        const { requestId } = req.params;
        const { status } = req.body;

        const request = await requestCollection.findOne({
          _id: new ObjectId(requestId),
        });

        if (!request) {
          return res.status(404).send({ message: "Request not found" });
        }

        //  Update selected request
        await requestCollection.updateOne(
          { _id: new ObjectId(requestId) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        //  If APPROVED → hide/reject all others for same pet
        if (status === "approved") {
          await requestCollection.updateMany(
            {
              petId: request.petId,
              _id: { $ne: new ObjectId(requestId) },
            },
            {
              $set: {
                status: "rejected", // or "hidden"
                updatedAt: new Date(),
              },
            },
          );
        }

        res.send({ message: "Updated successfully" });
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Update failed" });
      }
    });

    app.post("/requests", async (req, res) => {
      try {
        const requestData = req.body;

        // CHECK EXISTING REQUEST
        const alreadyRequested = await requestCollection.findOne({
          petId: requestData.petId,
          email: requestData.email,
        });

        if (alreadyRequested) {
          return res.status(400).send({
            message: "You already requested this pet",
          });
        }

        const result = await requestCollection.insertOne({
          ...requestData,
          createdAt: new Date(),
        });

        res.send(result);
      } catch (error) {
        console.log(error);

        res.status(500).send({
          message: "Failed to create request",
        });
      }
    });

    app.delete("/requests/:requestId", async (req, res) => {
      try {
        const { requestId } = req.params;
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({ message: "Email required" });
        }

        const request = await requestCollection.findOne({
          _id: new ObjectId(requestId),
        });

        if (!request) {
          return res.status(404).send({ message: "Request not found" });
        }

        //  AUTH CHECK
        if (request.email !== email) {
          return res.status(403).send({ message: "Not allowed" });
        }

        const result = await requestCollection.deleteOne({
          _id: new ObjectId(requestId),
        });

        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to delete request" });
      }
    });

    app.get("/pets", async (req, res) => {
      try {
        const { search, species, sort, email } = req.query;

        let query = {};

        // search filter
        if (search) {
          query.petName = {
            $regex: search,
            $options: "i",
          };
        }

        // species filter
        if (species) {
          query.species = species;
        }

        //my-listings
        if (email) {
          query.ownerEmail = email;
        }

        let cursor = petsCollection.find(query);
        //sort
        if (sort == "low-high") {
          cursor = cursor.sort({ adoptionFee: 1 });
        }
        if (sort == "high-low") {
          cursor = cursor.sort({ adoptionFee: -1 });
        }
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        console.log(error);
      }
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
      const petsData = req.body;
      // console.log(getData, "getdata  ");
      petsData.adoptionFee = Number(petsData.adoptionFee);
      petsData.age = Number(petsData.age);

      const result = await petsCollection.insertOne(petsData);
      res.json(result);
    });

    app.patch("/pets/:petsId", async (req, res) => {
      try {
        const { petsId } = req.params;
        const { email } = req.query;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const query = { _id: new ObjectId(petsId) };

        const pet = await petsCollection.findOne(query);

        if (!pet) {
          return res.status(404).send({ message: "Pet not found" });
        }

        // 🔒 AUTH CHECK
        if (pet.ownerEmail !== email) {
          return res.status(403).send({
            message: "You are not allowed to update this pet",
          });
        }

        // 📦 UPDATE DATA
        const updateData = req.body;

        const updateDoc = {
          $set: updateData,
        };

        const result = await petsCollection.updateOne(query, updateDoc);

        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to update pet" });
      }
    });

    app.delete("/pets/:petsId", async (req, res) => {
      try {
        const { petsId } = req.params;
        const { email } = req.query; // 👈 frontend sends user email

        if (!ObjectId.isValid(petsId)) {
          return res.status(400).send({ message: "Invalid pet ID" });
        }

        const pet = await petsCollection.findOne({
          _id: new ObjectId(petsId),
        });

        if (!pet) {
          return res.status(404).send({ message: "Pet not found" });
        }

        // 🔒 AUTH CHECK
        if (pet.ownerEmail !== email) {
          return res.status(403).send({
            message: "You are not allowed to delete this pet",
          });
        }

        const result = await petsCollection.deleteOne({
          _id: new ObjectId(petsId),
        });

        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to delete pet" });
      }
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
