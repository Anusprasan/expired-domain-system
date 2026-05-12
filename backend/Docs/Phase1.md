u7qCenpvmFqbfFlc
anushprasan20001112_db_user


TASK 1 — MERN Project Setup

Goal:

By the end of this task you will have:

✅ Node.js installed
✅ VS Code installed
✅ Backend server running
✅ React frontend running

STEP 1 — Install Node.js

Download and install:

Node.js Official Website

Download:

LTS version

Install normally.

STEP 2 — Verify Node.js

Open:

PowerShell

Run:

node -v

Then:

npm -v

You should see version numbers.

Example:

v22.x.x
10.x.x
STEP 3 — Install VS Code

Download:

Visual Studio Code

Install normally.

STEP 4 — Create Main Project Folder

Create folder:

expired-domain-system

Example location:

D:\Projects\expired-domain-system

OR

Desktop\expired-domain-system
STEP 5 — Open Folder in VS Code

In VS Code:

File → Open Folder

Choose:

expired-domain-system
STEP 6 — Open Terminal

In VS Code:

Terminal → New Terminal
STEP 7 — Create Backend Folder

In terminal:

mkdir backend

Go into backend:

cd backend
STEP 8 — Initialize Node Project

Run:

npm init -y

This creates:

package.json
STEP 9 — Install Backend Packages

Run:

npm install express cors dotenv
STEP 10 — Create server.js

Inside backend folder create file:

server.js

Paste this code:

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend server running");
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
STEP 11 — Run Backend Server

In terminal:

node server.js

You should see:

Server running on port 5000
STEP 12 — Test Backend

Open browser:

http://localhost:5000

You should see:

Backend server running
STEP 13 — Create React Frontend

Open NEW terminal.

Make sure you're inside:

expired-domain-system

NOT backend.

Run:

npm create vite@latest frontend

Choose:

React
JavaScript
STEP 14 — Install Frontend Packages

Go into frontend:

cd frontend

Run:

npm install
STEP 15 — Run Frontend

Run:

npm run dev

You will see something like:s

http://localhost:5173

Open it in browser.

You should see React/Vite page.

TASK 1 COMPLETE CHECKLIST

Verify:

✅ Backend works
✅ localhost:5000 works
✅ Frontend works
✅ localhost:5173 works

If any error comes:

Copy full error
Send screenshot or text here

After finishing, reply:

Task 1 completed



Start server
   ↓
Enable CORS + JSON support
   ↓
Create route "/"
   ↓
Listen on port 5000
   ↓
Server runs 













TASK 2 — Setup Clean Backend Structure + MongoDB Connection
Goal of Task 2:
By the end you will have:
✅ Clean backend folder structure
✅ MongoDB Atlas database created
✅ MongoDB connected to backend
✅ Environment variables working
✅ Test API working

STEP 1 — Go to Backend Folder
Open terminal:
cd backend

STEP 2 — Install MongoDB Packages
Run:
npm install mongoose

STEP 3 — Install Nodemon (Important)
Run:
npm install nodemon --save-dev

WHAT IS NODEMON?
Instead of restarting server manually every time:
Stop serverRun againStop serverRun again
Nodemon auto-restarts server when files change.
Very useful for development.

STEP 4 — Create Clean Folder Structure
Inside backend, create these folders:
backend/│├── config/├── controllers/├── models/├── routes/├── uploads/├── .env├── server.js

STEP 5 — Create MongoDB Atlas Account
Go to:
MongoDB Atlas
Create free account.

STEP 6 — Create Free Cluster
Inside MongoDB Atlas:
Create:
FREE Cluster
Choose any region close to you.

STEP 7 — Create Database User
Create:
Username + Password
IMPORTANT:
Save username/password carefully.
Example:
Username: adminPassword: mypassword123

STEP 8 — Add IP Access
In Atlas:
Network Access → Add IP Address
Choose:
Allow Access From Anywhere
This is okay for development.

STEP 9 — Get MongoDB Connection String
Go to:
Cluster → Connect → Drivers
Copy connection string.
Example:
mongodb+srv://username:password@cluster.mongodb.net/

STEP 10 — Create .env File
Inside backend:
Create:
.env
Add:
MONGO_URI=your_mongodb_connection_stringPORT=5000
Example:
MONGO_URI=mongodb+srv://admin:1234@cluster.mongodb.net/expiredDomainsDBPORT=5000

IMPORTANT
Replace:
<password>
with your REAL password.
Many beginners forget this.

STEP 11 — Create MongoDB Config File
Inside:
config/
Create:
db.js
Paste:
const mongoose = require("mongoose");const connectDB = async () => {  try {    await mongoose.connect(process.env.MONGO_URI);    console.log("MongoDB Connected");  } catch (error) {    console.error("MongoDB connection failed:", error.message);    process.exit(1);  }};module.exports = connectDB;

STEP 12 — Update server.js
Replace EVERYTHING inside server.js with this:
const express = require("express");const cors = require("cors");const dotenv = require("dotenv");const connectDB = require("./config/db");dotenv.config();connectDB();const app = express();app.use(cors());app.use(express.json());app.get("/", (req, res) => {  res.send("API Running");});const PORT = process.env.PORT || 5000;app.listen(PORT, () => {  console.log(`Server running on port ${PORT}`);});

STEP 13 — Add Nodemon Script
Open:
backend/package.json
Find:
"scripts"
Replace with:
"scripts": {  "dev": "nodemon server.js"}

STEP 14 — Run Backend
Run:
npm run dev

SUCCESS RESULT
You should see:
MongoDB ConnectedServer running on port 5000

STEP 15 — Test Browser
Open:
http://localhost:5000
You should see:
API Running

TASK 2 COMPLETE CHECKLIST
✅ Installed mongoose
✅ Installed nodemon
✅ Created clean backend structure
✅ Created MongoDB Atlas account
✅ Created cluster
✅ Created .env file
✅ MongoDB connected
✅ npm run dev works
✅ API works

INSTALL ITEMS LIST (Task 2)
Backend Packages
mongoosenodemon

VERY IMPORTANT
If MongoDB connection error happens:
Copy FULL error and send it here.
DO NOT skip the error message.
Most common problems:


wrong password


missing database name


forgot .env


forgot dotenv.config()


wrong connection string


Complete this fully before Task 3.





TASK 3 — Create MongoDB Models

Goal:

Create database structure for:

Batch
Domain
STEP 1 — Go to backend folder
cd backend
STEP 2 — Create Batch model

Inside:

backend/models/

Create file:

Batch.js

Paste:

const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    batchName: {
      type: String,
      required: true,
    },
    originalFileName: {
      type: String,
    },
    totalDomains: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Batch", batchSchema);
STEP 3 — Create Domain model

Inside:

backend/models/

Create file:

Domain.js

Paste:

const mongoose = require("mongoose");

const domainSchema = new mongoose.Schema(
  {
    domainName: {
      type: String,
      required: true,
      trim: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Domain", domainSchema);
STEP 4 — Save files

Your structure should now be:

backend/
├── models/
│   ├── Batch.js
│   └── Domain.js
TASK 3 CHECKLIST

✅ Created Batch.js
✅ Created Domain.js
✅ Saved both inside backend/models
















TASK 4 — Create Basic Batch API Routes

Goal:

Create APIs to:

1. Create test batch
2. Get all batches
3. Test in browser/Postman
STEP 1 — Create controller file

Inside:

backend/controllers/

Create file:

batchController.js

Paste:

const Batch = require("../models/Batch");

const createBatch = async (req, res) => {
  try {
    const { batchName, originalFileName } = req.body;

    const batch = await Batch.create({
      batchName,
      originalFileName,
    });

    res.status(201).json(batch);
  } catch (error) {
    res.status(500).json({ message: "Error creating batch" });
  }
};

const getBatches = async (req, res) => {
  try {
    const batches = await Batch.find().sort({ createdAt: -1 });

    res.status(200).json(batches);
  } catch (error) {
    res.status(500).json({ message: "Error fetching batches" });
  }
};

module.exports = {
  createBatch,
  getBatches,
};
STEP 2 — Create route file

Inside:

backend/routes/

Create file:

batchRoutes.js

Paste:

const express = require("express");
const {
  createBatch,
  getBatches,
} = require("../controllers/batchController");

const router = express.Router();

router.post("/", createBatch);
router.get("/", getBatches);

module.exports = router;
STEP 3 — Connect route to server.js

Open:

backend/server.js

Add this near the top:

const batchRoutes = require("./routes/batchRoutes");

Then add this after middleware:

app.use("/api/batches", batchRoutes);

Your important part should look like:

app.use(cors());
app.use(express.json());

app.use("/api/batches", batchRoutes);
STEP 4 — Run backend
npm run dev

You should still see:

MongoDB Connected
Server running on port 5000
STEP 5 — Test GET API in browser

Open:

http://localhost:5000/api/batches

You should see:

[]

or existing batch data.

STEP 6 — Test POST API using Postman/Thunder Client

Method:

POST

URL:

http://localhost:5000/api/batches

Body → raw → JSON:

{
  "batchName": "Test Batch 1",
  "originalFileName": "test.txt"
}

You should get saved batch response.

TASK 4 CHECKLIST

✅ Created batchController.js
✅ Created batchRoutes.js
✅ Connected route in server.js
✅ GET /api/batches working
✅ POST /api/batches working

INSTALL ITEMS LIST — Task 4












TASK 5 — Create Domain API Routes

Goal:

Create APIs to:

1. Add domain manually
2. Get domains by batch ID
STEP 1 — Create domain controller

Inside:

backend/controllers/

Create file:

domainController.js

Paste:

const Domain = require("../models/Domain");

const createDomain = async (req, res) => {
  try {
    const { domainName, batchId } = req.body;

    const domain = await Domain.create({
      domainName,
      batchId,
    });

    res.status(201).json(domain);
  } catch (error) {
    res.status(500).json({ message: "Error creating domain" });
  }
};

const getDomainsByBatch = async (req, res) => {
  try {
    const { batchId } = req.params;

    const domains = await Domain.find({ batchId }).sort({ createdAt: -1 });

    res.status(200).json(domains);
  } catch (error) {
    res.status(500).json({ message: "Error fetching domains" });
  }
};

module.exports = {
  createDomain,
  getDomainsByBatch,
};
STEP 2 — Create domain route file

Inside:

backend/routes/

Create file:

domainRoutes.js

Paste:

const express = require("express");
const {
  createDomain,
  getDomainsByBatch,
} = require("../controllers/domainController");

const router = express.Router();

router.post("/", createDomain);
router.get("/batch/:batchId", getDomainsByBatch);

module.exports = router;
STEP 3 — Connect domain routes in server.js

Open:

backend/server.js

Add near the top:

const domainRoutes = require("./routes/domainRoutes");

Add after batch route:

app.use("/api/domains", domainRoutes);

Your route section should look like:

app.use("/api/batches", batchRoutes);
app.use("/api/domains", domainRoutes);
STEP 4 — Run backend
npm run dev
STEP 5 — Test manually

First get a batch ID from:

GET http://localhost:5000/api/batches

Copy one _id.

Then test POST:

POST http://localhost:5000/api/domains

Body:

{
  "domainName": "example.com",
  "batchId": "PASTE_BATCH_ID_HERE"
}
STEP 6 — Get domains from one batch
GET http://localhost:5000/api/domains/batch/PASTE_BATCH_ID_HERE

You should see saved domains.

TASK 5 CHECKLIST

✅ Created domainController.js
✅ Created domainRoutes.js
✅ Connected route in server.js
✅ POST /api/domains working
✅ GET /api/domains/batch/:batchId working










TASK 6 — Upload TXT File Using Multer

Goal:

Your backend should:

Upload TXT file
↓
Save file inside uploads folder
↓
Return success message

This is your first real file upload system.

WHAT YOU WILL LEARN

✅ File upload
✅ Multer setup
✅ Middleware
✅ multipart/form-data
✅ uploads folder usage

STEP 1 — Install Multer

Inside backend folder:

npm install multer
WHAT IS MULTER?

Multer

Multer helps Express upload files.

Without multer:

Express cannot handle file uploads properly
STEP 2 — Create Multer Config File

Inside:

backend/config/

Create:

multer.js

Paste:

const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },

  filename: function (req, file, cb) {
    cb(
      null,
      Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage });

module.exports = upload;
STEP 3 — Understand What This Does

This code says:

When user uploads file:
↓
Save inside uploads folder
↓
Rename file using timestamp

Example:

1746873737.txt
STEP 4 — Create Upload Controller

Inside:

backend/controllers/

Create:

uploadController.js

Paste:

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    res.status(200).json({
      message: "File uploaded successfully",
      file: req.file.filename,
    });
  } catch (error) {
    res.status(500).json({
      message: "Upload failed",
    });
  }
};

module.exports = {
  uploadFile,
};
STEP 5 — Create Upload Routes

Inside:

backend/routes/

Create:

uploadRoutes.js

Paste:

const express = require("express");
const router = express.Router();

const upload = require("../config/multer");

const {
  uploadFile,
} = require("../controllers/uploadController");

router.post(
  "/",
  upload.single("file"),
  uploadFile
);

module.exports = router;
IMPORTANT
upload.single("file")

means:

Expect ONE uploaded file

and frontend/Postman field name MUST be:

file
STEP 6 — Connect Upload Route

Open:

backend/server.js

Add:

const uploadRoutes = require("./routes/uploadRoutes");

Then:

app.use("/api/upload", uploadRoutes);

Your route section:

app.use("/api/batches", batchRoutes);
app.use("/api/domains", domainRoutes);
app.use("/api/upload", uploadRoutes);
STEP 7 — Run Backend
npm run dev
STEP 8 — Test Upload Using Postman

Method:

POST

URL:

http://localhost:5000/api/upload
STEP 9 — Use form-data

Inside Postman:

Choose:

Body → form-data

Key:

file

Type:

File

Choose TXT file.

STEP 10 — Send Request

You should get:

{
  "message": "File uploaded successfully",
  "file": "1746873737.txt"
}
STEP 11 — Verify uploads Folder

Check:

backend/uploads/

You should see uploaded TXT file.

TASK 6 CHECKLIST

✅ Installed multer
✅ Created config/multer.js
✅ Created uploadController.js
✅ Created uploadRoutes.js
✅ Connected upload routes
✅ Uploaded TXT file successfully
✅ File saved inside uploads folder





TASK 7 — Read TXT File and Save Domains to MongoDB

Goal:

Upload TXT file
↓
Read domains line by line
↓
Create new batch
↓
Save domains into MongoDB
↓
Update totalDomains count
STEP 1 — Install nothing

No new package needed.

We will use Node.js built-in fs.

STEP 2 — Update uploadController.js

Open:

backend/controllers/uploadController.js

Replace all code with this:

const fs = require("fs");
const path = require("path");

const Batch = require("../models/Batch");
const Domain = require("../models/Domain");

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const filePath = path.join(__dirname, "../uploads", req.file.filename);

    const fileContent = fs.readFileSync(filePath, "utf-8");

    const domains = fileContent
      .split(/\r?\n/)
      .map((domain) => domain.trim())
      .filter((domain) => domain !== "");

    const batch = await Batch.create({
      batchName: `Batch-${Date.now()}`,
      originalFileName: req.file.originalname,
      totalDomains: domains.length,
    });

    const domainDocs = domains.map((domainName) => ({
      domainName,
      batchId: batch._id,
    }));

    await Domain.insertMany(domainDocs);

    res.status(200).json({
      message: "TXT file processed successfully",
      batch,
      totalDomains: domains.length,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "TXT file processing failed",
    });
  }
};

module.exports = {
  uploadFile,
};
STEP 3 — Create a TXT test file

Create a file on your computer:

domains.txt

Add:

example.com
google.com
testdomain.net
mywebsite.lk

Save it.

STEP 4 — Run backend
npm run dev
STEP 5 — Upload TXT using Postman

Method:

POST

URL:

http://localhost:5000/api/upload

Body:

form-data

Key:

file

Type:

File

Choose:

domains.txt
STEP 6 — Expected response

You should see:

{
  "message": "TXT file processed successfully",
  "batch": {
    "batchName": "Batch-174...",
    "originalFileName": "domains.txt",
    "totalDomains": 4
  },
  "totalDomains": 4
}
STEP 7 — Check MongoDB

In MongoDB Atlas:

Check collections:

batches
domains

You should see:

1 batch
4 domains
TASK 7 CHECKLIST

✅ TXT file uploaded
✅ TXT file read successfully
✅ Batch saved in MongoDB
✅ Domains saved in MongoDB
✅ totalDomains updated correctly

INSTALL ITEMS LIST — Task 7












TASK 8 — Support Excel (.xlsx) File Upload and Reading

Goal:

Your system should now support:

TXT files
+
Excel files (.xlsx)

Flow:

Upload Excel
↓
Read rows
↓
Extract domains
↓
Save batch
↓
Save domains into MongoDB
WHAT YOU WILL LEARN

✅ Excel processing
✅ File type checking
✅ Reading spreadsheet rows
✅ Converting Excel → JSON

STEP 1 — Install xlsx Package

Inside backend:

npm install xlsx
WHAT IS XLSX?

SheetJS xlsx

Used to read:

.xlsx
.xls
.csv

files.

STEP 2 — Update uploadController.js

Open:

backend/controllers/uploadController.js

Replace ALL code with this:

const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const Batch = require("../models/Batch");
const Domain = require("../models/Domain");

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const filePath = path.join(
      __dirname,
      "../uploads",
      req.file.filename
    );

    let domains = [];

    const ext = path.extname(req.file.originalname);

    // TXT FILE
    if (ext === ".txt") {
      const fileContent = fs.readFileSync(filePath, "utf-8");

      domains = fileContent
        .split(/\r?\n/)
        .map((domain) => domain.trim())
        .filter((domain) => domain !== "");
    }

    // EXCEL FILE
    else if (ext === ".xlsx") {
      const workbook = xlsx.readFile(filePath);

      const sheetName = workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];

      const data = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
      });

      domains = data
        .flat()
        .map((domain) => String(domain).trim())
        .filter((domain) => domain !== "");
    }

    // INVALID FILE
    else {
      return res.status(400).json({
        message: "Only TXT and XLSX files allowed",
      });
    }

    const batch = await Batch.create({
      batchName: `Batch-${Date.now()}`,
      originalFileName: req.file.originalname,
      totalDomains: domains.length,
    });

    const domainDocs = domains.map((domainName) => ({
      domainName,
      batchId: batch._id,
    }));

    await Domain.insertMany(domainDocs);

    res.status(200).json({
      message: "File processed successfully",
      batch,
      totalDomains: domains.length,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "File processing failed",
    });
  }
};

module.exports = {
  uploadFile,
};
STEP 3 — Create Excel Test File

Create Excel file:

domains.xlsx

Example:

Domain
google.com
amazon.com
microsoft.com
openai.com

Save it.

STEP 4 — Run Backend
npm run dev
STEP 5 — Upload Excel File

Postman:

POST
http://localhost:5000/api/upload

Body:

form-data

Key:

file

Type:

File

Choose:

domains.xlsx
STEP 6 — Expected Result

You should see:

{
  "message": "File processed successfully",
  "totalDomains": 5
}

(Excel header may count too.)

STEP 7 — Check MongoDB

You should now see:

New batch created
Domains saved
IMPORTANT ISSUE (HEADER ROW)

Currently:

Domain
google.com
amazon.com

may save:

Domain

also as a domain.

We will clean this later.

TASK 8 CHECKLIST

✅ Installed xlsx
✅ Excel file upload works
✅ Excel file reading works
✅ Domains extracted from spreadsheet
✅ Batch saved
✅ Domains saved to MongoDB







TASK 9 — Clean Domains Before Saving

Goal:

Before saving to MongoDB, remove:

empty lines
Excel/CSV header row
duplicate domains
invalid spaces
STEP 1 — Open uploadController.js

Open:

backend/controllers/uploadController.js

Find this part near the bottom:

const batch = await Batch.create

Before that line, add this cleaning code:

domains = domains
  .map((domain) => domain.toLowerCase().trim())
  .filter((domain) => domain !== "")
  .filter((domain) => domain !== "domain")
  .filter((domain) => domain.includes("."));

domains = [...new Set(domains)];
STEP 2 — Your final section should look like this
domains = domains
  .map((domain) => domain.toLowerCase().trim())
  .filter((domain) => domain !== "")
  .filter((domain) => domain !== "domain")
  .filter((domain) => domain.includes("."));

domains = [...new Set(domains)];

const batch = await Batch.create({
  batchName: `Batch-${Date.now()}`,
  originalFileName: req.file.originalname,
  totalDomains: domains.length,
});
STEP 3 — Test with messy TXT file

Create:

messy-domains.txt

Add:

Domain
Google.com
google.com

 Amazon.com
testdomain.net
hello
STEP 4 — Upload using Postman
POST http://localhost:5000/api/upload

Body:

form-data
file → messy-domains.txt
Expected result

It should save only:

google.com
amazon.com
testdomain.net

Not save:

Domain
empty lines
duplicate google.com
hello
TASK 9 CHECKLIST

✅ Header row removed
✅ Empty lines removed
✅ Duplicate domains removed
✅ Domains converted to lowercase
✅ Only valid-looking domains saved



TASK 10 — Get All Batches and View Domains by Batch

Goal:

View all uploaded batches
Click/choose one batch
View domains inside that batch

This is backend API testing before frontend.

STEP 1 — Test all batches API

In Postman or browser:

GET http://localhost:5000/api/batches

You should see all uploaded batches.

STEP 2 — Copy one batch _id

Example:

{
  "_id": "663abc12345",
  "batchName": "Batch-1746873737",
  "originalFileName": "domains.txt",
  "totalDomains": 10
}

Copy:

663abc12345
STEP 3 — Test domains by batch API

Use:

GET http://localhost:5000/api/domains/batch/PASTE_BATCH_ID_HERE

Example:

GET http://localhost:5000/api/domains/batch/663abc12345
STEP 4 — Expected result

You should see domains from that batch only:

[
  {
    "domainName": "google.com",
    "batchId": "663abc12345"
  },
  {
    "domainName": "amazon.com",
    "batchId": "663abc12345"
  }
]
TASK 10 CHECKLIST

✅ GET /api/batches working
✅ Batch list visible
✅ Copied batch _id
✅ GET /api/domains/batch/:batchId working
✅ Domains show only for selected batch

INSTALL ITEMS LIST — Task 10










TASK 11 — Setup React Frontend Structure

Goal:

Create clean frontend structure for:

Pages
Components
Services

This prepares your React frontend professionally.

STEP 1 — Go to frontend folder

Open terminal:

cd frontend
STEP 2 — Open src Folder

Inside:

frontend/src

Delete:

App.css

(optional)

STEP 3 — Create Folder Structure

Inside src, create:

components/
pages/
services/
FINAL STRUCTURE

Your frontend should now look like:

frontend/
└── src/
    ├── components/
    ├── pages/
    ├── services/
    ├── App.jsx
    ├── main.jsx
WHY THESE FOLDERS?
components/

Reusable UI parts.

Example:

Navbar
BatchCard
UploadForm
pages/

Full pages/screens.

Example:

HomePage
UploadPage
BatchPage
services/

API calls.

Example:

uploadService.js
batchService.js
STEP 4 — Create Pages

Inside:

src/pages

Create:

HomePage.jsx
UploadPage.jsx
BatchPage.jsx
STEP 5 — Add Basic Component Code
HomePage.jsx

Paste:

function HomePage() {
  return (
    <div>
      <h1>Home Page</h1>
    </div>
  );
}

export default HomePage;
UploadPage.jsx

Paste:

function UploadPage() {
  return (
    <div>
      <h1>Upload Page</h1>
    </div>
  );
}

export default UploadPage;
BatchPage.jsx

Paste:

function BatchPage() {
  return (
    <div>
      <h1>Batch Page</h1>
    </div>
  );
}

export default BatchPage;
STEP 6 — Update App.jsx

Replace all code inside:

src/App.jsx

with:

import HomePage from "./pages/HomePage";

function App() {
  return (
    <div>
      <HomePage />
    </div>
  );
}

export default App;
STEP 7 — Run Frontend
npm run dev
STEP 8 — Open Browser

Open:

http://localhost:5173

You should see:

Home Page
TASK 11 CHECKLIST

✅ Created frontend folder structure
✅ Created components folder
✅ Created pages folder
✅ Created services folder
✅ Created HomePage.jsx
✅ Created UploadPage.jsx
✅ Created BatchPage.jsx
✅ Updated App.jsx
✅ Frontend running correctly

INSTALL ITEMS LIST — Task 11









TASK 12 — Install Frontend Packages & Setup Routing

Goal:

Your React frontend should support:

Page navigation
API calls

We will install:

Axios
React Router
WHAT YOU WILL LEARN

✅ React Router
✅ Routes
✅ Navigation
✅ Axios setup
✅ Multi-page React structure

STEP 1 — Go to frontend folder
cd frontend
STEP 2 — Install Packages

Run:

npm install axios react-router-dom
WHAT IS AXIOS?

Axios

Used to call backend APIs.

Example:

React → Backend API
WHAT IS REACT ROUTER?

React Router

Used for page navigation.

Example:

/
/upload
/batches
STEP 3 — Update App.jsx

Replace ALL code in:

src/App.jsx

with:

import { BrowserRouter, Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import BatchPage from "./pages/BatchPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route
          path="/upload"
          element={<UploadPage />}
        />

        <Route
          path="/batches"
          element={<BatchPage />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
STEP 4 — Run Frontend
npm run dev
STEP 5 — Test Routes

Open browser:

Home
http://localhost:5173/

Should show:

Home Page
Upload Page
http://localhost:5173/upload

Should show:

Upload Page
Batch Page
http://localhost:5173/batches

Should show:

Batch Page
TASK 12 CHECKLIST

✅ Installed axios
✅ Installed react-router-dom
✅ Setup BrowserRouter
✅ Setup Routes
✅ Home route working
✅ Upload route working
✅ Batch route working

INSTALL ITEMS LIST — Task 12











TASK 13 — Create File Upload UI in React

Goal:

Create frontend upload page:

Choose file
↓
Click upload

This task is ONLY UI.

Backend connection comes in next task.

WHAT YOU WILL LEARN

✅ React forms
✅ useState
✅ File input handling
✅ Event handling

STEP 1 — Open UploadPage.jsx

Open:

src/pages/UploadPage.jsx

Replace ALL code with this:

import { useState } from "react";

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      alert("Please select a file");
      return;
    }

    console.log(selectedFile);

    alert("File selected successfully");
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Upload Expired Domains</h1>

      <input
        type="file"
        onChange={handleFileChange}
      />

      <br />
      <br />

      <button onClick={handleUpload}>
        Upload
      </button>
    </div>
  );
}

export default UploadPage;
STEP 2 — Run Frontend
npm run dev
STEP 3 — Open Upload Page

Open:

http://localhost:5173/upload
STEP 4 — Test UI

You should see:

Upload Expired Domains
[file chooser]
[Upload button]
STEP 5 — Test File Selection

Choose TXT/XLSX/CSV file.

Click:

Upload

You should see:

File selected successfully
STEP 6 — Check Browser Console

Press:

F12

Go to:

Console

You should see selected file details.

Example:

File {
  name: "domains.txt",
  size: 1200,
  type: "text/plain"
}
IMPORTANT CONCEPTS
useState()

React hook for storing data.

selectedFile

Stores chosen file.

onChange

Runs when file changes.

e.target.files[0]

Gets first selected file.

onClick

Runs when button clicked.

TASK 13 CHECKLIST

✅ Created upload UI
✅ File input working
✅ Upload button working
✅ File stored in React state
✅ Console shows selected file

INSTALL ITEMS LIST — Task 13









TASK 14 — Connect React Upload to Backend API

Goal:

React upload page
↓
Send file to backend
↓
Backend processes TXT/XLSX/CSV
↓
Save batch + domains in MongoDB
↓
Show success message
STEP 1 — Make sure backend is running

In backend terminal:

npm run dev

Backend should run on:

http://localhost:5000
STEP 2 — Make sure frontend is running

In frontend terminal:

npm run dev

Frontend should run on:

http://localhost:5173
STEP 3 — Update UploadPage.jsx

Open:

frontend/src/pages/UploadPage.jsx

Replace all code with this:

import { useState } from "react";
import axios from "axios";

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState("");
  const [totalDomains, setTotalDomains] = useState(null);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setMessage("");
    setTotalDomains(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("Please select a file");
      return;
    }

    const allowedExtensions = ["txt", "xlsx", "csv"];
    const fileExtension = selectedFile.name
      .split(".")
      .pop()
      .toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      setMessage("Only TXT, XLSX and CSV files are allowed");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await axios.post(
        "http://localhost:5000/api/upload",
        formData
      );

      setMessage(response.data.message);
      setTotalDomains(response.data.totalDomains);
      setSelectedFile(null);
    } catch (error) {
      setMessage("File upload failed");
      console.error(error);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Upload Expired Domains</h1>

      <input
        type="file"
        accept=".txt,.xlsx,.csv"
        onChange={handleFileChange}
      />

      <br />
      <br />

      <button onClick={handleUpload}>
        Upload
      </button>

      {message && <p>{message}</p>}

      {totalDomains !== null && (
        <p>Total Domains: {totalDomains}</p>
      )}
    </div>
  );
}

export default UploadPage;
STEP 4 — Test upload from browser

Open:

http://localhost:5173/upload

Choose:

.txt / .xlsx / .csv

Click:

Upload
STEP 5 — Expected result

You should see:

File processed successfully
Total Domains: 5
TASK 14 CHECKLIST

✅ Axios used
✅ File sent from React to backend
✅ Backend upload API connected
✅ Success message shown in page
✅ Total domain count shown
✅ Data saved in MongoDB







TASK 15 — Show All Uploaded Batches in React

Goal:

React frontend
↓
Fetch all batches from backend
↓
Show batch list on Batch Page
STEP 1 — Confirm your backend route

Because your route is custom, your GET URL is:

http://localhost:5000/api/batches/getBatches
STEP 2 — Update BatchPage.jsx

Open:

frontend/src/pages/BatchPage.jsx

Replace all code with:

import { useEffect, useState } from "react";
import axios from "axios";

function BatchPage() {
  const [batches, setBatches] = useState([]);
  const [message, setMessage] = useState("");

  const fetchBatches = async () => {
    try {
      const response = await axios.get(
        "http://localhost:5000/api/batches/getBatches"
      );

      setBatches(response.data);
    } catch (error) {
      console.error(error);
      setMessage("Failed to fetch batches");
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Uploaded Batches</h1>

      {message && <p>{message}</p>}

      {batches.length === 0 ? (
        <p>No batches found</p>
      ) : (
        <table border="1" cellPadding="10">
          <thead>
            <tr>
              <th>Batch Name</th>
              <th>File Name</th>
              <th>Total Domains</th>
              <th>Uploaded Date</th>
            </tr>
          </thead>

          <tbody>
            {batches.map((batch) => (
              <tr key={batch._id}>
                <td>{batch.batchName}</td>
                <td>{batch.originalFileName}</td>
                <td>{batch.totalDomains}</td>
                <td>{new Date(batch.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default BatchPage;
STEP 3 — Run backend
npm run dev
STEP 4 — Run frontend
npm run dev
STEP 5 — Open batches page
http://localhost:5173/batches

You should see uploaded batches in a table.

TASK 15 CHECKLIST

✅ Used useEffect
✅ Used axios.get()
✅ Fetched batches from backend
✅ Displayed batches in table
✅ Shows batch name
✅ Shows original file name
✅ Shows total domains
✅ Shows upload date

INSTALL ITEMS LIST — Task 15




TASK 16 — View Domains Inside Selected Batch

Goal:

Click a batch
↓
Open domains page
↓
Show domains from that batch only
STEP 1 — Update App.jsx

Open:

frontend/src/App.jsx

Add new route:

<Route path="/batches/:batchId" element={<DomainPage />} />

Full App.jsx:

import { BrowserRouter, Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import BatchPage from "./pages/BatchPage";
import DomainPage from "./pages/DomainPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/batches" element={<BatchPage />} />
        <Route path="/batches/:batchId" element={<DomainPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
STEP 2 — Create DomainPage.jsx

Inside:

frontend/src/pages/

Create:

DomainPage.jsx

Paste:

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

function DomainPage() {
  const { batchId } = useParams();

  const [domains, setDomains] = useState([]);
  const [message, setMessage] = useState("");

  const fetchDomains = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/domains/batch/${batchId}`
      );

      setDomains(response.data);
    } catch (error) {
      console.error(error);
      setMessage("Failed to fetch domains");
    }
  };

  useEffect(() => {
    fetchDomains();
  }, [batchId]);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Domains in Batch</h1>

      <p>Batch ID: {batchId}</p>

      {message && <p>{message}</p>}

      {domains.length === 0 ? (
        <p>No domains found</p>
      ) : (
        <table border="1" cellPadding="10">
          <thead>
            <tr>
              <th>No</th>
              <th>Domain Name</th>
              <th>Added Date</th>
            </tr>
          </thead>

          <tbody>
            {domains.map((domain, index) => (
              <tr key={domain._id}>
                <td>{index + 1}</td>
                <td>{domain.domainName}</td>
                <td>{new Date(domain.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default DomainPage;
STEP 3 — Update BatchPage.jsx

At the top, add:

import { Link } from "react-router-dom";

Then change batch name column from:

<td>{batch.batchName}</td>

to:

<td>
  <Link to={`/batches/${batch._id}`}>
    {batch.batchName}
  </Link>
</td>
STEP 4 — Test

Open:

http://localhost:5173/batches

Click a batch name.

It should open:

http://localhost:5173/batches/BATCH_ID

and show domains inside that batch.

TASK 16 CHECKLIST

✅ Created DomainPage.jsx
✅ Added dynamic route /batches/:batchId
✅ Used useParams()
✅ Fetched domains by batch ID
✅ Added clickable batch links
✅ Domains shown in table

INSTALL ITEMS LIST — Task 16










TASK 17 — Add Simple Navigation Menu

Goal:

Move between pages easily
Home | Upload | Batches
STEP 1 — Create Navbar component

Inside:

frontend/src/components/

Create:

Navbar.jsx

Paste:

import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav style={{ padding: "15px", background: "#eee" }}>
      <Link to="/" style={{ marginRight: "15px" }}>
        Home
      </Link>

      <Link to="/upload" style={{ marginRight: "15px" }}>
        Upload
      </Link>

      <Link to="/batches">
        Batches
      </Link>
    </nav>
  );
}

export default Navbar;
STEP 2 — Add Navbar to App.jsx

Open:

frontend/src/App.jsx

Import Navbar:

import Navbar from "./components/Navbar";

Then place it inside BrowserRouter, before Routes:

<BrowserRouter>
  <Navbar />

  <Routes>
    ...
  </Routes>
</BrowserRouter>
Full App.jsx should look like this
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";

import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import BatchPage from "./pages/BatchPage";
import DomainPage from "./pages/DomainPage";

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/batches" element={<BatchPage />} />
        <Route path="/batches/:batchId" element={<DomainPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
STEP 3 — Test

Run frontend:

npm run dev

Open:

http://localhost:5173

You should see links:

Home | Upload | Batches

Click each one and check navigation.

TASK 17 CHECKLIST

✅ Created Navbar.jsx
✅ Added Link navigation
✅ Imported Navbar in App.jsx
✅ Navigation visible on all pages
✅ Home, Upload, Batches links working

INSTALL ITEMS LIST — Task 17









TASK 18 — Delete Batch from Frontend + Backend

Goal:

Click Delete
↓
Delete batch
↓
Delete all domains inside batch
↓
Refresh batch list

This is your first full-stack delete feature.

WHAT YOU WILL LEARN

✅ DELETE API
✅ MongoDB delete operations
✅ Frontend delete button
✅ Auto refresh UI

STEP 1 — Update batchController.js

Open:

backend/controllers/batchController.js

Add this function BELOW getBatches:

const deleteBatch = async (req, res) => {
  try {
    const { batchId } = req.params;

    await Batch.findByIdAndDelete(batchId);

    const Domain = require("../models/Domain");

    await Domain.deleteMany({
      batchId,
    });

    res.status(200).json({
      message: "Batch deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Delete failed",
    });
  }
};
STEP 2 — Export deleteBatch

At bottom of file:

FROM:

module.exports = {
  createBatch,
  getBatches,
};

TO:

module.exports = {
  createBatch,
  getBatches,
  deleteBatch,
};
STEP 3 — Update batchRoutes.js

Open:

backend/routes/batchRoutes.js

Import deleteBatch:

const {
  createBatch,
  getBatches,
  deleteBatch,
} = require("../controllers/batchController");

Add delete route:

router.delete("/deleteBatch/:batchId", deleteBatch);

Final routes:

router.post("/createBatch", createBatch);

router.get("/getBatches", getBatches);

router.delete(
  "/deleteBatch/:batchId",
  deleteBatch
);
STEP 4 — Test Backend DELETE API

Using Postman:

DELETE http://localhost:5000/api/batches/deleteBatch/BATCH_ID

Should return:

{
  "message": "Batch deleted successfully"
}
STEP 5 — Update BatchPage.jsx

Inside table add new column.

Find:

<th>Uploaded Date</th>

Add below it:

<th>Action</th>
STEP 6 — Add delete function

Inside BatchPage component, ABOVE return:

const handleDelete = async (batchId) => {
  const confirmDelete = window.confirm(
    "Are you sure you want to delete this batch?"
  );

  if (!confirmDelete) {
    return;
  }

  try {
    await axios.delete(
      `http://localhost:5000/api/batches/deleteBatch/${batchId}`
    );

    fetchBatches();
  } catch (error) {
    console.error(error);
    alert("Delete failed");
  }
};
STEP 7 — Add delete button

Inside table row.

Find:

<td>{new Date(batch.createdAt).toLocaleString()}</td>

Below it add:

<td>
  <button
    onClick={() => handleDelete(batch._id)}
  >
    Delete
  </button>
</td>
STEP 8 — Test Frontend

Open:

http://localhost:5173/batches

Click:

Delete

Batch should disappear.

Domains inside batch should also delete.

TASK 18 CHECKLIST

✅ Created backend DELETE API
✅ Deleted batch from MongoDB
✅ Deleted related domains
✅ Added delete button in frontend
✅ Delete confirmation working
✅ Batch list auto refresh working

INSTALL ITEMS LIST — Task 18





TASK 19 — Search Domains in Frontend

Goal:

Type domain keyword
↓
Filter domains instantly

Example:

Search: google
↓
Shows only google-related domains
WHAT YOU WILL LEARN

✅ React search filtering
✅ useState with input
✅ Array filtering
✅ Real-time UI updates

STEP 1 — Open DomainPage.jsx

Open:

frontend/src/pages/DomainPage.jsx
STEP 2 — Add search state

Find:

const [domains, setDomains] = useState([]);

Add below it:

const [searchTerm, setSearchTerm] = useState("");
STEP 3 — Create filtered domains

Above return, add:

const filteredDomains = domains.filter((domain) =>
  domain.domainName
    .toLowerCase()
    .includes(searchTerm.toLowerCase())
);
STEP 4 — Add search input

Inside return, BELOW:

<h1>Domains in Batch</h1>

Add:

<input
  type="text"
  placeholder="Search domains..."
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  style={{
    padding: "10px",
    marginBottom: "20px",
    width: "300px",
  }}
/>
STEP 5 — Replace domains.map

Find:

domains.map((domain, index) => (

Replace with:

filteredDomains.map((domain, index) => (
STEP 6 — Test

Open:

http://localhost:5173/batches

Open any batch.

Type:

google

You should see only matching domains.

HOW THIS WORKS
filter()

Loops through array.

includes()

Checks if text exists.

Example:

"google.com".includes("google")

returns:

true
toLowerCase()

Makes search case-insensitive.

Example:

Google.com
google.com
GOOGLE.COM

all become:

google.com
TASK 19 CHECKLIST

✅ Added search state
✅ Added search input
✅ Filtered domains array
✅ Real-time search working
✅ Case-insensitive search working

INSTALL ITEMS LIST — Task 19







TASK 20 — Add Domain Count Display

Goal:

Show total domains
Show filtered/search result count

Example:

Total Domains: 100
Showing: 5
STEP 1 — Open DomainPage.jsx

Open:

frontend/src/pages/DomainPage.jsx
STEP 2 — Add count display

Below your search input, add this:

<p>
  Total Domains: {domains.length}
</p>

<p>
  Showing: {filteredDomains.length}
</p>
STEP 3 — Correct placement example

Inside your return, it should look like this:

<h1>Domains in Batch</h1>

<input
  type="text"
  placeholder="Search domains..."
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  style={{
    padding: "10px",
    marginBottom: "20px",
    width: "300px",
  }}
/>

<p>Total Domains: {domains.length}</p>
<p>Showing: {filteredDomains.length}</p>
STEP 4 — Test

Open:

http://localhost:5173/batches

Click a batch.

You should see:

Total Domains: ...
Showing: ...

When you search, Showing count should change.

TASK 20 CHECKLIST

✅ Total domain count visible
✅ Filtered result count visible
✅ Count changes during search

INSTALL ITEMS LIST — Task 20




TASK 21 — Add Better Upload Loading State

Goal:

Click Upload
↓
Show “Uploading...”
↓
Disable button
↓
Show success/error after upload
STEP 1 — Open UploadPage.jsx
frontend/src/pages/UploadPage.jsx
STEP 2 — Add loading state

Find:

const [totalDomains, setTotalDomains] = useState(null);

Add below it:

const [loading, setLoading] = useState(false);
STEP 3 — Update handleUpload

Inside try, before creating FormData, add:

setLoading(true);

Inside catch, keep error message.

After catch, add finally:

finally {
  setLoading(false);
}
STEP 4 — Full handleUpload example
const handleUpload = async () => {
  if (!selectedFile) {
    setMessage("Please select a file");
    return;
  }

  const allowedExtensions = ["txt", "xlsx", "csv"];
  const fileExtension = selectedFile.name
    .split(".")
    .pop()
    .toLowerCase();

  if (!allowedExtensions.includes(fileExtension)) {
    setMessage("Only TXT, XLSX and CSV files are allowed");
    return;
  }

  try {
    setLoading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await axios.post(
      "http://localhost:5000/api/upload",
      formData
    );

    setMessage(response.data.message);
    setTotalDomains(response.data.totalDomains);
    setSelectedFile(null);
  } catch (error) {
    console.error(error);
    setMessage("File upload failed");
  } finally {
    setLoading(false);
  }
};
STEP 5 — Update button

Replace your button with:

<button onClick={handleUpload} disabled={loading}>
  {loading ? "Uploading..." : "Upload"}
</button>
TASK 21 CHECKLIST

✅ Added loading state
✅ Upload button disables while uploading
✅ Button text changes to Uploading...
✅ Loading stops after success/error

INSTALL ITEMS LIST — Task 21




TASK 22 — Add Clear Button After Upload

Goal:

Select file
Upload file
Show result
Clear selected file/message/count
STEP 1 — Open UploadPage.jsx
frontend/src/pages/UploadPage.jsx
STEP 2 — Add clear function

Inside UploadPage, above return, add:

const handleClear = () => {
  setSelectedFile(null);
  setMessage("");
  setTotalDomains(null);
};
STEP 3 — Add Clear button

Below your Upload button, add:

<button
  onClick={handleClear}
  style={{ marginLeft: "10px" }}
>
  Clear
</button>
STEP 4 — Fix file input reset

Update your file input like this:

<input
  type="file"
  accept=".txt,.xlsx,.csv"
  onChange={handleFileChange}
  key={selectedFile ? "file-selected" : "file-empty"}
/>
TASK 22 CHECKLIST

✅ Added Clear button
✅ Clears selected file
✅ Clears message
✅ Clears total domain count
✅ File input resets

INSTALL ITEMS LIST — Task 22


TASK 23 — Add Better Home Page Dashboard

Goal:

Home page shows project overview
Quick navigation buttons
Simple system status
STEP 1 — Open HomePage.jsx
frontend/src/pages/HomePage.jsx

Replace all code with:

import { Link } from "react-router-dom";

function HomePage() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Expired Domain Manager</h1>

      <p>
        Upload TXT, CSV, or Excel files and manage expired domain batches.
      </p>

      <div style={{ marginTop: "20px" }}>
        <Link to="/upload">
          <button>Upload Domains</button>
        </Link>

        <Link to="/batches">
          <button style={{ marginLeft: "10px" }}>
            View Batches
          </button>
        </Link>
      </div>

      <div style={{ marginTop: "30px" }}>
        <h2>System Features</h2>

        <ul>
          <li>Upload daily expired domain files</li>
          <li>Create separate batches automatically</li>
          <li>View domains batch by batch</li>
          <li>Search domains</li>
          <li>Delete batches</li>
        </ul>
      </div>
    </div>
  );
}

export default HomePage;
STEP 2 — Test Home Page

Open:

http://localhost:5173/

You should see:

Expired Domain Manager
Upload Domains button
View Batches button
System Features list
STEP 3 — Test Buttons

Click:

Upload Domains

It should go to:

/upload

Click:

View Batches

It should go to:

/batches
TASK 23 CHECKLIST

✅ Home page updated
✅ Upload button added
✅ View Batches button added
✅ Navigation working
✅ Feature list added

INSTALL ITEMS LIST — Task 23








TASK 24 — Create Modern Professional Home Page UI

Goal:

Modern landing page
Better alignment
Professional layout
Feature cards
Better buttons
Clean UI

This task upgrades your old homepage into a modern SaaS-style dashboard landing page.

WHAT YOU WILL LEARN

✅ Better UI structure
✅ Inline styling in React
✅ Card layouts
✅ Grid system
✅ Professional spacing
✅ Modern buttons

STEP 1 — Open HomePage.jsx

Open:

frontend/src/pages/HomePage.jsx

Replace ALL code with the modern UI code below.

STEP 2 — Paste This Code
import { Link } from "react-router-dom";

function HomePage() {
  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.badge}>⭐ Smart Domain Management</div>

        <h1 style={styles.title}>
          Expired Domain <span style={styles.highlight}>Manager</span>
        </h1>

        <p style={styles.subtitle}>
          Upload TXT, CSV, or Excel files and manage expired domain batches
          efficiently and easily.
        </p>

        <div style={styles.buttons}>
          <Link to="/upload">
            <button style={styles.primaryBtn}>
              ☁ Upload Domains
            </button>
          </Link>

          <Link to="/batches">
            <button style={styles.secondaryBtn}>
              ☷ View Batches
            </button>
          </Link>
        </div>
      </section>

      <section style={styles.featuresSection}>
        <div style={styles.icon}>⚙</div>

        <h2 style={styles.sectionTitle}>
          System Features
        </h2>

        <p style={styles.sectionText}>
          Everything you need to manage expired domains
        </p>

        <div style={styles.cards}>
          {features.map((item, index) => (
            <div key={index} style={styles.card}>
              <div style={styles.cardIcon}>
                {item.icon}
              </div>

              <h3>{item.title}</h3>

              <p style={styles.cardText}>
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const features = [
  {
    icon: "↥",
    title: "Upload Files",
    text: "Upload daily expired domain files in TXT, CSV, or Excel format.",
  },

  {
    icon: "▰",
    title: "Auto Batching",
    text: "Create separate batches automatically for each upload.",
  },

  {
    icon: "📁",
    title: "View Batches",
    text: "Browse and view domains batch by batch with details.",
  },

  {
    icon: "🔍",
    title: "Search Domains",
    text: "Search through domains quickly and efficiently.",
  },

  {
    icon: "🗑",
    title: "Delete Batches",
    text: "Delete unwanted batches with a single click.",
  },
];

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #faf7ff, #ffffff)",
    color: "#111827",
  },

  hero: {
    textAlign: "center",
    padding: "90px 20px 70px",
  },

  badge: {
    display: "inline-block",
    padding: "10px 20px",
    borderRadius: "30px",
    background: "#f0e7ff",
    color: "#6d28d9",
    fontWeight: "600",
    marginBottom: "25px",
  },

  title: {
    fontSize: "60px",
    margin: "0",
    fontWeight: "800",
  },

  highlight: {
    color: "#6d28d9",
  },

  subtitle: {
    fontSize: "22px",
    color: "#64748b",
    maxWidth: "720px",
    margin: "20px auto",
    lineHeight: "1.5",
  },

  buttons: {
    marginTop: "35px",
  },

  primaryBtn: {
    padding: "16px 36px",
    marginRight: "20px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "18px",
    fontWeight: "600",
    cursor: "pointer",
  },

  secondaryBtn: {
    padding: "16px 36px",
    background: "white",
    color: "#6d28d9",
    border: "2px solid #6d28d9",
    borderRadius: "12px",
    fontSize: "18px",
    fontWeight: "600",
    cursor: "pointer",
  },

  featuresSection: {
    textAlign: "center",
    padding: "50px 60px 80px",
    background: "white",
  },

  icon: {
    fontSize: "35px",
    color: "#6d28d9",
  },

  sectionTitle: {
    fontSize: "36px",
    margin: "10px 0",
  },

  sectionText: {
    color: "#64748b",
    fontSize: "18px",
  },

  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "25px",
    marginTop: "40px",
  },

  card: {
    padding: "35px 25px",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    background: "white",
    boxShadow: "0 8px 20px rgba(0,0,0,0.04)",
  },

  cardIcon: {
    fontSize: "35px",
    color: "#6d28d9",
    marginBottom: "20px",
  },

  cardText: {
    color: "#64748b",
    lineHeight: "1.6",
  },
};

export default HomePage;
STEP 3 — Save File

Press:

Ctrl + S
STEP 4 — Refresh Browser

Open:

http://localhost:5173/

Now your UI should look much cleaner and professional.

TASK 24 CHECKLIST

✅ Better alignment
✅ Modern homepage
✅ Feature cards
✅ Professional buttons
✅ Better spacing
✅ Better typography
✅ Cleaner layout

INSTALL ITEMS LIST — Task 24

















TASK 25 — Improve Navbar UI

Goal:

Make top navigation look professional
Add app name
Align links properly
STEP 1 — Open Navbar.jsx
frontend/src/components/Navbar.jsx

Replace all code with:

import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav style={styles.navbar}>
      <div style={styles.logo}>
        🌐 Expired Domain Manager
      </div>

      <div style={styles.links}>
        <Link style={styles.link} to="/">
          Home
        </Link>

        <Link style={styles.link} to="/upload">
          Upload
        </Link>

        <Link style={styles.link} to="/batches">
          Batches
        </Link>
      </div>
    </nav>
  );
}

const styles = {
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 50px",
    background: "white",
    borderBottom: "1px solid #e5e7eb",
    boxShadow: "0 4px 15px rgba(0,0,0,0.04)",
  },

  logo: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#111827",
  },

  links: {
    display: "flex",
    gap: "30px",
  },

  link: {
    color: "#4b5563",
    textDecoration: "none",
    fontSize: "17px",
    fontWeight: "500",
  },
};

export default Navbar;
STEP 2 — Save
Ctrl + S
STEP 3 — Check browser

Open:

http://localhost:5173/

You should see:

🌐 Expired Domain Manager      Home Upload Batches
TASK 25 CHECKLIST

✅ Navbar aligned
✅ App name added
✅ Links aligned right
✅ Underline removed
✅ Cleaner professional look

INSTALL ITEMS LIST — Task 25







TASK 26 — Improve Upload Page UI

Goal:

Make upload page look clean
Center upload box
Show selected file name
Better buttons and messages
STEP 1 — Open UploadPage.jsx
frontend/src/pages/UploadPage.jsx

Replace all code with this:

import { useState } from "react";
import axios from "axios";

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState("");
  const [totalDomains, setTotalDomains] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setMessage("");
    setTotalDomains(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("Please select a file");
      return;
    }

    const allowedExtensions = ["txt", "xlsx", "csv"];
    const fileExtension = selectedFile.name.split(".").pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      setMessage("Only TXT, XLSX and CSV files are allowed");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await axios.post(
        "http://localhost:5000/api/upload",
        formData
      );

      setMessage(response.data.message);
      setTotalDomains(response.data.totalDomains);
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      setMessage("File upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setMessage("");
    setTotalDomains(null);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Upload Domain File</h1>

        <p style={styles.subtitle}>
          Upload TXT, CSV, or Excel file to create a new expired domain batch.
        </p>

        <input
          type="file"
          accept=".txt,.xlsx,.csv"
          onChange={handleFileChange}
          key={selectedFile ? "file-selected" : "file-empty"}
          style={styles.fileInput}
        />

        {selectedFile && (
          <p style={styles.fileName}>
            Selected File: {selectedFile.name}
          </p>
        )}

        <div style={styles.buttons}>
          <button
            onClick={handleUpload}
            disabled={loading}
            style={styles.primaryBtn}
          >
            {loading ? "Uploading..." : "Upload File"}
          </button>

          <button onClick={handleClear} style={styles.secondaryBtn}>
            Clear
          </button>
        </div>

        {message && <p style={styles.message}>{message}</p>}

        {totalDomains !== null && (
          <p style={styles.count}>Total Domains: {totalDomains}</p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "80vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(180deg, #faf7ff, #ffffff)",
    padding: "30px",
  },
  card: {
    width: "100%",
    maxWidth: "520px",
    background: "white",
    padding: "40px",
    borderRadius: "20px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  title: {
    fontSize: "34px",
    marginBottom: "10px",
    color: "#111827",
  },
  subtitle: {
    color: "#64748b",
    fontSize: "16px",
    lineHeight: "1.6",
    marginBottom: "30px",
  },
  fileInput: {
    padding: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  fileName: {
    marginTop: "15px",
    color: "#6d28d9",
    fontWeight: "600",
  },
  buttons: {
    marginTop: "25px",
  },
  primaryBtn: {
    padding: "13px 28px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    marginRight: "12px",
  },
  secondaryBtn: {
    padding: "13px 28px",
    background: "white",
    color: "#6d28d9",
    border: "1px solid #6d28d9",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  message: {
    marginTop: "25px",
    fontWeight: "600",
    color: "#111827",
  },
  count: {
    color: "#16a34a",
    fontWeight: "700",
  },
};

export default UploadPage;
STEP 2 — Save
Ctrl + S
STEP 3 — Test

Open:

http://localhost:5173/upload

Upload a TXT/CSV/XLSX file.

TASK 26 CHECKLIST

✅ Upload page centered
✅ Upload card added
✅ File name visible
✅ Buttons improved
✅ Success message improved
✅ Total domain count visible

INSTALL ITEMS LIST — Task 26



TASK 27 — Improve Batch List Page UI

Goal:

Make batches page clean
Show batches in modern table
Add better delete button
Make batch name clearly clickable
STEP 1 — Open BatchPage.jsx
frontend/src/pages/BatchPage.jsx

Replace all code with this:

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

function BatchPage() {
  const [batches, setBatches] = useState([]);
  const [message, setMessage] = useState("");

  const fetchBatches = async () => {
    try {
      const response = await axios.get(
        "http://localhost:5000/api/batches/getBatches"
      );

      setBatches(response.data);
    } catch (error) {
      console.error(error);
      setMessage("Failed to fetch batches");
    }
  };

  const handleDelete = async (batchId) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this batch?"
    );

    if (!confirmDelete) return;

    try {
      await axios.delete(
        `http://localhost:5000/api/batches/deleteBatch/${batchId}`
      );

      fetchBatches();
    } catch (error) {
      console.error(error);
      alert("Delete failed");
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Uploaded Batches</h1>
        <p style={styles.subtitle}>
          View, open, and manage all uploaded domain batches.
        </p>
      </div>

      {message && <p style={styles.error}>{message}</p>}

      <div style={styles.card}>
        {batches.length === 0 ? (
          <p style={styles.empty}>No batches found</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Batch Name</th>
                <th style={styles.th}>File Name</th>
                <th style={styles.th}>Total Domains</th>
                <th style={styles.th}>Uploaded Date</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {batches.map((batch) => (
                <tr key={batch._id}>
                  <td style={styles.td}>
                    <Link
                      to={`/batches/${batch._id}`}
                      style={styles.batchLink}
                    >
                      {batch.batchName}
                    </Link>
                  </td>

                  <td style={styles.td}>{batch.originalFileName}</td>

                  <td style={styles.td}>
                    <span style={styles.countBadge}>
                      {batch.totalDomains}
                    </span>
                  </td>

                  <td style={styles.td}>
                    {new Date(batch.createdAt).toLocaleString()}
                  </td>

                  <td style={styles.td}>
                    <button
                      onClick={() => handleDelete(batch._id)}
                      style={styles.deleteBtn}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "80vh",
    background: "linear-gradient(180deg, #faf7ff, #ffffff)",
    padding: "50px",
  },
  header: {
    marginBottom: "30px",
  },
  title: {
    fontSize: "38px",
    marginBottom: "8px",
    color: "#111827",
  },
  subtitle: {
    color: "#64748b",
    fontSize: "17px",
  },
  card: {
    background: "white",
    borderRadius: "18px",
    padding: "25px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "16px",
    background: "#f3f0ff",
    color: "#4c1d95",
    fontSize: "15px",
  },
  td: {
    padding: "16px",
    borderBottom: "1px solid #e5e7eb",
    color: "#374151",
  },
  batchLink: {
    color: "#6d28d9",
    fontWeight: "700",
    textDecoration: "none",
  },
  countBadge: {
    background: "#ede9fe",
    color: "#6d28d9",
    padding: "6px 12px",
    borderRadius: "20px",
    fontWeight: "700",
  },
  deleteBtn: {
    background: "#ef4444",
    color: "white",
    border: "none",
    padding: "9px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
  },
  empty: {
    textAlign: "center",
    color: "#64748b",
    fontSize: "18px",
  },
  error: {
    color: "#ef4444",
    fontWeight: "600",
  },
};

export default BatchPage;
STEP 2 — Save
Ctrl + S
STEP 3 — Test

Open:

http://localhost:5173/batches

You should see a cleaner batch list table.

TASK 27 CHECKLIST

✅ Batch page improved
✅ Modern table added
✅ Batch name clickable
✅ Domain count badge added
✅ Delete button styled
✅ Layout improved

INSTALL ITEMS LIST — Task 27



TASK 28 — Improve Domain List Page UI

Goal:

Make domains page clean
Improve search box
Show total + showing count
Make table professional
STEP 1 — Open DomainPage.jsx
frontend/src/pages/DomainPage.jsx

Replace all code with this:

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

function DomainPage() {
  const { batchId } = useParams();

  const [domains, setDomains] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");

  const fetchDomains = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/domains/batch/${batchId}`
      );

      setDomains(response.data);
    } catch (error) {
      console.error(error);
      setMessage("Failed to fetch domains");
    }
  };

  useEffect(() => {
    fetchDomains();
  }, [batchId]);

  const filteredDomains = domains.filter((domain) =>
    domain.domainName
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Domains in Batch</h1>
        <p style={styles.subtitle}>
          Search and view all domains uploaded in this batch.
        </p>
      </div>

      {message && <p style={styles.error}>{message}</p>}

      <div style={styles.topBar}>
        <input
          type="text"
          placeholder="Search domains..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />

        <div style={styles.stats}>
          <span style={styles.statBox}>Total: {domains.length}</span>
          <span style={styles.statBox}>Showing: {filteredDomains.length}</span>
        </div>
      </div>

      <div style={styles.card}>
        {filteredDomains.length === 0 ? (
          <p style={styles.empty}>No domains found</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>No</th>
                <th style={styles.th}>Domain Name</th>
                <th style={styles.th}>Added Date</th>
              </tr>
            </thead>

            <tbody>
              {filteredDomains.map((domain, index) => (
                <tr key={domain._id}>
                  <td style={styles.td}>{index + 1}</td>
                  <td style={styles.domainName}>{domain.domainName}</td>
                  <td style={styles.td}>
                    {new Date(domain.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "80vh",
    background: "linear-gradient(180deg, #faf7ff, #ffffff)",
    padding: "50px",
  },
  header: {
    marginBottom: "25px",
  },
  title: {
    fontSize: "38px",
    marginBottom: "8px",
    color: "#111827",
  },
  subtitle: {
    color: "#64748b",
    fontSize: "17px",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "25px",
    gap: "20px",
  },
  searchInput: {
    width: "350px",
    padding: "14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    fontSize: "16px",
  },
  stats: {
    display: "flex",
    gap: "12px",
  },
  statBox: {
    background: "#ede9fe",
    color: "#6d28d9",
    padding: "10px 16px",
    borderRadius: "20px",
    fontWeight: "700",
  },
  card: {
    background: "white",
    borderRadius: "18px",
    padding: "25px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "16px",
    background: "#f3f0ff",
    color: "#4c1d95",
    fontSize: "15px",
  },
  td: {
    padding: "16px",
    borderBottom: "1px solid #e5e7eb",
    color: "#374151",
  },
  domainName: {
    padding: "16px",
    borderBottom: "1px solid #e5e7eb",
    color: "#6d28d9",
    fontWeight: "700",
  },
  empty: {
    textAlign: "center",
    color: "#64748b",
    fontSize: "18px",
  },
  error: {
    color: "#ef4444",
    fontWeight: "600",
  },
};

export default DomainPage;
STEP 2 — Save
Ctrl + S
STEP 3 — Test

Open:

http://localhost:5173/batches

Click one batch name.

You should see a cleaner domain list page.

TASK 28 CHECKLIST

✅ Domain page improved
✅ Search box styled
✅ Total count visible
✅ Showing count visible
✅ Modern table added
✅ Domain names highlighted

INSTALL ITEMS LIST — Task 28



TASK 29 — Add Back Button in Domain Page

Goal:

Domains page
↓
Click Back to Batches
↓
Return to batch list
STEP 1 — Open DomainPage.jsx
frontend/src/pages/DomainPage.jsx
STEP 2 — Import Link

At the top, change this:

import { useParams } from "react-router-dom";

to this:

import { Link, useParams } from "react-router-dom";
STEP 3 — Add Back Button

Inside return, below subtitle:

<Link to="/batches">
  <button style={styles.backBtn}>← Back to Batches</button>
</Link>

Example place:

<div style={styles.header}>
  <h1 style={styles.title}>Domains in Batch</h1>

  <p style={styles.subtitle}>
    Search and view all domains uploaded in this batch.
  </p>

  <Link to="/batches">
    <button style={styles.backBtn}>← Back to Batches</button>
  </Link>
</div>
STEP 4 — Add Button Style

Inside styles, add:

backBtn: {
  marginTop: "15px",
  padding: "10px 18px",
  background: "white",
  color: "#6d28d9",
  border: "1px solid #6d28d9",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: "600",
},
TASK 29 CHECKLIST

✅ Imported Link
✅ Added Back to Batches button
✅ Button styled
✅ Navigation working

INSTALL ITEMS LIST — Task 29





Phase 1 — Completed Roadmap (Tasks 1–30)
Backend Setup
1. MERN Project Setup
Installed Node.js
Installed VS Code
Created backend/frontend
Started Express server
Started React Vite frontend
2. Backend Structure + MongoDB Connection
Installed mongoose
Installed nodemon
Created clean backend architecture
Connected MongoDB Atlas
Setup .env
3. MongoDB Models
Created Batch model
Created Domain model
Backend APIs
4. Batch API Routes
Create batch API
Get all batches API
5. Domain API Routes
Create domain API
Get domains by batch ID API
6. TXT File Upload System
Installed multer
Created upload API
Saved uploaded files
7. Read TXT + Save Domains
Read TXT file
Create batch automatically
Save domains into MongoDB
8. Excel/XLSX Support
Installed xlsx package
Read Excel files
Save Excel domains
9. Domain Cleaning System
Remove duplicates
Remove empty lines
Remove invalid rows
Convert lowercase
10. Batch & Domain Retrieval
Fetch all batches
Fetch domains inside selected batch
Frontend Structure
11. React Frontend Structure
Created:
components
pages
services
Added base pages
12. Routing + Axios
Installed axios
Installed react-router-dom
Setup page routing
Upload System Frontend
13. Upload UI
File input
Upload button
File selection handling
14. Connect Upload Frontend → Backend
Upload real files
Send files to backend
Show upload result
Batch Management Frontend
15. Show Uploaded Batches
Fetch batches from backend
Display batch table
16. View Domains by Batch
Dynamic route:
/batches/:batchId
Show domains inside selected batch
17. Navigation Menu
Created Navbar
Added page navigation
18. Delete Batch System
Delete batch API
Delete related domains
Delete button in frontend
Domain Search & Statistics
19. Search Domains
Real-time search
Case-insensitive filtering
20. Domain Count Display
Total domain count
Showing filtered count
Upload UX Improvements
21. Upload Loading State
Uploading status
Disable upload button
22. Clear Upload State
Clear selected file
Reset upload form
UI/UX Improvements
23. Basic Home Dashboard
Navigation buttons
Feature overview
24. Modern Homepage UI
Professional landing page
Feature cards
Modern buttons/layout
25. Modern Navbar UI
Styled navbar
Better alignment
26. Modern Upload Page UI
Upload card design
Styled buttons/messages
27. Modern Batch Page UI
Professional table
Styled delete button
Better layout
28. Modern Domain Page UI
Modern search bar
Styled domain table
Count badges
29. Back Button Navigation
Back to batches button
30. Upload Shortcut in Batch Page
Quick upload button
Improved workflow
Technologies Used in Phase 1
Backend
Node.js
Express.js
MongoDB
Mongoose
Multer
XLSX
dotenv
cors
Frontend
React
Vite
Axios
React Router DOM
Current System Features

✅ TXT Upload
✅ CSV Upload
✅ XLSX Upload
✅ Batch Creation
✅ Domain Storage
✅ Search Domains
✅ Delete Batches
✅ View Batch Domains
✅ Real-time Upload
✅ Modern UI
✅ Navigation System
✅ MongoDB Integration
✅ REST APIs
✅ Frontend + Backend Integration