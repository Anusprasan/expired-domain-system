const express = require('express');
const cors = require("cors");
const dotenv = require("dotenv");
const batchRoutes = require("./routes/batchRoutes");
const domainRoutes = require("./routes/domainRoutes");
const uploadRoutes = require("./routes/uploadRoutes");  
const authRoutes = require("./routes/authRoutes");
const testRoutes = require("./routes/testRoutes");
const uploaderRoutes = require("./routes/uploaderRoutes");
const processorRoutes = require("./routes/processorRoutes");


const connectDB = require("./config/db");
dotenv.config();
connectDB();
const app = express();

app.use(cors());

app.use(
  express.json({
    limit: "10mb",
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);
app.use("/api/auth", authRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/domains", domainRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/test", testRoutes);
app.use("/api/uploader", uploaderRoutes);
app.use("/api/processor", processorRoutes);




// app.get("/", (req, res) => {
//     res.send("Backend server running");
// });

// app.get("/api/batches", (req, res) => {
//   res.send("Batches route working");
// });




const port = process.env.PORT || 5000;

// const PORT = 5000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});