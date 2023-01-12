const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

    /**
     * API Naming Convention
     * app.get("/booking") // get all bookings in this collection. or get more than one by filtering.
     * app.get("/booking/:id") // get a specific booking data
     * app.post("/booking") // ass a new booking
     * app.patch("/booking/:id") // update an user data
     * app.delete("/booking/:id") // delete an user data
     */

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking?.treatment,
        date: booking?.date,
        user: booking?.user,
      };
      console.log(query, "query is checking");
      const exists = await bookingCollection.findOne(query);
      // console.log(exists, "exists working");
      if (exists?._id) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });
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
