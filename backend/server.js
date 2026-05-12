const express = require('express');
const cors = require("cors");
const dotenv = require("dotenv");
const batchRoutes = require("./routes/batchRoutes");
const domainRoutes = require("./routes/domainRoutes");
const uploadRoutes = require("./routes/uploadRoutes");  


const connectDB = require("./config/db");
dotenv.config();
connectDB();
const app = express();

app.use(cors());

app.use(express.json());
app.use("/api/batches", batchRoutes);
app.use("/api/domains", domainRoutes);
app.use("/api/upload", uploadRoutes);


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