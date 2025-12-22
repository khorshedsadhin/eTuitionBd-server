require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

/*
  ? TODOS:
  ? 1. jwt, axios, role base middleware, dashboard role based, student, tutor, admin, then all the mainlayout design
*/

const app = express();

// middleware
app.use(
	cors({
		origin: [process.env.CLIENT_DOMAIN],
		credentials: true,
		optionSuccessStatus: 200,
	})
);
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});
async function run() {
	try {
    const db = client.db("eTuitionBD");
    const usersCollection = db.collection("users");

    //* save user to database
    app.post('/user', async(req, res) => {
      const userData = req.body;
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      
      const query = { email: userData.email };
      const alreadyExists = await usersCollection.findOne(query);
      console.log('user already exists ----> ', !!alreadyExists);

      if(alreadyExists) {
        console.log('updating user info...');
        const result = usersCollection.updateOne(query, { $set: { last_loggedIn: new Date().toISOString() } });
        return res.send(result);
      }

      console.log("saving new user info...");
      const result = await usersCollection.insertOne(userData);
      
      res.send(result);
    });








		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log(
			"Pinged your deployment. You successfully connected to MongoDB!"
		);
	} finally {
		// Ensures that the client will close when you finish/error
	}
}
run().catch(console.dir);

app.get("/", (req, res) => {
	res.send("Hello from eTuitionBd...");
});

app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
