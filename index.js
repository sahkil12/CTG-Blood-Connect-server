const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
const admin = require('firebase-admin');
// middleware
app.use(cors({
     origin: [
          "http://localhost:5173",
          "https://ctg-blood-connect.web.app"
     ],
     credentials: true,
}));

app.use(express.json());
// firebase admin
const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decodedKey)

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
                    try {
                         const decodedUser = await admin.auth().verifyIdToken(token);
                         req.user = decodedUser;
                         next();
                    } catch (err) {
                         return res.status(401).json({ message: "Invalid token" });
                    }
               } catch (error) {
                    return res.status(403).json({ message: 'Forbidden access' });
               }
          };
          // email verify check middleware
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
          // admin verify middleware
          const verifyAdmin = async (req, res, next) => {
               const email = req.user?.email;
               if (!email) return res.status(403).send({ message: "Forbidden" });

               const user = await usersCollection.findOne({ email });
               if (user?.role !== "admin") {
                    return res.status(403).send({ message: "Admin only" });
               }
               next();
          };
          // ger all donors data 
          app.get('/donors', async (req, res) => {
               try {
                    const { bloodGroup, area, limit = 12, page = 1 } = req.query;

                    const query = {};

                    if (bloodGroup && bloodGroup.trim() !== "") {
                         query.bloodGroup = bloodGroup;
                    }

                    if (area && area.trim() !== "") {
                         query.area = area;
                    }

                    const skip = (Number(page) - 1) * Number(limit);

                    const donors = await donorsCollection
                         .find(query)
                         .skip(skip)
                         .limit(Number(limit))
                         .toArray();

                    const total = await donorsCollection.countDocuments(query);

                    res.send({
                         donors,
                         total,
                         totalPages: Math.ceil(total / Number(limit)),
                         currentPage: Number(page),
                    });
               } catch (error) {
                    res.status(500).json({ donors: [], total: 0 });
               }
          });
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
          app.post('/donors', verifyFirebaseToken, async (req, res) => {
               try {
                    const donor = req.body;
                    const email = req.user.email
                    donor.email = email
                    // duplicate donor apply check
                    const existingDonor = await donorsCollection.findOne({ email })
                    if (existingDonor) {
                         return res.status(409).json({
                              message: 'This email is already registered as a donor'
                         })
                    }
                    donor.available = true;
                    donor.createdAt = new Date();
                    const result = await donorsCollection.insertOne(donor);
                    // user role change 
                    await usersCollection.updateOne(
                         { email },
                         {
                              $set: {
                                   isDonor: true
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
          // get all user
          app.get('/users', verifyFirebaseToken, async (req, res) => {
               const result = await usersCollection.find().toArray()
               res.send(result)
          })
          // get user with email for role 
          app.get('/users/:email', verifyFirebaseToken, verifyEmailMatch, async (req, res) => {
               const email = req.params.email;

               try {
                    const user = await usersCollection.findOne({ email });

                    if (!user) {
                         return res.send({
                              email,
                              role: "user",
                              isDonor: false
                         });
                    }
                    res.send(user);
               } catch (error) {
                    res.status(500).json({ message: error.message });
               }
          });
          // users data 
          app.post('/users', async (req, res) => {
               try {
                    const { email, name, photo } = req.body;
                    // check if user already exists
                    const existingUser = await usersCollection.findOne({ email });

                    if (existingUser) {
                         return res.status(200).json({
                              message: 'User already exists',
                         });
                    }
                    const newUser = {
                         email,
                         name,
                         photo,
                         role: "user",
                         isDonor: false,
                         createdAt: new Date()
                    };

                    const result = await usersCollection.insertOne(newUser);

                    res.status(201).json({
                         message: "User created",
                         insertedId: result.insertedId,
                         role: "user"
                    });

               } catch (error) {
                    res.status(500).json({ message: error.message });
               }
          });
          // get admin dashboard stats data api
          app.get("/admin/dashboard-stats", verifyFirebaseToken, verifyAdmin, async (req, res) => {
               try {
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                    const [
                         totalUsers,
                         totalDonors,
                         availableDonors,
                         last7DaysUsers,
                         last7DaysDonors,
                         totalAdmins,
                    ] = await Promise.all([
                         usersCollection.countDocuments(),
                         donorsCollection.countDocuments(),
                         donorsCollection.countDocuments({ available: true }),
                         usersCollection.countDocuments({
                              createdAt: { $gte: sevenDaysAgo },
                         }),
                         donorsCollection.countDocuments({
                              createdAt: { $gte: sevenDaysAgo },
                         }),
                         usersCollection.countDocuments({ role: "admin" }),
                    ]);

                    res.send({
                         totalUsers,
                         totalDonors,
                         availableDonors,
                         last7DaysUsers,
                         last7DaysDonors,
                         totalAdmins,
                    });
               } catch (error) {
                    res.status(500).send({ message: error.message });
               }
          }
          );
          // get user for admin
          app.get("/admin/users", verifyFirebaseToken, verifyAdmin,  async (req, res) => {
               const { email = "", limit = 15 } = req.query;
               const query = email
                    ? { email: { $regex: email, $options: "i" } }
                    : {};

               const users = await usersCollection
                    .find(query)
                    .limit(Number(limit))
                    .sort({ createdAt: -1 })
                    .toArray();

               const total = await usersCollection.countDocuments(query);

               res.send({
                    users,
                    total
               });
          });

          // app.patch("/admin/users/make-admin/:id", verifyAdmin, async (req, res) => {
          //      await usersCollection.updateOne(
          //           { _id: new ObjectId(req.params.id) },
          //           { $set: { role: "admin" } }
          //      );
          //      res.send({ success: true });
          // });

          // app.patch("/admin/users/remove-admin/:id", verifyAdmin, async (req, res) => {
          //      await usersCollection.updateOne(
          //           { _id: new ObjectId(req.params.id) },
          //           { $set: { role: "user" } }
          //      );
          //      res.send({ success: true });
          // });


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
                         {
                              $set: {
                                   isDonor: false
                              }
                         }
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
