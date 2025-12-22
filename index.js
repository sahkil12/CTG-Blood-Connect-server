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
// mongodb client
const client = new MongoClient(uri)

async function run() {
     try {
          await client.connect();
          const db = client.db("CTG-Blood-Connect")
          const donorsCollection = db.collection("donors")
          const usersCollection = db.collection("users")

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
          // Get a single donor by email
          app.get('/donors/:email', async (req, res) => {
               try {
                    const email = req.params.email;
                    const donor = await donorsCollection.findOne({ email });

                    if (!donor) {
                         return res.status(404).json({
                              message: 'Donor not found'
                         });
                    }
                    res.send(donor);

               } catch (error) {
                    res.status(500).json({
                         message: error.message
                    });
               }
          });
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
                    // user role change 
                    await usersCollection.updateOne(
                         { email },
                         {
                              $set: {
                                   role: 'donor'
                              }
                         }
                    );
                    res.status(201).json({
                         message: 'Donor added successfully',
                         insertedId: result.insertedId
                    });
               } catch (error) {
                    res.status(500).json({ message: error.message });
               }
          });
          // 
          app.get('/users', async (req, res) => {
               const result = await usersCollection.find().toArray()
               res.send(result)
          })
          // 
          app.get('/users/:email', async (req, res) => {
               const email = req.params.email;

               try {
                    const user = await usersCollection.findOne({ email });

                    if (!user) {
                         return res.status(404).json({ message: 'User not found' });
                    }
                    res.send(user);
               } catch (error) {
                    res.status(500).json({ message: error.message });
               }
          });
          // users data 
          app.post('/users', async (req, res) => {
               try {
                    const user = req.body;
                    const { email } = user;
                    // check if user already exists
                    const existingUser = await usersCollection.findOne({ email });

                    if (existingUser) {
                         return res.status(200).json({
                              message: 'User already exists'
                         });
                    }
                    // set role 
                    user.role = 'user';
                    user.createdAt = new Date();

                    const result = await usersCollection.insertOne(user);

                    res.status(201).json({
                         message: 'User registered successfully',
                         insertedId: result.insertedId
                    });

               } catch (error) {
                    res.status(500).json({ message: error.message });
               }
          });
          // delete
          // app.delete('/donors/:email', async (req, res) => {
          //      const email = req.params.email;

          //      await donorsCollection.deleteOne({ email });

          //      await usersCollection.updateOne(
          //           { email },
          //           { $set: { role: "user" } }
          //      );

          //      res.send({ message: "Donor removed and role updated" });
          // });

          // edit
          // app.patch('/donors/:email', async (req, res) => {
          //      const email = req.params.email;
          //      const updatedData = req.body;

          //      const result = await donorsCollection.updateOne(
          //           { email },
          //           { $set: updatedData }
          //      );

          //      res.send(result);
          // });
          // Update donor data by email
          app.patch('/donors/:email', async (req, res) => {
               try {
                    const email = req.params.email;
                    const updatedData = req.body;
                    // Database update
                    const result = await donorsCollection.updateOne(
                         { email },
                         {
                              $set: {
                                   ...updatedData,
                                   updatedAt: new Date()
                              }
                         }
                    );
                    res.json({
                         message: 'Donor updated successfully',
                         modifiedCount: result.modifiedCount
                    });
               } catch (error) {
                    res.status(500).json({
                         message: error.message
                    });
               }
          });
          // Send a ping to confirm a successful connection
          await client.db("admin").command({ ping: 1 });
          console.log("Pinged your deployment. You successfully connected to MongoDB!");
     } finally {
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
