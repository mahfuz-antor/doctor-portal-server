const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// jwt verify here
function verifyJWT(req, res, next) {
  console.log(req.headers.authorization, "authorizatin from verify");
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access!");
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access!" });
    }
    req.decoded = decoded;
    next();
  });
}

// mongoDB uri and client here

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.onckrto.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctor_portal")
      .collection("appointmentOptions");
    const bookingCollection = client.db("doctor_portal").collection("bookings");
    const usersCollection = client.db("doctor_portal").collection("users");
    const doctorsCollection = client.db("doctor_portal").collection("doctors");
    // getting appointment options and query booking date.
    app.get("/appointmentOptions", async (req, res) => {
      const query = {};
      const options = await serviceCollection.find(query).toArray();
      const selectDate = req.query.date;
      const bookingQuery = { date: selectDate };
      const alreadyBooked = await bookingCollection
        .find(bookingQuery)
        .toArray();
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );
        const bookedSlots = optionBooked.map((book) => book.time);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        option.slots = remainingSlots;
        // console.log(
        //   selectDate,
        //   option.name,
        //   remainingSlots.length,
        //   "slots matching"
        // );
      });
      res.send(options);
    });

    // version-2 API created.
    /** 
    app.get("/v2/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      console.log(date, "getting date for aggregate");
      const getOptions = await serviceCollection
        .aggregate([
          {
            $lookup: {
              from: "bookings",
              localField: "treatment",
              foreignField: "treatment",
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$appointmentDate", date],
                    },
                  },
                },
              ],
              as: "booked",
            },
          },
          {
            $project: {
              name: 1,
              slots: 1,
              booked: {
                $map: {
                  input: "$booked",
                  as: "book",
                  in: "$$book.time",
                },
              },
            },
          },
          {
            $project: {
              name: 1,
              slots: {
                $setDifference: ["$slots", "$booked"],
              },
            },
          },
        ])
        .toArray();
      console.log(getOptions, "new route checking");
      res.send(getOptions);
    });

    /**
     * API Naming Convention
     * app.get("/booking") // get all bookings in this collection. or get more than one by filtering.
     * app.get("/booking/:id") // get a specific booking data
     * app.post("/booking") // ass a new booking
     * app.patch("/booking/:id") // update an user data
     * app.delete("/booking/:id") // delete an user data
     */

    // checking user email and data
    app.get("/booking", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access!" });
      }
      const query = { email: email };
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking?.treatment,
        date: booking?.date,
        user: booking?.user,
      };
      // console.log(query, "query is checking");
      const exists = await bookingCollection.findOne(query);
      // console.log(exists, "exists working");
      if (exists?._id) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        return res.send({ accessToken: token });
      }
      // console.log(user, "user for jwt");
      res.status(403).send({ accessToken: "user not found" });
    });

    // getting all users
    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    // admin checking route
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    // create user collection
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
      // console.log(user, result, "checking result for users");
    });

    // setting user role
    app.put("/users/admin/:id", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ message: "forbidden access. without admin" });
      }
      const id = req.params.id;
      var ObjectId = require("mongodb").ObjectId;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // adding a doctor in a database collection
    app.post("/doctors", async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    // end the functional statements
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Doctor portal app!");
});

app.listen(port, () => {
  console.log(`Doctor Portal App Port: ${port}`);
});
