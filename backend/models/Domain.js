const mongoose = require('mongoose');
const { base } = require('./Batch');

const domainSchema = new mongoose.Schema(
    {
        domainName:{
            type:String,
            required:true,
            trim:true,
        },
        
        batchId:{
            type:mongoose.Schema.Types.ObjectId,
            ref:"Batch",
            required:true,
        },
        
    },
    {
        timestamps:true,
    }
);

module.exports = mongoose.model("Domain", domainSchema);    