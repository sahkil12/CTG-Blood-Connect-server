const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
// middleware
app.use(cors());
app.use(express.json());

// mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gr8kgxz.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri)

async function run() {
     try {
          await client.connect();
          const db = client.db("CTG-Blood-Connect")
          const donorsCollection = db.collection("donors")

          app.get('/donors', async (req, res) => {
               const { bloodGroup, area, limit = 12, page = 1 } = req.query

               let query = {}
               if (bloodGroup) query.bloodGroup = bloodGroup;
               if (area) query.area = area;

               const skip = (Number(page) - 1) * Number(limit);
               const total = await donorsCollection.countDocuments(query);

               const donors = await donorsCollection
                    .find(query)
                    .skip(skip)
                    .limit(Number(limit))
                    .toArray();
               res.send({
                    donors,
                    total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: Number(page),
               });
          })
          //post donors data 
          app.post('/donors', async (req, res) => {
               try {
                    const donor = req.body;
                    const email = donor.email
                    // duplicate donor apply check
                    const existingDonor = await donorsCollection.findOne({ email })
                    if (existingDonor) {
                         return res.status(409).json({
                              message: 'This email is already registered as a donor'
                         })
                    }

                    donor.available = true;
                    const result = await donorsCollection.insertOne(donor);

                    res.status(201).json({
                         message: 'Donor added successfully',
                         insertedId: result.insertedId
                    });
               } catch (error) {
                    res.status(500).json({ message: error.message });
               }
          });

          // Send a ping to confirm a successful connection
          await client.db("admin").command({ ping: 1 });
          console.log("Pinged your deployment. You successfully connected to MongoDB!");
     } finally {
          // Ensures that the client will close when you finish/error
          // await client.close();
     }
}
run().catch(console.dir);

app.get('/', (req, res) => {
     res.send('CTG Blood Connect Server Running');
});

app.listen(PORT, () => {
     console.log(`Server running on port ${PORT}`);
})
