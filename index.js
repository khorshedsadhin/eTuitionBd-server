require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

/*
  ? TODOS:
  ? payment/revenue/reports
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
		origin: ['http://localhost:3001', process.env.CLIENT_DOMAIN],
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
    app.patch('/users/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const { name, photo } = req.body;
      
      const filter = { email: email };
      const updateDoc = {
        $set: {
          name: name,
          image: photo
        }
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //* public api
    app.get('/tutors', async (req, res) => {
      const query = { role: 'tutor' };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    app.get('/tuitions', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 9;
      const search = req.query.search || "";
      const skip = (page - 1) * limit;
      const query = {
        status: 'approved',
        $or: [
            { subject: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
        ]
      };

      const result = await tuitionsCollection.find(query)
        .skip(skip)
        .limit(limit)
        .toArray();
      
      const total = await tuitionsCollection.countDocuments(query);

      res.send({
        tuitions: result,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit)
      });
    });
    app.get('/home/tuitions', async (req, res) => {
      const result = await tuitionsCollection.find({ status: 'approved' })
        .sort({ postedAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get('/home/tutors', async (req, res) => {
      const result = await usersCollection.find({ role: 'tutor' })
        .limit(4)
        .toArray();
      res.send(result);
    });
    app.get('/tuition/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tuitionsCollection.findOne(query);
      res.send(result);
    });
    app.get('/application/check/:tuitionId/:email', verifyJWT, async(req, res) => {
       const { tuitionId, email } = req.params;
       const query = { tuitionId, tutorEmail: email };
       const result = await applicationsCollection.findOne(query);
       res.send({ applied: !!result });
    });

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
    app.patch('/tuition/:id', verifyJWT, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      const filter = { _id: new ObjectId(id) };
      
      const updatedDoc = {
        $set: {
          subject: item.subject,
          class: item.class,
          salary: item.salary,
          days: item.days,
          location: item.location,
          description: item.description
        }
      }
      const result = await tuitionsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //* tutor dashboard related api
    app.get('/tutor/applications', verifyJWT, verifyTutor, async (req, res) => {
      const query = { tutorEmail: req.tokenEmail };
      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/tutor/ongoing-tuitions', verifyJWT, verifyTutor, async (req, res) => {
      const query = { 
        tutorEmail: req.tokenEmail,
        status: 'accepted' 
      };
      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    });
    app.post('/applications', verifyJWT, verifyTutor, async (req, res) => {
      const applicationData = req.body;
      const query = { 
        tuitionId: applicationData.tuitionId, 
        tutorEmail: applicationData.tutorEmail 
      };
      const alreadyApplied = await applicationsCollection.findOne(query);
      
      if(alreadyApplied){
        return res.status(400).send({ message: "You have already applied to this tuition." });
      }

      const result = await applicationsCollection.insertOne(applicationData);
      
      const updateDoc = {
        $inc: { applicantsCount: 1 }
      }
      const tuitionQuery = { _id: new ObjectId(applicationData.tuitionId) };
      await tuitionsCollection.updateOne(tuitionQuery, updateDoc);

      res.send(result);
    });

    //* admin dashboard related api
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch('/users/role/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role }
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get('/tuitions/all', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await tuitionsCollection.find().toArray();
      res.send(result);
    });
    app.patch('/tuition/status/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status }
      };

      const result = await tuitionsCollection.updateOne(filter, updateDoc);
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
