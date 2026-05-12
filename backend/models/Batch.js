const mongoose =require("mongoose");

const batchSchema = new mongoose.Schema(
 {
    batchName: {
        type: String,
        required:true,
    },

    originalFileName: {
        type:String,
        required:true,
    },

    totalDomains:{
        type:Number,
        default:0,
    },
 },

    {
        timestamps:true,
    }

);

module.exports = mongoose.model("Batch", batchSchema);




