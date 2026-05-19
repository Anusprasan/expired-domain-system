Phase 2 — Task 01
Push Phase 1 Project to GitHub

Goal:

Save current Phase 1 project safely before changing code for Phase 2
STEP 1 — Create GitHub account / login

Go to GitHub and login.

STEP 2 — Create new repository

Repository name:

expired-domain-system

Do not tick:

Add README

Do not add .gitignore there.

STEP 3 — Open project in VS Code

Open:

expired-domain-system
STEP 4 — Create .gitignore

In root folder create:

.gitignore

Add this:

node_modules
.env
uploads
dist
.DS_Store
STEP 5 — Open terminal in root folder

Make sure you are NOT inside backend or frontend.

You should be inside:

expired-domain-system
STEP 6 — Run Git commands
git init
git add .
git commit -m "Completed Phase 1 expired domain manager"
STEP 7 — Connect GitHub repo

Copy your GitHub repo URL, then run:

git remote add origin https://github.com/YOUR_USERNAME/expired-domain-system.git

Then:

git branch -M main
git push -u origin main
Task 01 Checklist

✅ GitHub repo created
✅ .gitignore created
✅ Project committed
✅ Project pushed to GitHub
✅ Phase 1 backup completed

Install items list — Task 01





Task 02 — Final Architecture Planning
Project: MERN Expired Domain Manager

🎯 Goal
Finalize the complete system architecture before coding Phase 2.
This task defines:
database structureworkflow enginerolespermissionsdomain lifecycleAPI structurefrontend structurehistory tracking

1. FINAL SYSTEM WORKFLOW
Uploader pastes domains↓Domains saved into DraftSheet + DraftDomain↓Uploader previews own draft domains↓Uploader clicks "Move To Next Process"↓System automatically:    - cleans domains    - validates domains    - removes duplicates    - removes invalid entries    - stores rejected history↓Accepted domains move to Processor Queue↓Processor reviews filtered domains↓Processor creates Final Batch↓System locks processed draft↓System marks domains processed↓System stores processing summary↓Admin can manage everything

2. DOMAIN STATUS FLOW
DraftDomain Status
draftfilteredprocessingprocessedduplicateinvalidrejecteddeleted

3. DATABASE ARCHITECTURE
User Model
{  name,  email,  password,  role, // uploader | processor | admin  isActive,  createdAt}

DraftSheet Model
Purpose:
stores one paste session
Example:
{  title,  addedBy,  totalDomains,  acceptedCount,  rejectedCount,  status, // open | locked | processed  createdAt}

DraftDomain Model
Purpose:
stores every individual domain
Example:
{  domain,  cleanDomain,  status,  rejectionReason,  sheetId,  addedBy,  processedBy,  processedAt,  createdAt}

Final Batch Model
Purpose:
stores processor-created final batches
Example:
{  batchName,  domains,  createdBy,  totalDomains,  createdAt}

DomainHistory Model
Purpose:
full audit/history tracking
Track:
who addedwho deletedwho processedwho moved domainstimestampsduplicate historyrejected history
Example:
{  domain,  action,  reason,  userId,  role,  createdAt}

4. ROLE SYSTEM
Uploader
Can:
paste domainspreview own draftsdelete own draft domainsmove own draft to next process
Cannot:
see other user draftsaccess processor pagesmanage users

Processor
Can:
view filtered domainsreview accepted domainsview rejected summarycreate final batches
Cannot:
manage usersdelete uploader drafts

Admin
Can:
manage usersassign rolesview all historyview all draftsview all batchesview all processing logs

5. BACKEND STRUCTURE
backend/├── config/├── controllers/│   ├── authController.js│   ├── uploaderController.js│   ├── processorController.js│   ├── adminController.js│├── middleware/│   ├── authMiddleware.js│   └── roleMiddleware.js│├── models/│   ├── User.js│   ├── DraftSheet.js│   ├── DraftDomain.js│   ├── FinalBatch.js│   └── DomainHistory.js│├── routes/│   ├── authRoutes.js│   ├── uploaderRoutes.js│   ├── processorRoutes.js│   └── adminRoutes.js│├── services/│   ├── domainCleaner.js│   ├── domainValidator.js│   └── duplicateChecker.js

6. FRONTEND STRUCTURE
frontend/src/├── pages/│   ├── LoginPage.jsx│   ├── PasteDomainsPage.jsx│   ├── MyDraftsPage.jsx│   ├── ProcessorQueuePage.jsx│   ├── FinalBatchesPage.jsx│   ├── UsersPage.jsx│   └── HistoryPage.jsx

7. FINAL UI DIRECTION
KEEP current Phase 1 UI style.
Use:
white cardspurple accentssimple tableslarge textareaminimal buttonsclean spacing
DO NOT use:
complex dashboardsheavy animationsenterprise cluttertoo many menus

8. API STRUCTURE
Auth
POST /api/auth/registerPOST /api/auth/loginGET  /api/auth/me

Uploader
POST   /api/uploader/pasteGET    /api/uploader/my-draftsDELETE /api/uploader/domain/:idPOST   /api/uploader/move-next/:sheetId

Processor
GET  /api/processor/queueGET  /api/processor/rejected-summaryPOST /api/processor/create-batch

Admin
GET   /api/admin/usersPATCH /api/admin/users/:id/roleGET   /api/admin/historyGET   /api/admin/batches

9. IMPORTANT ARCHITECTURE RULES
No file upload system
Remove:
multerxlsx uploadcsv uploadtxt upload

Copy-paste only
Main input:
large textarea

Powerful backend, simple frontend
Backend handles:
cleaningvalidationduplicateshistoryprocessing
Frontend only displays clean workflow.

✅ Task 02 Result
Architecture fully finalized.



Task 03 — Create User Authentication System
Goal

Create login/register system with JWT authentication.

Files to Create
backend/models/User.js
backend/controllers/authController.js
backend/middleware/authMiddleware.js
backend/routes/authRoutes.js
Install Packages

Inside backend:

npm install bcryptjs jsonwebtoken
1. User Model

Create:

backend/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      enum: ["uploader", "processor", "admin"],
      default: "uploader",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
2. Auth Controller

Create:

backend/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const createToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

export async function registerUser(req, res) {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "uploader",
    });

    const token = createToken(user._id);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Your account is disabled" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = createToken(user._id);

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getMe(req, res) {
  res.status(200).json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
}
3. Auth Middleware

Create:

backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function protect(req, res, next) {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account disabled" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ message: "Not authorized, token failed" });
  }
}
4. Auth Routes

Create:

backend/routes/authRoutes.js
import express from "express";
import {
  registerUser,
  loginUser,
  getMe,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", protect, getMe);

export default router;
5. Add Route in server.js

In your main backend file, add:

import authRoutes from "./routes/authRoutes.js";

Then add:

app.use("/api/auth", authRoutes);
6. Add JWT_SECRET in .env
JWT_SECRET=your_super_secret_key_here
Test APIs
Register
POST http://localhost:5000/api/auth/register

Body:

{
  "name": "Admin User",
  "email": "admin@gmail.com",
  "password": "123456",
  "role": "admin"
}
Login
POST http://localhost:5000/api/auth/login

Body:

{
  "email": "admin@gmail.com",
  "password": "123456"
}
Get Logged User
GET http://localhost:5000/api/auth/me

Header:

Authorization: Bearer YOUR_TOKEN_HERE

Task 03 result:

Register ✅
Login ✅
JWT token ✅
Protected route ✅
Logged user info ✅

Task 04 — Basic Role Protection
1. What we are building

We are building middleware to check user role.

For now, we only focus on:

uploader

Later same middleware can protect:

processor
admin
2. Why we need this

Upcoming uploader APIs must be protected:

/api/uploader/paste
/api/uploader/my-drafts
/api/uploader/delete/:id
/api/uploader/move-next/:sheetId

Only logged-in users with role:

uploader

should access them.

Step 1 — Create Role Middleware

Create file:

backend/middleware/roleMiddleware.js

Add:

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "User not authenticated",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    next();
  };
};

module.exports = { authorizeRoles };
Step 2 — Create Uploader Test Route

Create file:

backend/routes/testRoutes.js

Add:

const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
  "/uploader",
  protect,
  authorizeRoles("uploader"),
  (req, res) => {
    res.json({
      message: "Uploader route accessed",
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }
);

module.exports = router;
Step 3 — Connect Test Route in server.js

Open:

backend/server.js

Add near other route imports:

const testRoutes = require("./routes/testRoutes");

Add near other app.use():

app.use("/api/test", testRoutes);
Step 4 — Test

Login first:

POST http://localhost:5000/api/auth/login

Copy token.

Then test:

GET http://localhost:5000/api/test/uploader

Header:

Authorization: Bearer YOUR_TOKEN_HERE
Expected result if user role is uploader
{
  "message": "Uploader route accessed",
  "user": {
    "id": "...",
    "name": "...",
    "email": "...",
    "role": "uploader"
  }
}
Expected result if user role is admin/processor
{
  "message": "Access denied"
}
Task 04 Complete Result

After this, your backend can protect uploader-only APIs.


Task 05 — Create Shared Draft Batch Models
What we are building

We are creating 2 models:

DraftSheet
DraftDomain

But now the logic is updated:

DraftSheet = one shared open batch
DraftDomain = each domain pasted by uploaders
Why we need this

Your real workflow:

Many uploaders can paste domains into one current batch
Each uploader sees only their own pasted domains
Everyone can see total domain count in current batch
When Move To Process is clicked, that batch is locked
Step 1 — Create DraftSheet Model

Create:

backend/models/DraftSheet.js

Add:

const mongoose = require("mongoose");

const draftSheetSchema = new mongoose.Schema(
  {
    batchName: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["open", "locked", "processed"],
      default: "open",
    },

    totalDomains: {
      type: Number,
      default: 0,
    },

    acceptedCount: {
      type: Number,
      default: 0,
    },

    rejectedCount: {
      type: Number,
      default: 0,
    },

    movedToProcessBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    movedToProcessAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const DraftSheet = mongoose.model("DraftSheet", draftSheetSchema);

module.exports = DraftSheet;
Why this model is needed

This stores the current shared batch.

Example:

Batch #1
Total Domains: 500
Status: open

When someone clicks Move To Process:

status changes from open to locked
Step 2 — Create DraftDomain Model

Create:

backend/models/DraftDomain.js

Add:

const mongoose = require("mongoose");

const draftDomainSchema = new mongoose.Schema(
  {
    domain: {
      type: String,
      required: true,
      trim: true,
    },

    cleanDomain: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "draft",
        "filtered",
        "duplicate",
        "invalid",
        "rejected",
        "processed",
        "deleted",
      ],
      default: "draft",
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    sheetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DraftSheet",
      required: true,
    },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const DraftDomain = mongoose.model("DraftDomain", draftDomainSchema);

module.exports = DraftDomain;
Why this model is needed

This stores each domain.

Important field:

addedBy

This allows:

Uploader sees only own pasted domains
Admin/Processor can later see all domains
Final workflow with these models
Uploader 1 pastes 100 domains
↓
DraftSheet totalDomains = 100
DraftDomain addedBy = uploader1

Uploader 2 pastes 50 domains
↓
Same DraftSheet totalDomains = 150
DraftDomain addedBy = uploader2

Uploader 2 preview:
shows only uploader2 domains

Batch count:
shows all 150 domains
Task 05 Result

After this task, your database is ready for:

shared current batch
private uploader preview
batch total count
move to process workflow



Task 06 — Create DomainHistory Model

1. What We Are Building
We are creating:
DomainHistory model
This will track all important actions in the system.

2. Why We Need This
Your workflow includes:
many uploadersshared batchdomain cleaningduplicatesinvalid domainsmove to processprocessor workflow later
So later we must know:
who added domainwho deleted domainwho moved batch to processwhy domain rejectedwhen action happened
Without history:
no trackingno auditno debuggingno accountability

3. What This Model Will Track
Examples:
domain addeddomain deletedduplicate removedinvalid domain rejectedbatch moved to processprocessor accepted domain

Step 1 — Create Model File
Create:
backend/models/DomainHistory.js

Step 2 — Add Model Code
const mongoose = require("mongoose");const domainHistorySchema = new mongoose.Schema(  {    domain: {      type: String,      trim: true,      default: "",    },    action: {      type: String,      enum: [        "added",        "deleted",        "duplicate",        "invalid",        "rejected",        "moved_to_process",        "processed",      ],      required: true,    },    reason: {      type: String,      default: "",    },    sheetId: {      type: mongoose.Schema.Types.ObjectId,      ref: "DraftSheet",      default: null,    },    domainId: {      type: mongoose.Schema.Types.ObjectId,      ref: "DraftDomain",      default: null,    },    userId: {      type: mongoose.Schema.Types.ObjectId,      ref: "User",      required: true,    },    role: {      type: String,      enum: ["uploader", "processor", "admin"],      required: true,    },  },  { timestamps: true });const DomainHistory = mongoose.model(  "DomainHistory",  domainHistorySchema);module.exports = DomainHistory;

4. Why Each Field Exists
domain
Stores affected domain.
Example:
google.com

action
Stores what happened.
Example:
addeddeletedduplicateinvalid

reason
Stores why action happened.
Example:
duplicate domaininvalid extensionmanual delete

sheetId
Tracks which batch/sheet this belongs to.

domainId
Tracks exact DraftDomain record.

userId
Tracks who performed action.

role
Tracks uploader/processor/admin action type.

5. Real Workflow Example
Uploader adds domain
History:
domain: google.comaction: addeduser: uploader1

Duplicate found later
History:
domain: google.comaction: duplicatereason: already exists in database

Batch moved to process
History:
action: moved_to_processuser: uploader2

6. Why We Build This Now
Upcoming tasks will automatically create history entries.
Example:
Task 07 — Paste Domains API
will save:
added history
Task 09 later will save:
duplicate historyinvalid historymove_to_process history
So history system must exist first.

7. Task 06 Final Result
After this task, backend can fully track:
domain actionsuploader actionsfuture processor actionsfuture admin actions









Task 07 — Create Paste Domains API
1. What We Are Building

We are building:

Paste Domains API

Uploader will:

copy domains
paste domains
save into current open batch
2. Why We Need This

This is the core uploader workflow.

Until now we only created:

models
auth
roles
history

Now we create the first real uploader action.

3. Final Workflow of This API
If open batch exists
use existing DraftSheet
If no open batch exists
create new DraftSheet

Then:

split pasted text by lines
save each domain into DraftDomain
increase batch total count
store history
4. Create Uploader Controller

Create:

backend/controllers/uploaderController.js
Step 1 — Add Controller Code
const DraftSheet = require("../models/DraftSheet");
const DraftDomain = require("../models/DraftDomain");
const DomainHistory = require("../models/DomainHistory");

const pasteDomains = async (req, res) => {
  try {
    const { domains } = req.body;

    if (!domains) {
      return res.status(400).json({
        message: "Domains are required",
      });
    }

    // find current open batch
    let draftSheet = await DraftSheet.findOne({
      status: "open",
    });

    // create batch if no open batch
    if (!draftSheet) {
      const batchCount = await DraftSheet.countDocuments();

      draftSheet = await DraftSheet.create({
        batchName: `Batch #${batchCount + 1}`,
      });
    }

    // split pasted domains
    const domainList = domains
      .split("\n")
      .map((domain) => domain.trim())
      .filter((domain) => domain !== "");

    const savedDomains = [];

    for (const domain of domainList) {
      // save domain
      const draftDomain = await DraftDomain.create({
        domain,
        sheetId: draftSheet._id,
        addedBy: req.user._id,
      });

      savedDomains.push(draftDomain);

      // save history
      await DomainHistory.create({
        domain,
        action: "added",
        sheetId: draftSheet._id,
        domainId: draftDomain._id,
        userId: req.user._id,
        role: req.user.role,
      });
    }

    // update total count
    draftSheet.totalDomains += savedDomains.length;

    await draftSheet.save();

    res.status(201).json({
      message: "Domains pasted successfully",
      batch: {
        id: draftSheet._id,
        batchName: draftSheet.batchName,
        totalDomains: draftSheet.totalDomains,
      },
      addedCount: savedDomains.length,
    });
  } catch (error) {
    console.error("Paste domains error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  pasteDomains,
};
5. Why This Controller Works Like Your Workflow
Shared current batch
DraftSheet.findOne({ status: "open" })

All uploaders use same open batch.

Private uploader domains
addedBy: req.user._id

Later preview will show only logged user domains.

Auto batch creation

If current batch finished:

new batch automatically created
6. Create Uploader Routes

Create:

backend/routes/uploaderRoutes.js
Step 2 — Add Routes
const express = require("express");

const {
  pasteDomains,
} = require("../controllers/uploaderController");

const {
  protect,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
  "/paste",
  protect,
  authorizeRoles("uploader"),
  pasteDomains
);

module.exports = router;
7. Connect Routes in server.js

Open:

backend/server.js

Add import:

const uploaderRoutes = require("./routes/uploaderRoutes");

Add route:

app.use("/api/uploader", uploaderRoutes);
8. Test Task 07
URL
POST http://localhost:5000/api/uploader/paste
Headers
Authorization: Bearer YOUR_TOKEN
Body
{
  "domains": "google.com\nfacebook.com\ntest.net"
}
9. Expected Result
{
  "message": "Domains pasted successfully",
  "batch": {
    "id": "...",
    "batchName": "Batch #1",
    "totalDomains": 3
  },
  "addedCount": 3
}
10. What Happens in MongoDB

Collections updated:

draftsheets
draftdomains
domainhistories
11. Real Workflow Example

Uploader 1 pastes:

100 domains

Batch count:

100

Uploader 2 pastes:

50 domains

Same batch count:

150

But preview later will filter:

addedBy = logged user
Task 07 Final Result

After this task:

shared batch works
paste workflow works
history tracking works
uploader ownership works







Task 08 — Create My Draft Preview API
1. What We Are Building

We are building:

My Draft Preview API

This allows uploader to:

open preview
see current batch count
see only domains they pasted
2. Why We Need This

Your real workflow:

many uploaders work in same batch

But each uploader should only see:

their own pasted domains

while still seeing:

shared batch total domain count
3. Final Preview Behavior
Example
Current shared batch:
Total domains: 500
Uploader 1 preview:
shows only uploader1 domains
Uploader 2 preview:
shows only uploader2 domains
4. Add Controller Function

Open:

backend/controllers/uploaderController.js

Add this BELOW pasteDomains.

Step 1 — Add getMyDraftPreview()
const getMyDraftPreview = async (req, res) => {
  try {
    // find current open batch
    const draftSheet = await DraftSheet.findOne({
      status: "open",
    });

    // no open batch
    if (!draftSheet) {
      return res.status(404).json({
        message: "No open batch found",
      });
    }

    // get only logged uploader domains
    const myDomains = await DraftDomain.find({
      sheetId: draftSheet._id,
      addedBy: req.user._id,
      status: { $ne: "deleted" },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      batch: {
        id: draftSheet._id,
        batchName: draftSheet.batchName,
        totalDomains: draftSheet.totalDomains,
        status: draftSheet.status,
      },

      myDomainsCount: myDomains.length,

      myDomains,
    });
  } catch (error) {
    console.error("Preview error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
5. Export Function

At bottom of controller:

Change:

module.exports = {
  pasteDomains,
};

To:

module.exports = {
  pasteDomains,
  getMyDraftPreview,
};
6. Add Route

Open:

backend/routes/uploaderRoutes.js
Step 2 — Import Function

Change:

const {
  pasteDomains,
} = require("../controllers/uploaderController");

To:

const {
  pasteDomains,
  getMyDraftPreview,
} = require("../controllers/uploaderController");
Step 3 — Add Route

Add BELOW /paste route:

router.get(
  "/my-preview",
  protect,
  authorizeRoles("uploader"),
  getMyDraftPreview
);
7. Test Task 08
URL
GET http://localhost:5000/api/uploader/my-preview
Headers
Authorization: Bearer YOUR_TOKEN
8. Expected Result

Example:

{
  "batch": {
    "id": "...",
    "batchName": "Batch #1",
    "totalDomains": 150,
    "status": "open"
  },

  "myDomainsCount": 50,

  "myDomains": [
    {
      "_id": "...",
      "domain": "google.com",
      "status": "draft"
    },
    {
      "_id": "...",
      "domain": "facebook.com",
      "status": "draft"
    }
  ]
}
9. Important Result

This API perfectly matches your workflow:

Shared batch count
all uploader domains count
Private preview
only logged uploader domains
10. Task 08 Final Result

After this task:

shared batch preview works
private uploader preview works





Task 09 — Delete Own Draft Domain API
1. What We Are Building

We are building:

Delete Own Draft Domain API

Uploader can delete:

only domains they personally pasted

before batch is moved to process.

2. Why We Need This

Your uploader workflow requires:

paste domains
preview domains
remove mistakes
continue pasting

Without delete:

wrong domains stay in batch
3. Important Security Rule

Uploader must NOT delete:

other uploader domains

So backend checks:

addedBy === logged user
4. Delete Logic

When deleting:

mark domain as deleted

We do NOT permanently remove database record.

Reason:

history tracking
future audit
safer workflow
5. Add Controller Function

Open:

backend/controllers/uploaderController.js

Add BELOW getMyDraftPreview.

Step 1 — Add deleteMyDraftDomain()
const deleteMyDraftDomain = async (req, res) => {
  try {
    const { id } = req.params;

    // find domain
    const draftDomain = await DraftDomain.findById(id);

    if (!draftDomain) {
      return res.status(404).json({
        message: "Domain not found",
      });
    }

    // check ownership
    if (
      draftDomain.addedBy.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You can delete only your domains",
      });
    }

    // already deleted
    if (draftDomain.status === "deleted") {
      return res.status(400).json({
        message: "Domain already deleted",
      });
    }

    // soft delete
    draftDomain.status = "deleted";

    await draftDomain.save();

    // reduce batch count
    await DraftSheet.findByIdAndUpdate(
      draftDomain.sheetId,
      {
        $inc: { totalDomains: -1 },
      }
    );

    // save history
    await DomainHistory.create({
      domain: draftDomain.domain,
      action: "deleted",
      reason: "Uploader deleted domain",
      sheetId: draftDomain.sheetId,
      domainId: draftDomain._id,
      userId: req.user._id,
      role: req.user.role,
    });

    res.status(200).json({
      message: "Domain deleted successfully",
    });
  } catch (error) {
    console.error("Delete domain error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
6. Export Function

At bottom of controller:

Change:

module.exports = {
  pasteDomains,
  getMyDraftPreview,
};

To:

module.exports = {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
};
7. Add Route

Open:

backend/routes/uploaderRoutes.js
Step 2 — Import Function

Change:

const {
  pasteDomains,
  getMyDraftPreview,
} = require("../controllers/uploaderController");

To:

const {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
} = require("../controllers/uploaderController");
Step 3 — Add Delete Route

Add BELOW /my-preview route:

router.delete(
  "/delete/:id",
  protect,
  authorizeRoles("uploader"),
  deleteMyDraftDomain
);
8. Test Task 09
Step 1 — Get Preview
GET /api/uploader/my-preview

Copy one domain _id.

Step 2 — Delete Domain

URL:

DELETE http://localhost:5000/api/uploader/delete/DOMAIN_ID

Example:

DELETE http://localhost:5000/api/uploader/delete/685123abc...
Headers
Authorization: Bearer YOUR_TOKEN
9. Expected Result
{
  "message": "Domain deleted successfully"
}
10. What Happens Internally

System will:

mark status = deleted
reduce batch total count
store delete history
keep database record safely
11. Important Workflow Result

Uploader can now:

paste domains many times
preview own domains
delete mistakes
continue working

before clicking:

Move To Process
Task 09 Final Result

After this task:

private uploader delete works
shared batch count updates
history tracking works









Task 11 — Create My Preview Frontend Page
1. What We Are Building

We are building:

Uploader Preview Page

This page shows:

current batch info
total domains in batch
only logged uploader domains
simple Excel-like table
delete option
2. Why We Need This

Your workflow:

Uploader pastes domains many times
↓
Uploader opens preview
↓
Uploader checks own pasted domains
↓
Uploader deletes mistakes if needed
↓
Uploader continues pasting
↓
Uploader moves batch to process

So preview page is a very important workflow screen.

3. UI Direction

Keep it:

simple
minimal
clean
Excel-like

NOT:

complex spreadsheet software
heavy dashboard
too many columns
4. Create Preview Page

Create:

frontend/src/pages/MyPreviewPage.jsx
Step 1 — Add Page Code
import { useEffect, useState } from "react";
import axios from "axios";

function MyPreviewPage() {
  const [domains, setDomains] = useState([]);

  const [batch, setBatch] = useState(null);

  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchPreview();
  }, []);

  const fetchPreview = async () => {
    try {
      const response = await axios.get(
        "http://localhost:5000/api/uploader/my-preview",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setDomains(response.data.myDomains);

      setBatch(response.data.batch);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const deleteDomain = async (id) => {
    try {
      await axios.delete(
        `http://localhost:5000/api/uploader/my-domains/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      fetchPreview();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-6">

      <div className="bg-white rounded-xl shadow-md p-6">

        <h1 className="text-2xl font-bold text-purple-700 mb-6">
          My Draft Preview
        </h1>

        {batch && (
          <div className="mb-6 bg-purple-50 p-4 rounded-lg">

            <p>
              <strong>Batch:</strong>{" "}
              {batch.batchName}
            </p>

            <p>
              <strong>Total Domains:</strong>{" "}
              {batch.totalDomains}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {batch.status}
            </p>

            <p>
              <strong>Your Domains:</strong>{" "}
              {domains.length}
            </p>

          </div>
        )}

        <div className="overflow-auto border rounded-lg">

          <table className="w-full border-collapse">

            <thead className="bg-purple-100">

              <tr>

                <th className="border p-3 text-left">
                  No
                </th>

                <th className="border p-3 text-left">
                  Domain
                </th>

                <th className="border p-3 text-center">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {domains.map((item, index) => (

                <tr
                  key={item._id}
                  className="hover:bg-gray-50"
                >

                  <td className="border p-3">
                    {index + 1}
                  </td>

                  <td className="border p-3">
                    {item.domain}
                  </td>

                  <td className="border p-3 text-center">

                    <button
                      onClick={() =>
                        deleteDomain(item._id)
                      }
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

export default MyPreviewPage;
5. Why This Matches Your Workflow
Excel-like preview

Simple table:

No | Domain
Private uploader domains

Only domains where:

addedBy = logged uploader
Shared batch info

Shows:

total batch domains
batch status
6. Add Route

Open:

frontend/src/App.jsx

Import:

import MyPreviewPage from "./pages/MyPreviewPage";

Add route:

<Route
  path="/my-preview"
  element={<MyPreviewPage />}
/>
7. Task 11 Final Result

After this task:

Uploader can:
- open preview
- see own domains
- see shared batch count
- delete mistakes

This completes the full uploader workflow UI.

Next Task













Task 10 — Move To Process API
1. What We Are Building

We are building:

Move To Process API

This is the main workflow action.

2. Why We Need This

Until now:

uploaders paste domains
preview domains
delete domains

But batch is still:

open

Now we need a way to:

finish current batch
lock batch
send for processing
3. Your Real Workflow

Example:

Uploader 1 pastes domains
Uploader 2 pastes domains
Uploader 3 pastes domains

Current batch total:

1500 domains

Then if processor requests domains OR uploader decides batch is ready:

one uploader clicks Move To Process

System should:

lock batch
save move history
stop further pasting

Then next paste later creates:

new open batch
4. Final Workflow Logic
Current batch:
status = open

After move:

status = locked

Then later processor workflow starts.

5. Add Controller Function

Open:

backend/controllers/uploaderController.js

Add BELOW deleteMyDraftDomain.

Step 1 — Add moveToProcess()
const moveToProcess = async (req, res) => {
  try {
    // find current open batch
    const draftSheet = await DraftSheet.findOne({
      status: "open",
    });

    if (!draftSheet) {
      return res.status(404).json({
        message: "No open batch found",
      });
    }

    // lock batch
    draftSheet.status = "locked";

    draftSheet.movedToProcessBy = req.user._id;

    draftSheet.movedToProcessAt = new Date();

    await draftSheet.save();

    // save history
    await DomainHistory.create({
      action: "moved_to_process",
      reason: "Batch moved to process",
      sheetId: draftSheet._id,
      userId: req.user._id,
      role: req.user.role,
    });

    res.status(200).json({
      message: "Batch moved to process successfully",
      batch: {
        id: draftSheet._id,
        batchName: draftSheet.batchName,
        totalDomains: draftSheet.totalDomains,
        status: draftSheet.status,
      },
    });
  } catch (error) {
    console.error("Move to process error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
6. Export Function

At bottom of controller:

Change:

module.exports = {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
};

To:

module.exports = {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
  moveToProcess,
};
7. Add Route

Open:

backend/routes/uploaderRoutes.js
Step 2 — Import Function

Change:

const {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
} = require("../controllers/uploaderController");

To:

const {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
  moveToProcess,
} = require("../controllers/uploaderController");
Step 3 — Add Route

Add BELOW delete route:

router.post(
  "/move-to-process",
  protect,
  authorizeRoles("uploader"),
  moveToProcess
);
8. Test Task 10
URL
POST http://localhost:5000/api/uploader/move-to-process
Headers
Authorization: Bearer YOUR_TOKEN
9. Expected Result
{
  "message": "Batch moved to process successfully",
  "batch": {
    "id": "...",
    "batchName": "Batch #1",
    "totalDomains": 1500,
    "status": "locked"
  }
}
10. Important Workflow Result

After move:

current batch closes
new uploads later create new batch

This exactly matches your workflow.

11. What Happens Internally

System:

locks batch
stores who moved it
stores move timestamp
saves history
prepares for processor workflow later
Task 10 Final Result

After this task:

shared uploader batch workflow fully works

You now have:

paste
preview
delete
move to process

complete.






Task 12 — Create New Uploader Workspace Page
Goal

Create a new Phase 2 page and keep old UploadPage.jsx as backup.

Create New File
frontend/src/pages/UploaderWorkspacePage.jsx

Paste this code:

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function UploaderWorkspacePage() {
  const [domains, setDomains] = useState("");
  const [message, setMessage] = useState("");
  const [batchInfo, setBatchInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const handlePasteDomains = async () => {
    if (!domains.trim()) {
      setMessage("Please paste domains");
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(
        "http://localhost:5000/api/uploader/paste",
        { domains },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessage(response.data.message);
      setBatchInfo(response.data.batch);
      setDomains("");
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.message || "Paste failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToProcess = async () => {
    try {
      setLoading(true);

      const response = await axios.post(
        "http://localhost:5000/api/uploader/move-to-process",
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessage(response.data.message);
      setBatchInfo(response.data.batch);
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.message || "Move failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setDomains("");
    setMessage("");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Uploader Workspace</h1>

        <p style={styles.subtitle}>
          Paste expired domains into the current open batch.
        </p>

        {batchInfo && (
          <div style={styles.batchBox}>
            <p><strong>Batch:</strong> {batchInfo.batchName}</p>
            <p><strong>Total Domains:</strong> {batchInfo.totalDomains}</p>
            <p><strong>Status:</strong> {batchInfo.status}</p>
          </div>
        )}

        <textarea
          rows="14"
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          placeholder={"example.com\nsample.net\ntest.org"}
          style={styles.textarea}
        />

        <div style={styles.buttons}>
          <button
            onClick={handlePasteDomains}
            disabled={loading}
            style={styles.primaryBtn}
          >
            {loading ? "Saving..." : "Paste Domains"}
          </button>

          <button
            onClick={() => navigate("/my-preview")}
            style={styles.secondaryBtn}
          >
            Open Preview
          </button>

          <button
            onClick={handleMoveToProcess}
            disabled={loading}
            style={styles.darkBtn}
          >
            Move To Process
          </button>
        </div>

        <button onClick={handleClear} style={styles.clearBtn}>
          Clear
        </button>

        {message && <p style={styles.message}>{message}</p>}
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
    maxWidth: "720px",
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
    marginBottom: "25px",
  },
  textarea: {
    width: "100%",
    padding: "16px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    fontSize: "15px",
    resize: "vertical",
    boxSizing: "border-box",
  },
  buttons: {
    marginTop: "25px",
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  primaryBtn: {
    padding: "13px 24px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "13px 24px",
    background: "white",
    color: "#6d28d9",
    border: "1px solid #6d28d9",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  darkBtn: {
    padding: "13px 24px",
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  clearBtn: {
    marginTop: "18px",
    background: "transparent",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    fontWeight: "600",
  },
  message: {
    marginTop: "25px",
    fontWeight: "600",
    color: "#111827",
  },
  batchBox: {
    marginBottom: "20px",
    background: "#f5f3ff",
    borderRadius: "12px",
    padding: "15px",
    textAlign: "left",
  },
};

export default UploaderWorkspacePage;
Update App.jsx

Import:

import UploaderWorkspacePage from "./pages/UploaderWorkspacePage";

Add route:

<Route path="/uploader" element={<UploaderWorkspacePage />} />

Keep old UploadPage.jsx for backup.

Task 12 Result

You now have a new Phase 2 uploader page:















Task 14 — Connect Navbar Links
Goal

Add easy navigation for Phase 2 uploader workflow.

We need links for:

Uploader Workspace
My Preview
Why

Uploader should not manually type URLs.

They should easily move:

Paste domains → Preview domains → Back to paste
Update Navbar

Open your frontend navbar file.

It may be:

frontend/src/components/Navbar.jsx

Add links like this:

<Link to="/uploader" style={styles.link}>
  Uploader
</Link>

<Link to="/my-preview" style={styles.link}>
  My Preview
</Link>
If your navbar uses normal <a>

Use:

<a href="/uploader" style={styles.link}>
  Uploader
</a>

<a href="/my-preview" style={styles.link}>
  My Preview
</a>

But better is Link from React Router.

Make sure routes exist in App.jsx
<Route path="/uploader" element={<UploaderWorkspacePage />} />
<Route path="/my-preview" element={<MyPreviewPage />} />
Task 14 Result



Task 15 — Create Frontend Login Page
1. Goal

Create a login page so frontend can:

login user
save JWT token
redirect uploader to /uploader

Without this, /my-preview gives 401 Unauthorized.

2. Create File

Create:

frontend/src/pages/LoginPage.jsx

Paste this:

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function LoginPage() {
  const [email, setEmail] = useState("uploader@gmail.com");
  const [password, setPassword] = useState("123456");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          email,
          password,
        }
      );

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));

      if (response.data.user.role === "uploader") {
        navigate("/uploader");
      } else {
        setMessage("Only uploader workflow is available now");
      }
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Login</h1>

        <p style={styles.subtitle}>
          Sign in to continue to the domain workspace.
        </p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          style={styles.primaryBtn}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        {message && <p style={styles.message}>{message}</p>}
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
    maxWidth: "420px",
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
    marginBottom: "25px",
  },
  input: {
    width: "100%",
    padding: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    marginBottom: "14px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  primaryBtn: {
    width: "100%",
    padding: "13px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  message: {
    marginTop: "20px",
    fontWeight: "600",
    color: "#111827",
  },
};

export default LoginPage;
3. Add Route in App.jsx

Import:

import LoginPage from "./pages/LoginPage";

Add route:

<Route path="/login" element={<LoginPage />} />
4. Test

Open:

http://localhost:5173/login

Login using:

uploader@gmail.com
123456

After login, it should redirect to:

/uploader








Task 16 — Full Frontend Uploader Workflow Testing
Goal

Test complete uploader workflow using frontend only.

Now frontend has:

Login page
Uploader workspace
Preview page
Delete workflow
Move to process

So we now test the entire system together.

1. Start Backend + Frontend

Backend:

npm run dev

Frontend:

npm run dev
2. Open Login Page

Open:

http://localhost:5173/login

Login using:

uploader@gmail.com
123456

Expected:

Redirect to /uploader
3. Paste Domains

Paste:

google.com
facebook.com
test.net

Click:

Paste Domains

Expected:

Domains pasted successfully

Batch box updates:

Batch #1
Total Domains: 3
Status: open
4. Open Preview

Click:

Open Preview

Expected table:

No | Domain
1  | google.com
2  | facebook.com
3  | test.net

Only your domains should appear.

5. Delete Domain

Click:

Delete

on one domain.

Expected:

Domain disappears
Batch total decreases
6. Go Back

Click:

Back

Expected:

Returns to /uploader
7. Paste More Domains

Paste again:

abc.org
newdomain.com

Expected:

Same open batch updates
8. Move To Process

Click:

Move To Process

Expected:

Batch status becomes locked
9. Paste Again After Lock

Paste new domains again.

Expected:

New batch automatically created

Example:

Batch #2
10. Multi-Uploader Test (Important)

Login using another uploader account.

Paste more domains.

Expected:

Same current open batch count increases

BUT preview page should show:

only domains added by logged uploader
Task 16 Result

Your uploader module is now fully working:

Frontend + Backend integrated
Shared batch system working
Private previews working
Delete workflow working
Move to process working