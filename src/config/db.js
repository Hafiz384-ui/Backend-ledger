import mongoose from "mongoose";

const connectionDB = () =>{
  mongoose.connect(process.env.MONGODB_URI)
  .then(()=>{
    console.log("Database connected");
  })
  .catch((error)=>{
    console.log("Error connecting to database:", error);
    process.exit(1);
  })
}

export default connectionDB;