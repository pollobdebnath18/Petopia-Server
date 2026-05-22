const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
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

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // console.log(token);
  try {
    const { payload } = await jwtVerify(token, JWKS);
    // console.log(payload);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forrbidden" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    const db = client.db("petopiadb");
    const petsCollection = db.collection("pets");
    const requestCollection = db.collection("requests");

    app.get("/requests",verifyToken, async (req, res) => {
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

    //MyListingCard -> for increase the request count
    app.get("/requests/count/:petId", async (req, res) => {
      const { petId } = req.params;

      const count = await requestCollection.countDocuments({
        petId,
      });

      res.send({ count });
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

        //  update request status
        await requestCollection.updateOne(
          { _id: new ObjectId(requestId) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        //  IF APPROVED → LOCK PET
        if (status === "approved") {
          await petsCollection.updateOne(
            { _id: new ObjectId(request.petId) },
            {
              $set: {
                isAdopted: true,
                adoptedBy: request.email,
              },
            },
          );

          //  reject all other requests
          await requestCollection.updateMany(
            {
              petId: request.petId,
              _id: { $ne: new ObjectId(requestId) },
            },
            {
              $set: {
                status: "rejected",
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

    app.post("/requests", verifyToken, async (req, res) => {
      try {
        const requestData = req.body;

        if (!requestData.petId || !requestData.email) {
          return res.status(400).send({
            message: "Missing petId or email",
          });
        }

        const pet = await petsCollection.findOne({
          _id: new ObjectId(requestData.petId),
        });

        if (!pet) {
          return res.status(404).send({ message: "Pet not found" });
        }

        //  OWNER CHECK
        if (pet.ownerEmail === requestData.email) {
          return res.status(403).send({
            message: "You cannot adopt your own pet",
          });
        }

        //  ALREADY ADOPTED CHECK
        if (pet.isAdopted) {
          return res.status(400).send({
            message: "This pet is already adopted",
          });
        }

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
          status: "pending",
          createdAt: new Date(),
        });

        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to create request" });
      }
    });

    //my requests -> delete each request
    app.delete("/requests/:requestId", verifyToken, async (req, res) => {
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

    app.get("/pets/:petsId", verifyToken, async (req, res) => {
      try {
        const { petsId } = req.params;

        //  validate ObjectId
        if (!ObjectId.isValid(petsId)) {
          return res.status(400).send({ message: "Invalid pet ID" });
        }

        const result = await petsCollection.findOne({
          _id: new ObjectId(petsId),
        });

        if (!result) {
          return res.status(404).send({ message: "Pet not found" });
        }

        //  ensure default field exists (VERY IMPORTANT for frontend)
        result.isAdopted = result.isAdopted ?? false;

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/pets", verifyToken, async (req, res) => {
      try {
        const petsData = req.body;

        const age = Number(petsData.age);
        const adoptionFee = Number(petsData.adoptionFee);

        //  validation check
        if (isNaN(age) || isNaN(adoptionFee)) {
          return res.status(400).json({
            message: "Age and Adoption Fee must be valid numbers",
          });
        }

        const newPet = {
          ...petsData,
          age,
          adoptionFee,
          isAdopted: false, //  ADD THIS

          createdAt: new Date(),
        };

        const result = await petsCollection.insertOne(newPet);

        res.json(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to create pet" });
      }
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

        //  AUTH CHECK
        if (pet.ownerEmail !== email) {
          return res.status(403).send({
            message: "You are not allowed to update this pet",
          });
        }

        // UPDATE DATA
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
        const { email } = req.query; //  frontend sends user email

        if (!ObjectId.isValid(petsId)) {
          return res.status(400).send({ message: "Invalid pet ID" });
        }

        const pet = await petsCollection.findOne({
          _id: new ObjectId(petsId),
        });

        if (!pet) {
          return res.status(404).send({ message: "Pet not found" });
        }

        //  AUTH CHECK
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
  console.log(`Example app listening on Port ${port}`);
});
