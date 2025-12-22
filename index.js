require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

/*
  ? TODOS:
  ? tutor, admin, profile settings, logout(dashboard), then all the mainlayout design, payment & revenue
*/

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
	"utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const app = express();

//* middleware
app.use(
	cors({
		origin: [process.env.CLIENT_DOMAIN],
		credentials: true,
		optionSuccessStatus: 200,
	})
);
app.use(express.json());
// jwt middlewares
const verifyJWT = async (req, res, next) => {
	const token = req?.headers?.authorization?.split(" ")[1];
	console.log(token);
	if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
	try {
		const decoded = await admin.auth().verifyIdToken(token);
		req.tokenEmail = decoded.email;
		console.log(decoded);
		next();
	} catch (err) {
		console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
	}
};

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
    const tuitionsCollection = db.collection("tuitions");
    const applicationsCollection = db.collection("applications");

    // role base middleware
    const verifyAdmin = async(req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });

      if(user?.role !== 'admin') return res.status(403).send({ message: "Admin only actions!" });
      next();
    }
    const verifyStudent = async(req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });

      if(user?.role !== 'student') return res.status(403).send({ message: "Student only actions!" });
      next();
    } 
    const verifyTutor = async(req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });

      if(user?.role !== 'tutor') return res.status(403).send({ message: "Tutor only actions!" });
      next();
    }

    //* user related api
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
    app.get('/user/role', verifyJWT, async(req, res) => {
      const result = await usersCollection.findOne({ email: req.tokenEmail });
      res.send({ role: result?.role });
    })

    //* student dashboard related api
    app.post('/tuitions', verifyJWT, verifyStudent, async (req, res) => {
      const tuitionData = req.body;

      const newTuition = {
        ...tuitionData,
        studentEmail: req.tokenEmail,
        status: 'pending',
        postedAt: new Date(),
        applicantsCount: 0
      }

      const result = await tuitionsCollection.insertOne(newTuition);
      res.send(result);
    })

    app.get('/my-tuitions', verifyJWT, verifyStudent, async (req, res) => {
      const query = { studentEmail: req.tokenEmail };
      const result = await tuitionsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete('/tuition/:id', verifyJWT, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tuitionsCollection.deleteOne(query);
      res.send(result);
    });
    app.get('/applications/received', verifyJWT, verifyStudent, async (req, res) => {
      const query = { studentEmail: req.tokenEmail };
      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    });
    app.patch('/application/status/:id', verifyJWT, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status }
      };

      const result = await applicationsCollection.updateOne(query, updateDoc);
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
