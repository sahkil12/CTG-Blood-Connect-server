const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
const admin = require('firebase-admin');
// middleware
app.use(cors());
app.use(express.json());
// firebase admin
const serviceAccount = require('./firebase-admin-sdk.json');

admin.initializeApp({
     credential: admin.credential.cert(serviceAccount)
});
// mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gr8kgxz.mongodb.net/?appName=Cluster0`;
// mongodb client
const client = new MongoClient(uri)

async function run() {
     try {
          // await client.connect();
          const db = client.db("CTG-Blood-Connect")
          const donorsCollection = db.collection("donors")
          const usersCollection = db.collection("users")
          // jwt token verify
          const verifyFirebaseToken = async (req, res, next) => {
               try {
                    const authHeader = req.headers.authorization;

                    if (!authHeader || !authHeader.startsWith('Bearer ')) {
                         return res.status(401).json({ message: 'Unauthorized access' });
                    }
                    const token = authHeader.split(' ')[1];
                    if (!token) {
                         return res.status(401).send({ message: "unauthorized access" });
                    }
                    const decodedUser = await admin.auth().verifyIdToken(token);
                    req.user = decodedUser;
                    next();
               } catch (error) {
                    return res.status(403).json({ message: 'Forbidden access' });
               }
          };
          // 
          const verifyEmailMatch = (req, res, next) => {
               const emailFromParams = req.params.email;
               const emailFromToken = req.user?.email;

               if (!emailFromParams || !emailFromToken) {
                    return res.status(403).json({ message: 'Forbidden access' });
               }

               if (emailFromParams !== emailFromToken) {
                    return res.status(403).json({ message: 'Forbidden access' });
               }

               next();
          };
          // 
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
          app.get('/donors/:email', verifyFirebaseToken, verifyEmailMatch, async (req, res) => {
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
          app.post('/donors', verifyFirebaseToken, verifyEmailMatch, async (req, res) => {
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
          app.get('/users', verifyFirebaseToken, verifyEmailMatch, async (req, res) => {
               const result = await usersCollection.find().toArray()
               res.send(result)
          })
          // 
          app.get('/users/:email', verifyFirebaseToken, verifyEmailMatch, async (req, res) => {
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
          // Delete donor by email
          app.delete('/donors/:email', verifyFirebaseToken, verifyEmailMatch, async (req, res) => {
               try {
                    const email = req.params.email;

                    const deleteResult = await donorsCollection.deleteOne({ email });

                    if (deleteResult.deletedCount === 0) {
                         return res.status(404).json({
                              message: "Donor not found"
                         });
                    }
                    // role update 
                    const updateResult = await usersCollection.updateOne(
                         { email },
                         { $set: { role: "user" } }
                    );

                    res.json({
                         message: "Donor removed and role updated",
                         deletedCount: deleteResult.deletedCount,
                         updatedUser: updateResult.modifiedCount
                    });
               } catch (error) {
                    res.status(500).json({
                         message: error.message
                    });
               }
          });
          // Update donor data by email
          app.patch('/donors/:email', verifyFirebaseToken, verifyEmailMatch, async (req, res) => {
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
